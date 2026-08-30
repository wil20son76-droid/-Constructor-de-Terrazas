/**
 * BOM grouping across DeckSections: proves (a) a level with no sections
 * behaves exactly as before this feature existed (regression safety), and
 * (b) a level with multiple sections using different trall materials
 * produces one separate TRALL BOM line per material, correctly priced from
 * each section's own real geometry.
 */
import { describe, expect, it } from "vitest";
import { insertPointOnEdge, rectanglePolygon, splitPolygon } from "../geometry";
import type { DeckLevel, DeckSection, Material, MaterialLibrary } from "../types";
import { computeLevelBom, computeLevelGeometry } from "./index";

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

const trallMaterial2: Material = {
  id: "trall2",
  category: "trall",
  name: "Trall premium",
  nameSv: "Trall Kebony 26x140",
  widthMm: 140,
  thicknessMm: 26,
  availableLengthsMm: [3600, 4200, 4800],
  pricePerMeter: 58,
  unit: "m",
  wastePercent: 10,
};

const library: MaterialLibrary = {
  materials: [
    trallMaterial,
    trallMaterial2,
    { id: "regel1", category: "regel", name: "Regel", nameSv: "Regel 45x95", widthMm: 45, thicknessMm: 95, availableLengthsMm: [3600, 4800], pricePerMeter: 26, unit: "m", wastePercent: 10 },
    { id: "barlina1", category: "barlina", name: "Bärlina", nameSv: "Bärlina 45x195", widthMm: 45, thicknessMm: 195, availableLengthsMm: [3600, 4800], pricePerMeter: 44, unit: "m", wastePercent: 10 },
    { id: "plintmat1", category: "plint", name: "Plint", nameSv: "Betongplint", pricePerUnit: 89, unit: "st", wastePercent: 0 },
  ],
  suppliers: [],
  fastenerSystems: [{ id: "fsys1", type: "visible_skruv", name: "Synlig skruv", screwsPerIntersection: 2 }],
  plintTypes: [{ id: "plint1", name: "Concrete", nameSv: "Betongplint", materialId: "plintmat1" }],
};

function makeTwoSections(): DeckSection[] {
  const rect = rectanglePolygon(10000, 6000);
  const withTop = insertPointOnEdge(rect.points, 0, 0.5); // (5000,0)
  const withBoth = insertPointOnEdge(withTop, 3, 0.5); // (5000,6000)
  const [right, left] = splitPolygon(withBoth, 1, 4);
  return [
    {
      id: "sec-left",
      name: "Sektion 1",
      polygon: { id: "poly_left", points: left },
      boardDirection: { mode: "horizontal", angleDeg: 0 },
      boardWidthMm: 120,
      boardThicknessMm: 28,
      boardGap: 5,
      materialId: "trall1",
      fastenerSystemId: "fsys1",
    },
    {
      id: "sec-right",
      name: "Sektion 2",
      polygon: { id: "poly_right", points: right },
      boardDirection: { mode: "custom", angleDeg: 45 },
      boardWidthMm: 140,
      boardThicknessMm: 26,
      boardGap: 5,
      materialId: "trall2",
      fastenerSystemId: "fsys1",
    },
  ];
}

describe("computeLevelGeometry — no sections (regression)", () => {
  it("behaves exactly as before: single boardLayout, no sectionLayouts, boards untagged", () => {
    const level = makeLevel();
    const geometry = computeLevelGeometry(level, library);
    expect(geometry.sectionLayouts).toBeUndefined();
    expect(geometry.boards).toBe(geometry.boardLayout.boards);
    for (const board of geometry.boards) {
      expect(board.sectionId).toBeUndefined();
      expect(board.materialId).toBeUndefined();
    }
  });
});

describe("computeLevelBom — no sections (regression)", () => {
  it("produces exactly one TRALL line, identical to the pre-sections behaviour", () => {
    const level = makeLevel();
    const { bomLines } = computeLevelBom(level, library, []);
    const trallLines = bomLines.filter((l) => l.group === "TRALL");
    expect(trallLines).toHaveLength(1);
    expect(trallLines[0].materialId).toBe("trall1");
  });
});

describe("computeLevelGeometry — with sections", () => {
  it("uses computeAllSectionsBoardLayout and tags boards with sectionId/materialId", () => {
    const level = makeLevel({ sections: makeTwoSections() });
    const geometry = computeLevelGeometry(level, library);
    expect(geometry.sectionLayouts).toHaveLength(2);
    expect(geometry.boards.length).toBeGreaterThan(0);
    const leftBoards = geometry.boards.filter((b) => b.sectionId === "sec-left");
    const rightBoards = geometry.boards.filter((b) => b.sectionId === "sec-right");
    expect(leftBoards.length).toBeGreaterThan(0);
    expect(rightBoards.length).toBeGreaterThan(0);
    for (const b of leftBoards) expect(b.materialId).toBe("trall1");
    for (const b of rightBoards) expect(b.materialId).toBe("trall2");
  });
});

describe("computeLevelBom — with sections using different trall materials", () => {
  it("produces one TRALL BOM line per distinct material, each priced from its own section's boards", () => {
    const level = makeLevel({ sections: makeTwoSections() });
    const { bomLines, geometry } = computeLevelBom(level, library, []);
    const trallLines = bomLines.filter((l) => l.group === "TRALL");
    expect(trallLines).toHaveLength(2);

    const line1 = trallLines.find((l) => l.materialId === "trall1")!;
    const line2 = trallLines.find((l) => l.materialId === "trall2")!;
    expect(line1).toBeTruthy();
    expect(line2).toBeTruthy();

    // Each line's technical linear metres must match the sum of its own section's board lengths.
    const boards1 = geometry.boards.filter((b) => b.materialId === "trall1");
    const boards2 = geometry.boards.filter((b) => b.materialId === "trall2");
    const expectedLinear1 = boards1.reduce((s, b) => s + b.lengthMm, 0) / 1000;
    const expectedLinear2 = boards2.reduce((s, b) => s + b.lengthMm, 0) / 1000;
    expect(line1.technicalLinearMeters).toBeCloseTo(expectedLinear1, 6);
    expect(line2.technicalLinearMeters).toBeCloseTo(expectedLinear2, 6);

    // Priced with each material's own price per metre (58 SEK/m for trall2 vs 32 SEK/m for trall1).
    expect(line2.pricePerUnit).toBe(58);
    expect(line1.pricePerUnit).toBe(32);
  });
});
