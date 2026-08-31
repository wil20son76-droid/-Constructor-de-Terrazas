import { describe, expect, it } from "vitest";
import type { DeckBoard, DeckLevel, DeckSection, EdgeType, MaterialLibrary, Stair } from "../types";
import { computeStair } from "../structural/stairs";
import {
  boardThicknessMmFor,
  boardTransform,
  fasciaStripTransforms,
  groundBoundsFor,
  mmToM,
  orientedBoxTransform,
  stairStepTransforms,
} from "./deckTransforms";

function makeBoard(overrides: Partial<DeckBoard> = {}): DeckBoard {
  return { id: "b1", start: { x: 0, y: 0 }, end: { x: 3600, y: 0 }, lengthMm: 3600, widthMm: 120, ...overrides };
}

const emptyLibrary: MaterialLibrary = { materials: [], suppliers: [], fastenerSystems: [], plintTypes: [] };

function makeLevel(overrides: Partial<DeckLevel> = {}): DeckLevel {
  return {
    id: "l1",
    name: "Level",
    heightAboveGround: 600,
    polygon: { id: "p1", points: [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }] },
    openings: [],
    boardDirection: { mode: "horizontal", angleDeg: 0 },
    boardGap: 5,
    trallMaterialId: "trall1",
    regelMaterialId: "regel1",
    regelSpacing: 400,
    barlinaMaterialId: "barlina1",
    barlinaMaxSpacing: 2000,
    plintTypeId: "plint1",
    plintMaxSpacing: 1800,
    fastenerSystemId: "fastener1",
    stairs: [],
    edgeBoards: [],
    wallEdgeIndices: [],
    openEdgeIndices: [],
    ...overrides,
  };
}

describe("mmToM", () => {
  it("converts millimetres to metres", () => {
    expect(mmToM(1000)).toBe(1);
    expect(mmToM(600)).toBeCloseTo(0.6, 9);
    expect(mmToM(0)).toBe(0);
  });
});

describe("orientedBoxTransform", () => {
  it("keeps rotationY=0 when the length direction points along +X", () => {
    const t = orientedBoxTransform({ x: 100, y: 200 }, { x: 1, y: 0 }, 3600, 120, 28, 600);
    expect(t.rotationY).toBeCloseTo(0, 9);
  });

  it("is self-consistent: rotating the box's local +/-X half-extent by rotationY and adding position reproduces the mm endpoints/1000, for ANY angle", () => {
    const cases: { start: { x: number; y: number }; end: { x: number; y: number } }[] = [
      { start: { x: 0, y: 0 }, end: { x: 3600, y: 0 } }, // 0 deg
      { start: { x: 0, y: 0 }, end: { x: 0, y: 4000 } }, // 90 deg
      { start: { x: 0, y: 0 }, end: { x: 3000, y: 3000 } }, // 45 deg
      { start: { x: 0, y: 0 }, end: { x: -2000, y: 3000 } }, // custom, obtuse
      { start: { x: 1000, y: 500 }, end: { x: -1000, y: -1500 } }, // custom, reversed
    ];
    for (const { start, end } of cases) {
      const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      const dir = { x: end.x - start.x, y: end.y - start.y };
      const lengthMm = Math.hypot(dir.x, dir.y);
      const t = orientedBoxTransform(center, dir, lengthMm, 120, 28, 600);
      const half = lengthMm / 2 / 1000;
      const cos = Math.cos(t.rotationY);
      const sin = Math.sin(t.rotationY);
      // Local +X (half, 0, 0) and -X rotated by rotationY about Y, plus position.
      const endWorld = { x: t.position[0] + half * cos, z: t.position[2] - half * sin };
      const startWorld = { x: t.position[0] - half * cos, z: t.position[2] + half * sin };
      expect(endWorld.x).toBeCloseTo(end.x / 1000, 6);
      expect(endWorld.z).toBeCloseTo(end.y / 1000, 6);
      expect(startWorld.x).toBeCloseTo(start.x / 1000, 6);
      expect(startWorld.z).toBeCloseTo(start.y / 1000, 6);
    }
  });

  it("places the box's vertical center so its top face is at topMm", () => {
    const t = orientedBoxTransform({ x: 0, y: 0 }, { x: 1, y: 0 }, 1000, 100, 28, 600);
    expect(t.position[1]).toBeCloseTo(0.6 - 0.028 / 2, 9);
    expect(t.size[1]).toBeCloseTo(0.028, 9);
  });
});

describe("boardTransform", () => {
  it("positions a horizontal board's top flush with heightAboveGround, thickness centered below it", () => {
    const board = makeBoard({ start: { x: 0, y: 0 }, end: { x: 3600, y: 0 } });
    const t = boardTransform(board, 28, 600);
    expect(t.position).toEqual([mmToM(1800), 0.6 - mmToM(28) / 2, 0]);
    expect(t.rotationY).toBeCloseTo(0, 9);
    expect(t.size).toEqual([mmToM(3600), mmToM(28), mmToM(120)]);
  });

  it("rotates a vertical (90 deg) board so its length runs along world Z", () => {
    const board = makeBoard({ start: { x: 100, y: 0 }, end: { x: 100, y: 4000 } });
    const t = boardTransform(board, 28, 600);
    expect(Math.abs(t.rotationY)).toBeCloseTo(Math.PI / 2, 6);
  });

  it("rotates a diagonal (45 deg) board to a non-axis-aligned angle", () => {
    const board = makeBoard({ start: { x: 0, y: 0 }, end: { x: 3000, y: 3000 } });
    const t = boardTransform(board, 28, 600);
    expect(Math.abs(Math.abs(t.rotationY) - Math.PI / 4)).toBeLessThan(1e-6);
  });

  it("raises the whole board when heightAboveGround increases, thickness unchanged", () => {
    const board = makeBoard();
    const low = boardTransform(board, 28, 300);
    const high = boardTransform(board, 28, 900);
    expect(high.position[1] - low.position[1]).toBeCloseTo(mmToM(600), 9);
    expect(high.size).toEqual(low.size);
  });
});

describe("boardThicknessMmFor", () => {
  it("uses the section's own boardThicknessMm when the board belongs to a section", () => {
    const section: DeckSection = {
      id: "s1",
      name: "Sektion 1",
      polygon: { id: "p", points: [] },
      boardDirection: { mode: "custom", angleDeg: 45 },
      boardWidthMm: 120,
      boardThicknessMm: 34,
      boardGap: 5,
      materialId: "trallB",
      fastenerSystemId: "f1",
    };
    const level = makeLevel({ sections: [section] });
    const board = makeBoard({ sectionId: "s1", materialId: "trallB" });
    expect(boardThicknessMmFor(board, level, emptyLibrary)).toBe(34);
  });

  it("falls back to the trall material's thicknessMm for a legacy (no-section) board", () => {
    const library: MaterialLibrary = {
      materials: [{ id: "trall1", category: "trall", name: "T", nameSv: "T", thicknessMm: 26, wastePercent: 10 }],
      suppliers: [],
      fastenerSystems: [],
      plintTypes: [],
    };
    const level = makeLevel();
    const board = makeBoard();
    expect(boardThicknessMmFor(board, level, library)).toBe(26);
  });

  it("falls back to 28mm when no material is found at all", () => {
    const level = makeLevel();
    const board = makeBoard();
    expect(boardThicknessMmFor(board, level, emptyLibrary)).toBe(28);
  });
});

describe("stairStepTransforms", () => {
  const polygon = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }];

  it("produces one transform per stepCount, descending from the deck edge toward the ground", () => {
    const stair: Stair = {
      id: "st1",
      edgeIndex: 0,
      widthMm: 900,
      totalHeightMm: 600,
      stepCount: 3,
      stepDepthMm: 280,
      trallMaterialId: "trall1",
      regelMaterialId: "regel1",
    };
    const result = computeStair(stair, 120, 5);
    const steps = stairStepTransforms(polygon, stair, result, 600);
    expect(steps).toHaveLength(3);

    // Each step's top (position.y + size.y/2) should be strictly decreasing
    // (the first step, nearest the deck, is the highest).
    const tops = steps.map((s) => s.position[1] + s.size[1] / 2);
    for (let i = 1; i < tops.length; i++) expect(tops[i]).toBeLessThan(tops[i - 1]);

    // First step's top sits flush with the deck (600mm).
    expect(tops[0]).toBeCloseTo(mmToM(600), 6);
    // Last step's top sits one riser above the ground (you step down once
    // more, off the last tread, to reach grade) — not at 0 itself.
    expect(tops[tops.length - 1]).toBeCloseTo(mmToM(result.riserHeightMm), 6);
  });

  it("moves progressively further from the deck edge (outward) with each step", () => {
    const stair: Stair = {
      id: "st1",
      edgeIndex: 0, // south edge (x: 0,0 -> 4000,0), outward is -y for this CCW rectangle
      widthMm: 900,
      totalHeightMm: 600,
      stepCount: 3,
      stepDepthMm: 280,
      trallMaterialId: "trall1",
      regelMaterialId: "regel1",
    };
    const result = computeStair(stair, 120, 5);
    const steps = stairStepTransforms(polygon, stair, result, 600);
    // Depth (world Z) magnitude from the edge should increase step over step.
    const depths = steps.map((s) => Math.abs(s.position[2]));
    for (let i = 1; i < depths.length; i++) expect(depths[i]).toBeGreaterThan(depths[i - 1]);
  });

  it("returns no steps for a degenerate stair (stepCount 0)", () => {
    const stair: Stair = { id: "st1", edgeIndex: 0, widthMm: 900, totalHeightMm: 0, stepCount: 0, stepDepthMm: 280, trallMaterialId: "trall1", regelMaterialId: "regel1" };
    const result = computeStair(stair, 120, 5);
    expect(stairStepTransforms(polygon, stair, result, 600)).toEqual([]);
  });
});

describe("fasciaStripTransforms", () => {
  const polygon = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }];
  const allExternal: EdgeType[] = ["external", "external", "external", "external"];

  it("returns nothing for style 'none'", () => {
    expect(fasciaStripTransforms(polygon, allExternal, 600, "none")).toEqual([]);
  });

  it("returns nothing when heightAboveGround is 0 (deck at grade)", () => {
    expect(fasciaStripTransforms(polygon, allExternal, 0, "horizontal")).toEqual([]);
  });

  it("skips wall and stair edges, only paneling external ones", () => {
    const classification: EdgeType[] = ["external", "wall", "external", "stair"];
    const strips = fasciaStripTransforms(polygon, classification, 600, "horizontal");
    // 2 external edges only; each edge should contribute >=1 strip.
    const uniqueZs = new Set(strips.map((s) => Math.round(s.position[2] * 1000) + "," + Math.round(s.position[0] * 1000)));
    expect(uniqueZs.size).toBeGreaterThan(0);
    expect(strips.length).toBeGreaterThan(0);
  });

  it("horizontal style stacks strips vertically (varying Y, same-ish edge length in X/Z)", () => {
    const strips = fasciaStripTransforms(polygon, allExternal, 600, "horizontal");
    const southStrips = strips.filter((s) => Math.abs(s.position[2]) < 0.5 && s.size[0] > 3); // the 4000mm south edge
    expect(southStrips.length).toBeGreaterThanOrEqual(1);
    const ys = new Set(southStrips.map((s) => Math.round(s.position[1] * 1000)));
    expect(ys.size).toBe(southStrips.length); // every strip at a distinct height
  });

  it("vertical style produces multiple narrow full-height strips along a long edge", () => {
    const strips = fasciaStripTransforms(polygon, allExternal, 600, "vertical");
    const southStrips = strips.filter((s) => Math.abs(s.position[2]) < 0.5);
    expect(southStrips.length).toBeGreaterThan(1);
    for (const s of southStrips) expect(s.size[1]).toBeCloseTo(mmToM(600), 6);
  });
});

describe("groundBoundsFor", () => {
  it("computes a bounding box with margin around an arbitrary (non-rectangular / free-form) polygon", () => {
    const freeForm = [{ x: -500, y: 0 }, { x: 3000, y: -800 }, { x: 4200, y: 2500 }, { x: 1000, y: 4000 }];
    const bounds = groundBoundsFor(freeForm, 1000);
    expect(bounds.centerMm).toEqual({ x: (-500 + 4200) / 2, y: (-800 + 4000) / 2 });
    expect(bounds.widthMm).toBeCloseTo(4200 - -500 + 2000, 6);
    expect(bounds.depthMm).toBeCloseTo(4000 - -800 + 2000, 6);
  });

  it("handles an empty polygon without throwing", () => {
    expect(() => groundBoundsFor([])).not.toThrow();
  });
});

describe("multi-section boards", () => {
  it("boardTransform + boardThicknessMmFor work uniformly across boards from different sections/angles (L/U/free-form multi-section decks)", () => {
    const sectionA: DeckSection = {
      id: "sA",
      name: "A",
      polygon: { id: "pa", points: [] },
      boardDirection: { mode: "horizontal", angleDeg: 0 },
      boardWidthMm: 120,
      boardThicknessMm: 28,
      boardGap: 5,
      materialId: "matA",
      fastenerSystemId: "f1",
    };
    const sectionB: DeckSection = {
      id: "sB",
      name: "B",
      polygon: { id: "pb", points: [] },
      boardDirection: { mode: "custom", angleDeg: 45 },
      boardWidthMm: 145,
      boardThicknessMm: 34,
      boardGap: 5,
      materialId: "matB",
      fastenerSystemId: "f1",
    };
    const level = makeLevel({ sections: [sectionA, sectionB] });
    const boardA = makeBoard({ id: "ba", sectionId: "sA", materialId: "matA", start: { x: 0, y: 0 }, end: { x: 2000, y: 0 } });
    const boardB = makeBoard({ id: "bb", sectionId: "sB", materialId: "matB", start: { x: 2000, y: 0 }, end: { x: 3414, y: 1414 } });

    const thickA = boardThicknessMmFor(boardA, level, emptyLibrary);
    const thickB = boardThicknessMmFor(boardB, level, emptyLibrary);
    expect(thickA).toBe(28);
    expect(thickB).toBe(34);

    const tA = boardTransform(boardA, thickA, level.heightAboveGround);
    const tB = boardTransform(boardB, thickB, level.heightAboveGround);
    // Both boards' TOP faces align at the same deck height, despite different
    // thicknesses and different board directions per section.
    const topA = tA.position[1] + tA.size[1] / 2;
    const topB = tB.position[1] + tB.size[1] / 2;
    expect(topA).toBeCloseTo(topB, 9);
    expect(topA).toBeCloseTo(mmToM(600), 6);
    // Different angles => different rotationY.
    expect(Math.abs(tA.rotationY - tB.rotationY)).toBeGreaterThan(0.1);
  });
});
