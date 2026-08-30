import { describe, expect, it } from "vitest";
import { rectanglePolygon } from "../geometry";
import type { DeckLevel, MaterialLibrary } from "../types";
import { computeReglar, computeUniformSpacing } from "./index";

function makeLevel(overrides: Partial<DeckLevel> = {}): DeckLevel {
  return {
    id: "lvl1",
    name: "Nivå 1",
    heightAboveGround: 400,
    polygon: rectanglePolygon(1000, 2000),
    openings: [],
    boardDirection: { mode: "horizontal", angleDeg: 0 },
    boardGap: 5,
    trallMaterialId: "trall1",
    regelMaterialId: "regel1",
    regelSpacing: 300,
    barlinaMaterialId: "barlina1",
    barlinaMaxSpacing: 900,
    plintTypeId: "plint1",
    plintMaxSpacing: 500,
    fastenerSystemId: "fsys1",
    stairs: [],
    edgeBoards: [],
    wallEdgeIndices: [],
    openEdgeIndices: [],
    ...overrides,
  };
}

const library: MaterialLibrary = {
  materials: [
    {
      id: "regel1",
      category: "regel",
      name: "Joist",
      nameSv: "Regel 45x95",
      widthMm: 45,
      thicknessMm: 95,
      wastePercent: 10,
    },
  ],
  suppliers: [],
  fastenerSystems: [],
  plintTypes: [],
};

describe("computeUniformSpacing (CC calculation)", () => {
  it("matches the spec's worked example: span=14000, maxCC=600", () => {
    // numberOfSpaces = ceil(14000/600) = ceil(23.333) = 24
    // realCC = 14000/24 = 583.333...
    // numberOfMembers = 25
    const result = computeUniformSpacing(14000, 600);
    expect(result.numberOfSpaces).toBe(24);
    expect(result.realSpacingMm).toBeCloseTo(14000 / 24, 6);
    expect(result.numberOfMembers).toBe(25);
    // The core invariant: real CC must NEVER exceed the configured maximum.
    expect(result.realSpacingMm).toBeLessThanOrEqual(600);
  });

  it("real CC never exceeds max CC across a range of spans", () => {
    for (const span of [100, 599, 600, 601, 1234, 5000, 13999, 14000, 14001, 99999]) {
      const result = computeUniformSpacing(span, 600);
      expect(result.realSpacingMm).toBeLessThanOrEqual(600 + 1e-9);
    }
  });

  it("uses exactly one bay (no rounding surprises) when span equals maxCC", () => {
    const result = computeUniformSpacing(600, 600);
    expect(result.numberOfSpaces).toBe(1);
    expect(result.realSpacingMm).toBe(600);
    expect(result.numberOfMembers).toBe(2);
  });

  it("spacing is perfectly uniform: every consecutive gap is identical", () => {
    const result = computeUniformSpacing(14000, 600);
    for (let i = 1; i < result.positions.length; i++) {
      expect(result.positions[i] - result.positions[i - 1]).toBeCloseTo(result.realSpacingMm, 9);
    }
  });
});

describe("computeReglar", () => {
  it("places joists edge-to-edge perpendicular to the boards, with uniform CC", () => {
    const level = makeLevel();
    const { joists, ccInfo } = computeReglar(level, library);
    // Boards run horizontal (angle 0) -> joists run vertical, spaced along X (width=1000mm) at CC max 300.
    // numberOfSpaces = ceil(1000/300) = 4, realCC = 1000/4 = 250, numberOfMembers = 5.
    expect(ccInfo.numberOfSpaces).toBe(4);
    expect(ccInfo.realSpacingMm).toBeCloseTo(250, 6);
    expect(joists).toHaveLength(5);
    for (const j of joists) {
      expect(j.lengthMm).toBeCloseTo(2000, 6); // full height of the rectangle
      expect(j.dimension).toBe("45x95");
    }
    const xs = joists.map((j) => j.start.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(0, 6);
    expect(xs[xs.length - 1]).toBeCloseTo(1000, 6);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i] - xs[i - 1]).toBeCloseTo(250, 6);
    }
  });

  it("exposes each joist's real geometry (id, start, end, length, dimension)", () => {
    const level = makeLevel();
    const { joists } = computeReglar(level, library);
    for (const j of joists) {
      expect(j.id).toBeTruthy();
      expect(typeof j.start.x).toBe("number");
      expect(typeof j.end.y).toBe("number");
      expect(j.lengthMm).toBeGreaterThan(0);
    }
  });
});
