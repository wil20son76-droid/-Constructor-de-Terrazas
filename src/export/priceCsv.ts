/**
 * Price list CSV import/export. One row per material's base price, PLUS
 * one extra row per StockVariant (same materialId, its own lengthMm) —
 * so a material with per-length pricing round-trips exactly. Import only
 * ever UPDATES a material that already exists in the library (matched by
 * materialId): the CSV alone doesn't carry enough (category, cross-
 * section, available lengths) to safely create a brand-new material, so
 * an unknown id is reported as an error and skipped rather than guessed
 * at — this is what "must not break the existing library" means here.
 */
import type { Material, MaterialPriceModel, PriceUnit, StockVariant, VatMode } from "../types";
import { toCsv } from "./index";
import { makeId } from "../geometry";

export const PRICE_CSV_HEADERS = [
  "materialId",
  "name",
  "dimension",
  "stockLengthMm",
  "price",
  "priceUnit",
  "supplier",
  "sku",
  "vatIncluded",
  "lastUpdated",
];

const VALID_PRICE_UNITS: PriceUnit[] = ["kr/st", "kr/m", "kr/lm", "kr/m2", "kr/förpackning", "kr/kg", "kr/set"];

function dimensionOf(m: Material): string {
  return m.widthMm && m.thicknessMm ? `${m.widthMm}x${m.thicknessMm}` : "";
}

export function materialsToPriceCsv(materials: Material[]): string {
  const rows: (string | number | undefined)[][] = [];
  for (const m of materials) {
    const pm = m.priceModel;
    if (!pm) continue;
    rows.push([m.id, m.nameSv, dimensionOf(m), "", pm.price, pm.priceUnit, pm.supplier, m.sku, pm.vatMode === "inkl" ? "Ja" : "Nej", pm.lastUpdated]);
    for (const v of pm.stockVariants ?? []) {
      rows.push([
        m.id,
        m.nameSv,
        dimensionOf(m),
        v.lengthMm,
        v.price,
        v.priceUnit,
        v.supplier ?? pm.supplier,
        v.sku ?? m.sku,
        (v.vatMode ?? pm.vatMode) === "inkl" ? "Ja" : "Nej",
        pm.lastUpdated,
      ]);
    }
  }
  return toCsv(PRICE_CSV_HEADERS, rows);
}

/** Minimal RFC4180-ish parser matching export/index.ts's `;`-delimited, `"`-quoted dialect. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  const normalized = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i];
    if (inQuotes) {
      if (c === '"' && normalized[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ";") {
      pushField();
    } else if (c === "\n") {
      pushRow();
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

export interface PriceCsvImportResult {
  materials: Material[];
  updatedCount: number;
  errors: string[];
}

function parsePriceUnit(raw: string, rowNumber: number, errors: string[]): PriceUnit | null {
  const trimmed = raw.trim();
  if (VALID_PRICE_UNITS.includes(trimmed as PriceUnit)) return trimmed as PriceUnit;
  errors.push(`Rad ${rowNumber}: okänd prisenhet "${raw}" — raden hoppades över.`);
  return null;
}

function parsePriceValue(raw: string, rowNumber: number, errors: string[]): number | null {
  const n = Number(raw.replace(",", "."));
  if (Number.isNaN(n) || n < 0) {
    errors.push(`Rad ${rowNumber}: ogiltigt pris "${raw}" — raden hoppades över.`);
    return null;
  }
  return n;
}

function parseVatMode(raw: string): VatMode {
  const v = raw.trim().toLowerCase();
  return v === "ja" || v === "true" || v === "yes" ? "inkl" : "exkl";
}

/**
 * Parses a price-list CSV and applies it to `existingLibrary`, matched by
 * materialId. Never mutates its input; returns a NEW library array plus
 * any rows that couldn't be applied (bad price/unit, unknown material id)
 * so the caller can show them without losing the rows that DID parse.
 */
export function parsePriceCsv(csvText: string, existingLibrary: Material[]): PriceCsvImportResult {
  const rows = parseCsvRows(csvText);
  if (rows.length === 0) return { materials: existingLibrary, updatedCount: 0, errors: ["Filen är tom."] };

  const header = rows[0].map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const idxId = col("materialId");
  const idxPrice = col("price");
  const idxUnit = col("priceUnit");
  if (idxId === -1 || idxPrice === -1 || idxUnit === -1) {
    return { materials: existingLibrary, updatedCount: 0, errors: ['CSV-huvudet saknar obligatoriska kolumner ("materialId", "price", "priceUnit").'] };
  }
  const idxLength = col("stockLengthMm");
  const idxSupplier = col("supplier");
  const idxSku = col("sku");
  const idxVat = col("vatIncluded");
  const idxUpdated = col("lastUpdated");

  const errors: string[] = [];
  const byId = new Map(existingLibrary.map((m) => [m.id, m]));
  const updatedIds = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const rowNumber = i + 1;
    const cells = rows[i];
    const materialId = cells[idxId]?.trim();
    if (!materialId) continue;
    const material = byId.get(materialId);
    if (!material) {
      errors.push(`Rad ${rowNumber}: okänt material-id "${materialId}" — importera bara priser för material som redan finns i biblioteket.`);
      continue;
    }
    const price = parsePriceValue(cells[idxPrice] ?? "", rowNumber, errors);
    const priceUnit = parsePriceUnit(cells[idxUnit] ?? "", rowNumber, errors);
    if (price === null || priceUnit === null) continue;

    const supplier = idxSupplier !== -1 ? cells[idxSupplier]?.trim() || undefined : undefined;
    const sku = idxSku !== -1 ? cells[idxSku]?.trim() || undefined : undefined;
    const vatMode = idxVat !== -1 ? parseVatMode(cells[idxVat] ?? "") : "exkl";
    const lastUpdated = idxUpdated !== -1 ? cells[idxUpdated]?.trim() || undefined : undefined;
    const lengthRaw = idxLength !== -1 ? cells[idxLength]?.trim() : "";
    const lengthMm = lengthRaw ? Number(lengthRaw) : NaN;

    const base: MaterialPriceModel = material.priceModel ?? { price: 0, priceUnit: "kr/st", vatMode: "exkl", active: true };

    if (!lengthRaw || Number.isNaN(lengthMm)) {
      byId.set(materialId, { ...material, priceModel: { ...base, price, priceUnit, vatMode, supplier: supplier ?? base.supplier, sku: sku ?? base.sku, lastUpdated } });
    } else {
      const variants = base.stockVariants ?? [];
      const existingVariant = variants.find((v) => v.lengthMm === lengthMm);
      const variant: StockVariant = { id: existingVariant?.id ?? makeId("variant"), lengthMm, price, priceUnit, vatMode, supplier, sku };
      const nextVariants = existingVariant ? variants.map((v) => (v.lengthMm === lengthMm ? variant : v)) : [...variants, variant];
      byId.set(materialId, { ...material, priceModel: { ...base, stockVariants: nextVariants, lastUpdated: lastUpdated ?? base.lastUpdated } });
    }
    updatedIds.add(materialId);
  }

  return { materials: existingLibrary.map((m) => byId.get(m.id) ?? m), updatedCount: updatedIds.size, errors };
}
