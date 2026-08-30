/**
 * Integration test for a U-shaped deck: a 10000 x 6000 mm rectangle with a
 * 4000 x 2000 mm notch removed from the middle of the y=0 edge (x in
 * [3000,7000], y in [0,2000]). Unlike the L-shape's corner notch, this
 * notch sits in the MIDDLE of a row, so a board row crossing it produces
 * TWO disjoint segments (segment A, segment B) — the concave-polygon case
 * the audit specifically calls out.
 */
import { describe, expect, it } from "vitest";
import { polygonArea, uShapePolygon } from "./geometry";
import type { DeckLevel, Material, MaterialLibrary } from "./types";
import { computeLevelBom, summarizeLevel } from "./materials";
import { countBoardJoistIntersections } from "./materials/fasteners";

const NOTCH_X_MIN = 3000;
const NOTCH_X_MAX = 7000;
const NOTCH_Y_MAX = 2000;

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

// uShapePolygon(10000,6000,4000,2000): nw=4000, nh=2000, left=(10000-4000)/2=3000, right=7000.
// Points: (0,0),(3000,0),(3000,2000),(7000,2000),(7000,0),(10000,0),(10000,6000),(0,6000).
const polygon = uShapePolygon(10000, 6000, 4000, 2000);

const level: DeckLevel = {
  id: "lvl_u",
  name: "U-form",
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

describe("U-shape area", () => {
  it("net area = 10000x6000 minus the 4000x2000 notch = 52.00 m²", () => {
    // grossArea = 10000*6000 - 4000*2000 = 60,000,000 - 8,000,000 = 52,000,000 mm^2 = 52.00 m^2.
    expect(polygonArea(polygon.points)).toBe(60_000_000 - 8_000_000);
    expect(summarizeLevel(level).netAreaM2).toBeCloseTo(52, 6);
  });
});

describe("U-shape: a row crossing the notch splits into TWO real segments", () => {
  it("every board row within the notch band (y<2000) produces exactly 2 segments: [0,3000] and [7000,10000]", () => {
    // pitch=100mm (gap 0), span=6000 -> 60 rows, centres at 50,150,...,5950.
    // Rows with centre y<2000: y=50..1950 -> 20 rows (k=0..19).
    const rowsInNotchBand = new Map<number, typeof geometry.boards>();
    for (const b of geometry.boards) {
      if (b.start.y < NOTCH_Y_MAX) {
        const key = Math.round(b.start.y * 1000);
        rowsInNotchBand.set(key, [...(rowsInNotchBand.get(key) ?? []), b]);
      }
    }
    expect(rowsInNotchBand.size).toBe(20);
    for (const segments of rowsInNotchBand.values()) {
      expect(segments).toHaveLength(2);
      const lengths = segments.map((s) => s.lengthMm).sort((a, b) => a - b);
      expect(lengths[0]).toBeCloseTo(3000, 3); // segment A: [0,3000]
      expect(lengths[1]).toBeCloseTo(3000, 3); // segment B: [7000,10000]
    }
  });

  it("rows below the notch (y>=2000) span the full 10000mm width as a single segment", () => {
    const rowsBelow = geometry.boards.filter((b) => b.start.y >= NOTCH_Y_MAX);
    expect(rowsBelow).toHaveLength(40); // 60 total - 20 in the notch band
    for (const b of rowsBelow) expect(b.lengthMm).toBeCloseTo(10000, 3);
  });

  it("technical linear length = 20 rows x (3000+3000) + 40 rows x 10000 = 520.00 m", () => {
    const trallLine = bom.bomLines.find((l) => l.materialId === "trall1")!;
    expect(trallLine.technicalLinearMeters).toBeCloseTo(520, 3);
  });
});

describe("U-shape: joist length depends on whether its x falls inside the notch's x-range", () => {
  it("a joist with x strictly between 3000 and 7000 is clipped to 4000mm; otherwise it spans the full 6000mm", () => {
    for (const j of geometry.joists) {
      const x = j.start.x;
      if (x > NOTCH_X_MIN + 1e-6 && x < NOTCH_X_MAX - 1e-6) {
        expect(j.lengthMm).toBeCloseTo(4000, 3);
      } else {
        expect(j.lengthMm).toBeCloseTo(6000, 3);
      }
    }
  });

  it("CC formula gives 18 joists total, of which exactly 6 fall inside the notch x-range", () => {
    // numberOfSpaces = ceil(10000/600) = 17, numberOfMembers = 18.
    // Positions = k * (10000/17) for k=0..17. Strictly inside (3000,7000):
    // 3000/(10000/17) = 5.1, 7000/(10000/17) = 11.9 -> k=6..11 (6 positions).
    expect(geometry.joists).toHaveLength(18);
    const inside = geometry.joists.filter((j) => j.start.x > NOTCH_X_MIN && j.start.x < NOTCH_X_MAX);
    expect(inside).toHaveLength(6);
  });
});

describe("U-shape: fastener count from real geometry vs the naive boards*joists*2 shortcut", () => {
  it("matches the hand-derived real intersection count of 960 (not the naive 1440)", () => {
    // Full-width rows (40 of them) are crossed by all 18 joists: 40*18 = 720.
    // Notch-band rows (20 of them) are crossed only by the 12 joists OUTSIDE
    // the notch x-range (18 total - 6 inside = 12): 20*12 = 240.
    // Real total = 720 + 240 = 960.
    // Naive shortcut = boards.length(80) * joists.length(18) = 1440 — wrong,
    // it assumes every joist crosses every board row regardless of the notch.
    const real = countBoardJoistIntersections(geometry.boards, geometry.joists);
    expect(geometry.boards).toHaveLength(80); // 20 rows * 2 segments + 40 rows * 1 segment
    const naive = geometry.boards.length * geometry.joists.length;
    expect(naive).toBe(1440);
    expect(real).toBe(960);
    expect(real).toBeLessThan(naive);
  });
});

describe("U-shape: BOM stays internally consistent", () => {
  it("purchase quantity is always >= technical quantity for every lumber line", () => {
    for (const line of bom.bomLines) {
      if (line.purchaseLinearMeters !== undefined && line.technicalLinearMeters !== undefined) {
        expect(line.purchaseLinearMeters).toBeGreaterThanOrEqual(line.technicalLinearMeters - 1e-6);
      }
    }
  });
});
