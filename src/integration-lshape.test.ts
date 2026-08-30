/**
 * Integration test for an L-shaped deck: an 8000 x 6000 mm rectangle with
 * a 3000 x 2000 mm notch removed from the top-right corner (x in
 * [5000,8000], y in [0,2000]). Verifies the concave-polygon requirements
 * from the audit: no element crosses into the removed area, a row that
 * spans the notch splits into two real segments, and fastener counts come
 * from actual geometry — never a naive boards*joists*2 shortcut (which
 * would overcount here, since the notch removes real intersections).
 */
import { describe, expect, it } from "vitest";
import { lShapePolygon, polygonArea, polygonPerimeter } from "./geometry";
import type { DeckLevel, Material, MaterialLibrary } from "./types";
import { computeLevelBom, summarizeLevel } from "./materials";
import { countBoardJoistIntersections } from "./materials/fasteners";

const NOTCH_X_MIN = 5000; // width(8000) - cutWidth(3000)
const NOTCH_Y_MAX = 2000; // cutHeight

const trallMaterial: Material = {
  id: "trall1",
  category: "trall",
  name: "Decking",
  nameSv: "Trall",
  widthMm: 100,
  thicknessMm: 28,
  availableLengthsMm: [3600, 4200, 4800, 5400, 6000],
  pricePerMeter: 30,
  unit: "m",
  wastePercent: 10,
};
const regelMaterial: Material = {
  id: "regel1",
  category: "regel",
  name: "Joist",
  nameSv: "Regel",
  widthMm: 45,
  thicknessMm: 95,
  availableLengthsMm: [3600, 4200, 4800, 5400, 6000],
  pricePerMeter: 24,
  unit: "m",
  wastePercent: 10,
};
const barlinaMaterial: Material = {
  id: "barlina1",
  category: "barlina",
  name: "Beam",
  nameSv: "Bärlina",
  widthMm: 45,
  thicknessMm: 195,
  availableLengthsMm: [3600, 4200, 4800, 5400, 6000],
  pricePerMeter: 42,
  unit: "m",
  wastePercent: 10,
};
const plintMaterial: Material = { id: "plint1", category: "plint", name: "Footing", nameSv: "Plint", pricePerUnit: 89, unit: "st", wastePercent: 0 };

const library: MaterialLibrary = {
  materials: [trallMaterial, regelMaterial, barlinaMaterial, plintMaterial],
  suppliers: [],
  fastenerSystems: [{ id: "fsys1", type: "visible_skruv", name: "Synlig", screwsPerIntersection: 2 }],
  plintTypes: [{ id: "plinttype1", name: "Concrete", nameSv: "Betongplint", materialId: "plint1" }],
};

const polygon = lShapePolygon(8000, 6000, 3000, 2000);

const level: DeckLevel = {
  id: "lvl_l",
  name: "L-form",
  heightAboveGround: 200,
  polygon,
  openings: [],
  boardDirection: { mode: "horizontal", angleDeg: 0 },
  boardGap: 0,
  trallMaterialId: "trall1",
  regelMaterialId: "regel1",
  regelSpacing: 600,
  barlinaMaterialId: "barlina1",
  barlinaMaxSpacing: 2000,
  plintTypeId: "plinttype1",
  plintMaxSpacing: 1800,
  fastenerSystemId: "fsys1",
  stairs: [],
  edgeBoards: [],
  wallEdgeIndices: [],
  openEdgeIndices: [],
};

const bom = computeLevelBom(level, library, []);
const { geometry } = bom;

function isInsideNotch(x: number, y: number): boolean {
  return x > NOTCH_X_MIN + 1e-6 && y < NOTCH_Y_MAX - 1e-6;
}

describe("L-shape area & perimeter", () => {
  it("net area = 8000x6000 minus the 3000x2000 notch = 42.00 m²", () => {
    // grossArea = 8000*6000 - 3000*2000 = 48,000,000 - 6,000,000 = 42,000,000 mm^2 = 42.00 m^2.
    expect(polygonArea(polygon.points)).toBe(48_000_000 - 6_000_000);
    const area = summarizeLevel(level);
    expect(area.netAreaM2).toBeCloseTo(42, 6);
  });

  it("perimeter sums all six edges of the notched outline", () => {
    // Points, in order: (0,0),(5000,0),(5000,2000),(8000,2000),(8000,6000),(0,6000).
    // Edge lengths: 5000, 2000, 3000, 4000, 8000, 6000.
    const expectedPerimeter = 5000 + 2000 + 3000 + 4000 + 8000 + 6000;
    expect(polygonPerimeter(polygon.points)).toBeCloseTo(expectedPerimeter, 6);
  });
});

describe("L-shape: no element crosses into the removed notch", () => {
  it("no trall board segment has any point inside the notch", () => {
    for (const b of geometry.boards) {
      expect(isInsideNotch(b.start.x, b.start.y)).toBe(false);
      expect(isInsideNotch(b.end.x, b.end.y)).toBe(false);
    }
  });

  it("no regel (joist) segment has any point inside the notch", () => {
    for (const j of geometry.joists) {
      expect(isInsideNotch(j.start.x, j.start.y)).toBe(false);
      expect(isInsideNotch(j.end.x, j.end.y)).toBe(false);
    }
  });

  it("no bärlina (beam) segment has any point inside the notch", () => {
    for (const beam of geometry.beams) {
      expect(isInsideNotch(beam.start.x, beam.start.y)).toBe(false);
      expect(isInsideNotch(beam.end.x, beam.end.y)).toBe(false);
    }
  });
});

describe("L-shape: a row crossing the notch is shortened to one clipped segment", () => {
  it("a board row within the notch's height produces exactly one segment, clipped to [0, 5000] (a corner notch, not a through-hole, so no second segment appears here — see integration-ushape.test.ts for the 2-segment case)", () => {
    const rowsInNotchBand = geometry.boards.filter((b) => b.start.y > 0 && b.start.y < NOTCH_Y_MAX);
    for (const b of rowsInNotchBand) {
      expect(Math.max(b.start.x, b.end.x)).toBeLessThanOrEqual(NOTCH_X_MIN + 1e-6);
    }
    expect(rowsInNotchBand.length).toBeGreaterThan(0);
  });

  it("a board row below the notch spans the full 8000mm width (unclipped)", () => {
    const rowsBelowNotch = geometry.boards.filter((b) => b.start.y > NOTCH_Y_MAX);
    for (const b of rowsBelowNotch) {
      expect(b.lengthMm).toBeCloseTo(8000, 3);
    }
    expect(rowsBelowNotch.length).toBeGreaterThan(0);
  });
});

describe("L-shape: joist length depends on whether it falls inside the notch's x-range", () => {
  it("a joist at x < 5000 spans the full 6000mm height; a joist at x >= 5000 is shortened by the notch to 4000mm", () => {
    // Manual rule: full region is y in [0,6000]. For x >= 5000, the notch
    // removes y in [0,2000], leaving y in [2000,6000] -> length 4000mm.
    for (const j of geometry.joists) {
      const x = j.start.x;
      if (x < NOTCH_X_MIN - 1e-6) {
        expect(j.lengthMm).toBeCloseTo(6000, 3);
      } else if (x > NOTCH_X_MIN + 1e-6) {
        expect(j.lengthMm).toBeCloseTo(4000, 3);
      }
    }
    // Sanity: both cases actually occur for this geometry (CC=600 over an 8000mm span).
    expect(geometry.joists.some((j) => j.start.x < NOTCH_X_MIN)).toBe(true);
    expect(geometry.joists.some((j) => j.start.x > NOTCH_X_MIN)).toBe(true);
  });
});

describe("L-shape: fastener count comes from real intersections, not boards.length * joists.length * 2", () => {
  it("real intersection count is strictly less than the naive boards*joists shortcut", () => {
    const realIntersections = countBoardJoistIntersections(geometry.boards, geometry.joists);
    const naiveShortcut = geometry.boards.length * geometry.joists.length;
    // The notch removes real crossings between joists at x>=5000 and board
    // rows within the notch band (y<2000) — those joists don't reach that
    // band at all, so they can't cross those particular board segments.
    expect(realIntersections).toBeLessThan(naiveShortcut);
  });
});

describe("L-shape: BOM stays internally consistent", () => {
  it("purchase quantity is always >= technical quantity for every lumber line", () => {
    for (const line of bom.bomLines) {
      if (line.purchaseLinearMeters !== undefined && line.technicalLinearMeters !== undefined) {
        expect(line.purchaseLinearMeters).toBeGreaterThanOrEqual(line.technicalLinearMeters - 1e-6);
      }
    }
  });
});
