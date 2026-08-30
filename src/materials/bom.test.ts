import { describe, expect, it } from "vitest";
import { rectanglePolygon } from "../geometry";
import type { DeckLevel, Material, MaterialLibrary } from "../types";
import { computeLevelBom } from "./index";

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
  pricePerMeter: 32,
  unit: "m",
  wastePercent: 10,
};

const library: MaterialLibrary = {
  materials: [
    trallMaterial,
    { id: "regel1", category: "regel", name: "Regel", nameSv: "Regel 45x95", widthMm: 45, thicknessMm: 95, availableLengthsMm: [3600, 4800], pricePerMeter: 26, unit: "m", wastePercent: 10 },
    { id: "barlina1", category: "barlina", name: "Bärlina", nameSv: "Bärlina 45x195", widthMm: 45, thicknessMm: 195, availableLengthsMm: [3600, 4800], pricePerMeter: 44, unit: "m", wastePercent: 10 },
    { id: "plintmat1", category: "plint", name: "Plint", nameSv: "Betongplint", pricePerUnit: 89, unit: "st", wastePercent: 0 },
  ],
  suppliers: [],
  fastenerSystems: [{ id: "fsys1", type: "visible_skruv", name: "Synlig skruv", screwsPerIntersection: 2 }],
  plintTypes: [{ id: "plint1", name: "Concrete", nameSv: "Betongplint", materialId: "plintmat1" }],
};

describe("computeLevelBom — technical vs purchase quantity", () => {
  it("keeps technical (design) quantity separate from purchase (buyable) quantity", () => {
    const level = makeLevel();
    const { bomLines } = computeLevelBom(level, library, []);
    const trallLine = bomLines.find((l) => l.materialId === "trall1")!;
    expect(trallLine).toBeTruthy();
    // Technical: what the design needs, unrounded to commercial lengths.
    expect(trallLine.technicalLinearMeters).toBeGreaterThan(0);
    // Purchase: what must actually be bought (rounded up to whole boards) — always >= technical.
    expect(trallLine.purchaseLinearMeters!).toBeGreaterThanOrEqual(trallLine.technicalLinearMeters!);
    // Cost must be computed from PURCHASE quantity, not technical.
    const expectedPurchaseCost = trallLine.purchaseLinearMeters! * trallLine.pricePerUnit;
    expect(trallLine.purchaseTotal).toBeCloseTo(expectedPurchaseCost, 6);
    // technicalCost (informational, matches the plan) must differ from purchaseTotal
    // whenever purchased length exceeds required length (the common case).
    if (trallLine.purchaseLinearMeters! > trallLine.technicalLinearMeters!) {
      expect(trallLine.purchaseTotal).toBeGreaterThan(trallLine.technicalCost);
    }
  });

  it("provides a purchase breakdown by stock length for lumber lines", () => {
    const level = makeLevel();
    const { bomLines } = computeLevelBom(level, library, []);
    const trallLine = bomLines.find((l) => l.materialId === "trall1")!;
    expect(trallLine.purchaseBreakdown).toBeDefined();
    const sumFromBreakdown = trallLine.purchaseBreakdown!.reduce((s, g) => s + g.count, 0);
    expect(sumFromBreakdown).toBe(trallLine.purchaseQuantity);
  });
});

describe("computeLevelBom — kund tillhandahåller (client-supplied material)", () => {
  it("keeps a client-supplied material in the BOM and quantities, but at zero contractor cost", () => {
    const level = makeLevel();
    const withoutClientSupply = computeLevelBom(level, library, []);
    const withClientSupply = computeLevelBom(level, library, ["trall1"]);

    const lineWithout = withoutClientSupply.bomLines.find((l) => l.materialId === "trall1")!;
    const lineWith = withClientSupply.bomLines.find((l) => l.materialId === "trall1")!;

    // Still appears in the BOM with the same quantities (informational).
    expect(lineWith).toBeTruthy();
    expect(lineWith.technicalQuantity).toBe(lineWithout.technicalQuantity);
    expect(lineWith.purchaseQuantity).toBe(lineWithout.purchaseQuantity);
    expect(lineWith.suppliedByClient).toBe(true);

    // But contributes 0 to the priced material total.
    const otherLinesTotal = withClientSupply.bomLines
      .filter((l) => l.materialId !== "trall1" && !l.suppliedByClient)
      .reduce((s, l) => s + l.purchaseTotal, 0);
    const totalExcludingClientSupplied = withClientSupply.bomLines
      .filter((l) => !l.suppliedByClient)
      .reduce((s, l) => s + l.purchaseTotal, 0);
    expect(totalExcludingClientSupplied).toBeCloseTo(otherLinesTotal, 6);
    // The client-supplied line's own cost must not appear in that total at all.
    expect(withClientSupply.bomLines.filter((l) => !l.suppliedByClient)).not.toContainEqual(lineWith);
  });
});
