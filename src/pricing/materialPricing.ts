/**
 * Manual material pricing engine: migration from the old flat
 * pricePerMeter/pricePerUnit fields to the richer, user-editable
 * `Material.priceModel`, VAT normalisation, and the cost formula that
 * adapts to a material's PriceUnit — never a single hard-coded formula.
 *
 * Nothing here invents a price. A material with no price entered
 * (price === 0 and no history) computes a cost of 0 and is flagged
 * `missing: true` so callers can show "Pris saknas" instead of silently
 * reporting a wrong total — quantities are computed the same either way.
 */
import type {
  Material,
  MaterialPriceModel,
  PriceHistoryEntry,
  Project,
  ProjectMaterialOverride,
  PurchasedBoardGroup,
  StockVariant,
  VatMode,
} from "../types";
import { makeId } from "../geometry";

export const CURRENT_SCHEMA_VERSION = 2;

/**
 * Build a `MaterialPriceModel` from a Material's legacy flat fields, so an
 * old saved project (or the hard-coded seed data in data/materials.ts,
 * which is only a first-run starting point, not a fixed price list) gets a
 * priceModel the very first time it's touched. Idempotent: a Material that
 * already has a priceModel is returned unchanged.
 */
export function migrateMaterial(material: Material): Material {
  if (material.priceModel) return material;

  let priceModel: MaterialPriceModel;
  if (material.unit === "förp") {
    priceModel = {
      price: material.pricePerUnit ?? 0,
      priceUnit: "kr/förpackning",
      vatMode: "exkl",
      packageSize: material.unitsPerPackage,
      supplier: undefined,
      active: true,
    };
  } else if (material.unit === "m2") {
    priceModel = { price: material.pricePerUnit ?? material.pricePerMeter ?? 0, priceUnit: "kr/m2", vatMode: "exkl", active: true };
  } else if (material.pricePerMeter !== undefined) {
    priceModel = { price: material.pricePerMeter, priceUnit: "kr/m", vatMode: "exkl", active: true };
  } else {
    priceModel = { price: material.pricePerUnit ?? 0, priceUnit: "kr/st", vatMode: "exkl", active: true };
  }
  return { ...material, priceModel };
}

/** Migrate every material in a project's library, and stamp schemaVersion. Old saved projects keep opening unchanged, just gain a priceModel per material. */
export function migrateProject(project: Project): Project {
  if ((project.schemaVersion ?? 1) >= CURRENT_SCHEMA_VERSION && project.library.materials.every((m) => m.priceModel)) {
    return project;
  }
  return {
    ...project,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    materialOverrides: project.materialOverrides ?? [],
    library: {
      ...project.library,
      materials: project.library.materials.map(migrateMaterial),
    },
  };
}

/** Converts an entered price to excl.-moms, using vatPercent only when the price is marked "inkl". Idempotent on an already-exkl price. */
export function normalizeExklMoms(price: number, vatMode: VatMode, vatPercent: number): number {
  if (vatMode !== "inkl") return price;
  const divisor = 1 + vatPercent / 100;
  return divisor > 0 ? price / divisor : price;
}

/** Exact-length lookup — stock variants are never interpolated/extrapolated to a nearby length. */
export function findStockVariant(stockVariants: StockVariant[] | undefined, lengthMm: number): StockVariant | undefined {
  return stockVariants?.find((v) => v.lengthMm === lengthMm);
}

/**
 * The effective price model for a material inside one project: a
 * ProjectMaterialOverride (locked "Lås pris i projekt", or an unlocked
 * per-project-only tweak) always wins over the shared library's current
 * priceModel — see FASE B for how the library's *current* price reaches
 * here when there's no override.
 */
export function resolveEffectivePriceModel(material: Material, override: ProjectMaterialOverride | undefined): MaterialPriceModel {
  const base = material.priceModel ?? migrateMaterial(material).priceModel!;
  if (!override) return base;
  return {
    ...base,
    price: override.price,
    priceUnit: override.priceUnit,
    vatMode: override.vatMode,
    supplier: override.supplier ?? base.supplier,
  };
}

export interface PurchaseCostResult {
  /** Excl.-moms cost of this purchase. */
  cost: number;
  /** True if the cost above is 0 purely because no price is on file (as opposed to a genuinely free/customer-supplied item). */
  missing: boolean;
  priceUnit: import("../types").PriceUnit;
  supplier?: string;
  /** Populated when the effective priceUnit is "kr/m2" (purchased AREA, m², after any package rounding). */
  purchaseAreaM2?: number;
}

export interface LumberCostInput {
  priceModel: MaterialPriceModel;
  /** From CutPlanResult.purchasedBreakdown — required quantities/counts are NEVER altered here, only how their cost is priced. */
  byLength: PurchasedBoardGroup[];
  vatPercent: number;
  /** Board face width, mm — required only when priceUnit is "kr/m2" (area = length x width per board). */
  widthMm?: number;
}

/**
 * Resolves the excl.-moms cost of a lumber/board purchase, using the
 * priceModel's formula for its PriceUnit — see the module doc: never a
 * single hard-coded "price/m x length" assumption. `vatPercent` is only
 * used to normalise an "inkl. moms" price.
 *
 * `byLength` is used to look up a StockVariant per purchased length when
 * present; a length with no matching variant is flagged `missing` rather
 * than falling back to the base rate (that would silently misprice a
 * material the user has explicitly given per-length prices for).
 */
export function resolveLumberPurchaseCost({ priceModel, byLength, vatPercent, widthMm }: LumberCostInput): PurchaseCostResult {
  const supplier = priceModel.supplier;
  if (priceModel.stockVariants && priceModel.stockVariants.length > 0) {
    let cost = 0;
    let missing = false;
    for (const group of byLength) {
      const variant = findStockVariant(priceModel.stockVariants, group.lengthMm);
      if (!variant) {
        missing = true;
        continue;
      }
      const perPiece =
        variant.priceUnit === "kr/m" || variant.priceUnit === "kr/lm"
          ? normalizeExklMoms(variant.price, variant.vatMode ?? priceModel.vatMode, vatPercent) * (group.lengthMm / 1000)
          : normalizeExklMoms(variant.price, variant.vatMode ?? priceModel.vatMode, vatPercent);
      cost += perPiece * group.count;
    }
    if (cost === 0 && !missing) missing = priceModel.price === 0;
    return { cost, missing, priceUnit: "kr/st", supplier };
  }

  const exklPrice = normalizeExklMoms(priceModel.price, priceModel.vatMode, vatPercent);
  const totalPieces = byLength.reduce((s, g) => s + g.count, 0);
  const totalLengthMm = byLength.reduce((s, g) => s + g.lengthMm * g.count, 0);

  if (priceModel.priceUnit === "kr/m2" && widthMm) {
    const rawAreaM2 = (totalLengthMm * widthMm) / 1_000_000;
    if (priceModel.packageSize && priceModel.packageSize > 0) {
      const boxes = Math.ceil(rawAreaM2 / priceModel.packageSize);
      const purchaseAreaM2 = boxes * priceModel.packageSize;
      return { cost: exklPrice * purchaseAreaM2, missing: exklPrice === 0, priceUnit: "kr/m2", supplier, purchaseAreaM2 };
    }
    return { cost: exklPrice * rawAreaM2, missing: exklPrice === 0, priceUnit: "kr/m2", supplier, purchaseAreaM2: rawAreaM2 };
  }
  if (priceModel.priceUnit === "kr/m" || priceModel.priceUnit === "kr/lm") {
    return { cost: exklPrice * (totalLengthMm / 1000), missing: exklPrice === 0, priceUnit: priceModel.priceUnit, supplier };
  }
  // "kr/st" (or any other unit misapplied to a lineal material): flat per-piece price regardless of length.
  return { cost: exklPrice * totalPieces, missing: exklPrice === 0, priceUnit: "kr/st", supplier };
}

/** Same cost formula for a non-lineal (unit/package/area) purchase — see the module doc for the per-PriceUnit formulas. */
export function resolveUnitPurchaseCost(
  priceModel: MaterialPriceModel,
  technicalQuantity: number,
  purchaseQuantityPieces: number,
  vatPercent: number,
): PurchaseCostResult & { purchaseQuantity: number } {
  const exklPrice = normalizeExklMoms(priceModel.price, priceModel.vatMode, vatPercent);
  const supplier = priceModel.supplier;
  const missing = exklPrice === 0;

  if (priceModel.priceUnit === "kr/förpackning") {
    const packageSize = priceModel.packageSize && priceModel.packageSize > 0 ? priceModel.packageSize : 1;
    const packages = Math.ceil(technicalQuantity / packageSize);
    return { cost: exklPrice * packages, missing, priceUnit: priceModel.priceUnit, supplier, purchaseQuantity: packages };
  }
  if (priceModel.priceUnit === "kr/m2") {
    // technicalQuantity/purchaseQuantityPieces are already in m² for area-priced materials — see materials/index.ts.
    if (priceModel.packageSize && priceModel.packageSize > 0) {
      const boxes = Math.ceil(technicalQuantity / priceModel.packageSize);
      return { cost: exklPrice * boxes * priceModel.packageSize, missing, priceUnit: priceModel.priceUnit, supplier, purchaseQuantity: boxes };
    }
    return { cost: exklPrice * purchaseQuantityPieces, missing, priceUnit: priceModel.priceUnit, supplier, purchaseQuantity: purchaseQuantityPieces };
  }
  // kr/st, kr/kg, kr/set: flat price x purchased count.
  return { cost: exklPrice * purchaseQuantityPieces, missing, priceUnit: priceModel.priceUnit, supplier, purchaseQuantity: purchaseQuantityPieces };
}

/** Records a price change in priceHistory (only when it actually changed) and stamps lastUpdated. */
export function recordPriceChange(priceModel: MaterialPriceModel, newPrice: number): MaterialPriceModel {
  const today = new Date().toISOString().slice(0, 10);
  if (newPrice === priceModel.price) return { ...priceModel, lastUpdated: priceModel.lastUpdated ?? today };
  const entry: PriceHistoryEntry = { date: today, price: priceModel.price };
  const priceHistory = [...(priceModel.priceHistory ?? []), entry];
  return { ...priceModel, price: newPrice, lastUpdated: today, priceHistory };
}

export function makeStockVariant(partial: Partial<StockVariant> & Pick<StockVariant, "lengthMm" | "price">): StockVariant {
  return { id: makeId("variant"), priceUnit: "kr/st", ...partial };
}
