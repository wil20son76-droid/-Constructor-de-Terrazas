import { describe, expect, it } from "vitest";
import { rectanglePolygon } from "../geometry";
import type { DeckLevel, MaterialLibrary } from "../types";
import { computeBarlinor } from "./index";

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
    { id: "barlina1", category: "barlina", name: "Beam", nameSv: "Bärlina 45x195", widthMm: 45, thicknessMm: 195, wastePercent: 10 },
  ],
  suppliers: [],
  fastenerSystems: [],
  plintTypes: [],
};

describe("computeBarlinor", () => {
  it("places beams edge-to-edge parallel to the boards, with uniform spacing along the depth", () => {
    const level = makeLevel();
    const { beams, spacingInfo } = computeBarlinor(level, library);
    // Boards horizontal -> bärlinor also horizontal (parallel to boards), spaced along Y (height=2000mm).
    // numberOfSpaces = ceil(2000/900) = ceil(2.222) = 3, realSpacing = 2000/3 = 666.667, numberOfMembers = 4.
    expect(spacingInfo.numberOfSpaces).toBe(3);
    expect(spacingInfo.realSpacingMm).toBeCloseTo(2000 / 3, 6);
    expect(spacingInfo.realSpacingMm).toBeLessThanOrEqual(900);
    expect(beams).toHaveLength(4);
    for (const b of beams) {
      expect(b.lengthMm).toBeCloseTo(1000, 6);
      expect(b.dimension).toBe("45x195");
    }
  });

  it("changes axis when boards are vertical (bärlinor now spaced along X)", () => {
    const level = makeLevel({ boardDirection: { mode: "vertical", angleDeg: 0 } });
    const { beams, spacingInfo } = computeBarlinor(level, library);
    // Boards vertical -> bärlinor vertical too, spaced along X (width=1000mm) at max 900.
    // numberOfSpaces = ceil(1000/900) = 2, realSpacing = 500, numberOfMembers = 3.
    expect(spacingInfo.numberOfSpaces).toBe(2);
    expect(spacingInfo.realSpacingMm).toBeCloseTo(500, 6);
    expect(beams).toHaveLength(3);
    for (const b of beams) {
      expect(b.lengthMm).toBeCloseTo(2000, 6); // full height, since beams now run vertically
    }
  });
});
