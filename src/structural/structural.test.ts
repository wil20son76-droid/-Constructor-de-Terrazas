import { describe, expect, it } from "vitest";
import { rectanglePolygon } from "../geometry";
import type { DeckLevel } from "../types";
import { computeBarlinor, computeFootings, computePostHeight, computeReglar, estimateKortlingCount } from "./index";

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
    ...overrides,
  };
}

describe("computeReglar", () => {
  it("places joists edge-to-edge perpendicular to the boards, CC apart", () => {
    const level = makeLevel();
    const joists = computeReglar(level);
    // Boards run horizontal (angle 0) -> joists run vertical, spaced along X (width=1000mm) at CC 300,
    // edge-to-edge (one joist at each edge, so the bay next to one edge is shorter than 300mm).
    expect(joists).toHaveLength(5);
    for (const j of joists) {
      expect(j.lengthMm).toBeCloseTo(2000, 6); // full height of the rectangle
    }
    const xs = joists.map((j) => j.start.x).sort((a, b) => a - b);
    expect(xs[0]).toBe(0);
    expect(xs[xs.length - 1]).toBe(1000);
    // Every gap between consecutive joists is at most the nominal CC spacing.
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i] - xs[i - 1]).toBeLessThanOrEqual(300 + 1e-6);
    }
  });
});

describe("computeBarlinor", () => {
  it("places beams edge-to-edge parallel to the boards, spaced by barlinaMaxSpacing", () => {
    const level = makeLevel();
    const beams = computeBarlinor(level);
    // Beams run horizontal too (parallel to boards), spaced along Y (height=2000mm) at 900 max.
    // Row positions: 0, 900, 1800, 2000 -> 4 beams.
    expect(beams).toHaveLength(4);
    for (const b of beams) {
      expect(b.lengthMm).toBeCloseTo(1000, 6);
    }
  });
});

describe("computeFootings", () => {
  it("distributes footings along each beam and numbers them sequentially", () => {
    const level = makeLevel();
    const beams = computeBarlinor(level);
    const footings = computeFootings(beams, "plint1", level.plintMaxSpacing);
    expect(footings[0].label).toBe("P1");
    expect(footings[footings.length - 1].label).toBe(`P${footings.length}`);
    // Each beam of length 1000mm with max spacing 500mm gets footings at 0,500,1000 -> 3 per beam.
    expect(footings.length).toBe(beams.length * 3);
  });
});

describe("computePostHeight", () => {
  it("is zero when the deck sits at or below the structural build-up height", () => {
    expect(computePostHeight(300, 28, 95, 195)).toBe(0);
  });

  it("equals the remaining height above the build-up when elevated", () => {
    expect(computePostHeight(1000, 28, 95, 195)).toBe(1000 - (28 + 95 + 195));
  });
});

describe("estimateKortlingCount", () => {
  it("returns 0 when fewer than two joists exist", () => {
    expect(estimateKortlingCount([], 1200)).toBe(0);
  });

  it("scales with the number of joist bays and blocking spacing", () => {
    const level = makeLevel();
    const joists = computeReglar(level); // 5 joists -> 4 bays, each 2000mm long
    const count = estimateKortlingCount(joists, 900); // floor(2000/900) = 2 rows per bay
    expect(count).toBe(4 * 2);
  });
});
