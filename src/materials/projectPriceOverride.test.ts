/**
 * Project-level price overrides ("Lås pris i projekt" / "Endast detta
 * projekt") flowing all the way through computeLevelBom, plus the
 * required case F (customerProvided) at the same integration level.
 */
import { describe, expect, it } from "vitest";
import { rectanglePolygon } from "../geometry";
import type { DeckLevel, Material, MaterialLibrary } from "../types";
import { computeLevelBom, defaultPricingContext } from "./index";

function makeLevel(overrides: Partial<DeckLevel> = {}): DeckLevel {
  return {
    id: "lvl1",
    name: "Nivå 1",
    heightAboveGround: 200,
    polygon: rectanglePolygon(2000, 2000),
    openings: [],
    boardDirection: { mode: "horizontal", angleDeg: 0 },
    boardGap: 5,
    trallMaterialId: "trall1",
    regelMaterialId: "regel1",
    regelSpacing: 600,
    barlinaMaterialId: "barlina1",
    barlinaMaxSpacing: 2000,
    plintTypeId: "plint1",
    plintMaxSpacing: 1800,
    fastenerSystemId: "fsys1",
    stairs: [],
    edgeBoards: [],
    wallEdgeIndices: [],
    openEdgeIndices: [],
    ...overrides,
  };
}

const trallMaterial: Material = {
  id: "trall1",
  category: "trall",
  name: "Trall",
  nameSv: "Trall 28x120",
  widthMm: 120,
  thicknessMm: 28,
  availableLengthsMm: [3600, 4200, 4800, 5400],
  priceModel: { price: 32, priceUnit: "kr/m", vatMode: "exkl", active: true },
  wastePercent: 10,
};

const library: MaterialLibrary = {
  materials: [
    trallMaterial,
    {
      id: "regel1",
      category: "regel",
      name: "Regel",
      nameSv: "Regel 45x95",
      widthMm: 45,
      thicknessMm: 95,
      availableLengthsMm: [3600, 4800],
      priceModel: { price: 26, priceUnit: "kr/m", vatMode: "exkl", active: true },
      wastePercent: 10,
    },
    {
      id: "barlina1",
      category: "barlina",
      name: "Bärlina",
      nameSv: "Bärlina 45x195",
      widthMm: 45,
      thicknessMm: 195,
      availableLengthsMm: [3600, 4800],
      priceModel: { price: 44, priceUnit: "kr/m", vatMode: "exkl", active: true },
      wastePercent: 10,
    },
    {
      id: "plintmat1",
      category: "plint",
      name: "Plint",
      nameSv: "Betongplint",
      priceModel: { price: 89, priceUnit: "kr/st", vatMode: "exkl", active: true },
      unit: "st",
      wastePercent: 0,
    },
  ],
  suppliers: [],
  fastenerSystems: [{ id: "fsys1", type: "visible_skruv", name: "Synlig skruv", screwsPerIntersection: 2 }],
  plintTypes: [{ id: "plint1", name: "Concrete", nameSv: "Betongplint", materialId: "plintmat1" }],
};

describe("case H — current library price (no override)", () => {
  it("uses the material's own priceModel price when there is no project override", () => {
    const level = makeLevel();
    const { bomLines } = computeLevelBom(level, library, [], defaultPricingContext());
    const trallLine = bomLines.find((l) => l.materialId === "trall1")!;
    expect(trallLine.purchaseTotal).toBeCloseTo(trallLine.purchaseLinearMeters! * 32, 6);
    expect(trallLine.priceIsOverride).toBeFalsy();
  });
});

describe("case G — locked project price overrides the library price", () => {
  it("a project override changes the cost even though the library material itself is unchanged", () => {
    const level = makeLevel();
    const overridden = computeLevelBom(level, library, [], {
      ...defaultPricingContext(),
      materialOverrides: [{ materialId: "trall1", price: 999, priceUnit: "kr/m", vatMode: "exkl", locked: true }],
    });
    const trallLine = overridden.bomLines.find((l) => l.materialId === "trall1")!;
    expect(trallLine.purchaseTotal).toBeCloseTo(trallLine.purchaseLinearMeters! * 999, 6);
    expect(trallLine.priceIsOverride).toBe(true);
    // Quantities are untouched by the override — only cost changes.
    const baseline = computeLevelBom(level, library, [], defaultPricingContext());
    const baselineTrall = baseline.bomLines.find((l) => l.materialId === "trall1")!;
    expect(trallLine.technicalQuantity).toBe(baselineTrall.technicalQuantity);
    expect(trallLine.purchaseQuantity).toBe(baselineTrall.purchaseQuantity);
  });

  it("an UNLOCKED override ('Endast detta projekt') also takes priority over the library price", () => {
    const level = makeLevel();
    const { bomLines } = computeLevelBom(level, library, [], {
      ...defaultPricingContext(),
      materialOverrides: [{ materialId: "trall1", price: 50, priceUnit: "kr/m", vatMode: "exkl", locked: false }],
    });
    const trallLine = bomLines.find((l) => l.materialId === "trall1")!;
    expect(trallLine.purchaseTotal).toBeCloseTo(trallLine.purchaseLinearMeters! * 50, 6);
  });
});

describe("case F — customerProvided (kund tillhandahåller)", () => {
  it("cost is 0 for the contractor even when a price is on file, but quantities remain real", () => {
    const level = makeLevel();
    const { bomLines } = computeLevelBom(level, library, ["trall1"], defaultPricingContext());
    const trallLine = bomLines.find((l) => l.materialId === "trall1")!;
    expect(trallLine.suppliedByClient).toBe(true);
    expect(trallLine.technicalQuantity).toBeGreaterThan(0);
    expect(trallLine.purchaseQuantity).toBeGreaterThan(0);
    // purchaseTotal is still computed (informational) but excluded from the priced total elsewhere (see pricing/index.ts computeMaterialCost).
    const materialTotal = bomLines.filter((l) => !l.suppliedByClient).reduce((s, l) => s + l.purchaseTotal, 0);
    expect(bomLines.filter((l) => !l.suppliedByClient).some((l) => l.materialId === "trall1")).toBe(false);
    expect(materialTotal).toBeGreaterThan(0); // other lines still contribute
  });
});
