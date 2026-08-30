/**
 * Integration test for the spec's main worked example: a 14 000 x 7 000 mm
 * rectangular deck. EVERY expected value below is derived BY HAND in the
 * comments next to it — never copied from running the app — using the
 * exact formulas documented in CALCULATION_AUDIT.md. If the engine's
 * output ever drifts from these hand derivations, this test must fail.
 *
 * Fixture choices (materials, prices, spacings) are this test's own,
 * chosen to make the hand arithmetic exact and easy to verify — not the
 * app's seeded defaults.
 */
import { describe, expect, it } from "vitest";
import { rectanglePolygon } from "./geometry";
import type { DeckLevel, Material, MaterialLibrary } from "./types";
import { computeLevelBom, summarizeLevel } from "./materials";
import { computeLabourItems, totalLabourCost, totalLabourHours } from "./labour";
import { computeCostSummary, computeMaterialCost } from "./pricing";
import { classifyEdges, filterEdgeBoardEligible } from "./deck/edgeClassification";

// ---------------------------------------------------------------------------
// Fixture: 14000 x 7000 mm rectangle, trall 28x120 (gap 5mm), regel 45x120
// (CC max 600mm), bärlina 45x195 (max span 2000mm), plint max 1800mm.
// ---------------------------------------------------------------------------

const trallMaterial: Material = {
  id: "trall_28x120",
  category: "trall",
  name: "Decking",
  nameSv: "Tryckimpregnerad trall 28x120",
  widthMm: 120,
  thicknessMm: 28,
  availableLengthsMm: [3600, 4200, 4800, 5400], // spec's configurable commercial lengths
  pricePerMeter: 32,
  unit: "m",
  wastePercent: 10,
};

const regelMaterial: Material = {
  id: "regel_45x120",
  category: "regel",
  name: "Joist",
  nameSv: "Regel 45x120",
  widthMm: 45,
  thicknessMm: 120, // installed (vertical) height
  availableLengthsMm: [3600, 4200, 4800, 5400, 6000],
  pricePerMeter: 26,
  unit: "m",
  wastePercent: 10,
};

const barlinaMaterial: Material = {
  id: "barlina_45x195",
  category: "barlina",
  name: "Beam",
  nameSv: "Bärlina 45x195",
  widthMm: 45,
  thicknessMm: 195,
  availableLengthsMm: [3600, 4200, 4800, 5400, 6000],
  pricePerMeter: 44,
  unit: "m",
  wastePercent: 10,
};

const plintMaterial: Material = {
  id: "plint_betong",
  category: "plint",
  name: "Footing",
  nameSv: "Betongplint",
  pricePerUnit: 89,
  unit: "st",
  wastePercent: 0,
};

const trallskruvMaterial: Material = {
  id: "skruv_trall",
  category: "skruv",
  name: "Decking screw",
  nameSv: "Trallskruv",
  pricePerUnit: 249,
  unit: "förp",
  unitsPerPackage: 200,
  wastePercent: 5,
};

const vinkelbeslagMaterial: Material = {
  id: "mat_beslag_vinkel",
  category: "beslag",
  name: "Angle bracket",
  nameSv: "Vinkelbeslag",
  pricePerUnit: 8.5,
  unit: "st",
  wastePercent: 0,
};

const konstruktionsskruvMaterial: Material = {
  id: "mat_skruv_konstruktion",
  category: "skruv",
  name: "Construction screw",
  nameSv: "Konstruktionsskruv",
  pricePerUnit: 329,
  unit: "förp",
  unitsPerPackage: 100,
  wastePercent: 5,
};

const plintskruvMaterial: Material = {
  id: "mat_skruv_plint",
  category: "skruv",
  name: "Footing fastener",
  nameSv: "Plintskruv",
  pricePerUnit: 12,
  unit: "st",
  wastePercent: 0,
};

const library: MaterialLibrary = {
  materials: [
    trallMaterial,
    regelMaterial,
    barlinaMaterial,
    plintMaterial,
    trallskruvMaterial,
    vinkelbeslagMaterial,
    konstruktionsskruvMaterial,
    plintskruvMaterial,
  ],
  suppliers: [],
  fastenerSystems: [
    { id: "fsys_visible", type: "visible_skruv", name: "Synlig skruv", screwsPerIntersection: 2, screwMaterialId: "skruv_trall" },
  ],
  plintTypes: [{ id: "plinttype_betong", name: "Concrete", nameSv: "Betongplint", materialId: "plint_betong" }],
};

const level: DeckLevel = {
  id: "lvl_14x7",
  name: "Nivå 1",
  heightAboveGround: 200, // low deck: buildUp (28+120+195=343mm) > 200mm -> no posts needed
  polygon: rectanglePolygon(14000, 7000),
  openings: [],
  boardDirection: { mode: "horizontal", angleDeg: 0 },
  boardGap: 5,
  trallMaterialId: "trall_28x120",
  regelMaterialId: "regel_45x120",
  regelSpacing: 600, // CC max, per the spec's worked example
  barlinaMaterialId: "barlina_45x195",
  barlinaMaxSpacing: 2000,
  plintTypeId: "plinttype_betong",
  plintMaxSpacing: 1800, // per the spec's worked example
  fastenerSystemId: "fsys_visible",
  kortlingSpacing: 1800,
  stairs: [],
  edgeBoards: [],
  wallEdgeIndices: [],
  openEdgeIndices: [],
};

const bom = computeLevelBom(level, library, []);
const { geometry, bomLines, cutPlans } = bom;

describe("area & perimeter", () => {
  it("matches the spec: 14000 x 7000 mm -> 98.00 m², perimeter 42.00 m", () => {
    // grossArea = 14000 * 7000 mm^2 = 98,000,000 mm^2 = 98.00 m^2.
    // perimeter = 2 * (14000 + 7000) mm = 42,000 mm = 42.00 m.
    const area = summarizeLevel(level);
    expect(area.grossAreaM2).toBeCloseTo(98, 6);
    expect(area.netAreaM2).toBeCloseTo(98, 6);
    expect(area.perimeterM).toBeCloseTo(42, 6);
  });
});

describe("trall (deck boards)", () => {
  it("lays out 56 full-width rows, no cut needed (7000mm / 125mm pitch)", () => {
    // pitch = boardWidth(120) + gap(5) = 125mm.
    // fullRowCount = floor((7000+5)/125) = floor(56.04) = 56.
    // usedWidth = 56*125-5 = 6995; remaining = 7000-6995 = 5mm, NOT > gap(5mm) -> no extra cut row.
    expect(geometry.boardLayout.rowCount).toBe(56);
    expect(geometry.boardLayout.lastRowNeedsCut).toBe(false);
    expect(geometry.boards).toHaveLength(56);
  });

  it("has the correct technical (required) linear length: 56 rows x 14000mm = 784.00 m", () => {
    const trallLine = bomLines.find((l) => l.materialId === "trall_28x120")!;
    expect(trallLine.technicalQuantity).toBe(56);
    expect(trallLine.technicalLinearMeters).toBeCloseTo(784, 6);
  });

  it("splices every row into 3 segments (14000mm > longest 5400mm stock) and buys 168 x 4800mm boards", () => {
    // Each 14000mm row splits into ceil(14000/5400)=3 segments of 14000/3=4666.667mm.
    // 56 rows * 3 segments = 168 segments, all length 4666.667mm.
    // Only 4800mm and 5400mm stock is >= 4666.667mm; since no two 4666.667mm
    // segments can ever share a board (2*4666.667=9333.3 > any stock length),
    // every segment gets its own board, and the shortest sufficient length
    // (4800mm, offcut 133.33mm) always beats 5400mm (offcut 733.33mm).
    const trallCutPlan = cutPlans.find((p) => p.materialId === "trall_28x120")!;
    expect(trallCutPlan.piecesCount).toBe(56);
    expect(trallCutPlan.segmentsCount).toBe(168);
    expect(trallCutPlan.spliceCount).toBe(56); // every row needed splicing
    expect(trallCutPlan.purchasedBreakdown).toEqual([{ lengthMm: 4800, count: 168 }]);
    expect(trallCutPlan.totalPurchasedCount).toBe(168);
  });

  it("has the correct purchased quantity and waste: 806.4 m purchased, 22.4 m waste (2.78%)", () => {
    // Purchased: 168 * 4800mm = 806,400mm = 806.40 m.
    // Waste: 168 * (4800 - 14000/3)mm = 168 * 133.333...mm = 22,400mm = 22.40 m.
    // Waste% = 22400 / 806400 * 100 = 2.7778%.
    const trallCutPlan = cutPlans.find((p) => p.materialId === "trall_28x120")!;
    expect(trallCutPlan.totalPurchasedLengthMm).toBeCloseTo(806400, 3);
    expect(trallCutPlan.wasteMm).toBeCloseTo(22400, 3);
    expect(trallCutPlan.wastePercent).toBeCloseTo((22400 / 806400) * 100, 6);
    // No offcut (133.33mm) reaches the 300mm reuse threshold.
    expect(trallCutPlan.offcutsReusable).toBe(0);
  });

  it("prices the BOM line from PURCHASE quantity: 806.4 m x 32 kr/m = 25,804.80 kr", () => {
    const trallLine = bomLines.find((l) => l.materialId === "trall_28x120")!;
    expect(trallLine.purchaseLinearMeters).toBeCloseTo(806.4, 3);
    expect(trallLine.purchaseTotal).toBeCloseTo(25804.8, 2);
    // Technical (plan-only) cost, for comparison: 784 * 32 = 25,088.00 kr — deliberately lower.
    expect(trallLine.technicalCost).toBeCloseTo(25088, 2);
  });
});

describe("reglar (joists) & CC spacing", () => {
  it("computes uniform CC exactly per the spec's formula: span=14000, maxCC=600", () => {
    // numberOfSpaces = ceil(14000/600) = ceil(23.333) = 24.
    // realCC = 14000/24 = 583.333...mm — NEVER exceeds the configured max (600mm).
    // numberOfMembers = 24 + 1 = 25.
    expect(geometry.regelCcInfo.numberOfSpaces).toBe(24);
    expect(geometry.regelCcInfo.realSpacingMm).toBeCloseTo(14000 / 24, 6);
    expect(geometry.regelCcInfo.realSpacingMm).toBeLessThanOrEqual(600);
    expect(geometry.regelCcInfo.numberOfMembers).toBe(25);
    expect(geometry.joists).toHaveLength(25);
  });

  it("every joist spans the full 7000mm depth", () => {
    for (const j of geometry.joists) expect(j.lengthMm).toBeCloseTo(7000, 6);
  });

  it("real CC spacing between adjacent joists is uniform and matches the computed plan", () => {
    // Precision note: coordinates pass through a deliberate 1e-6mm rounding
    // step during rotation (see structural/memberLayout.ts's `roundMm`) to
    // avoid trig floating-point noise breaking the scanline — so exact
    // sub-micron equality isn't expected; 3 decimal places (0.0005mm) is
    // still far tighter than any real construction tolerance.
    const xs = geometry.joists.map((j) => j.start.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i] - xs[i - 1]).toBeCloseTo(geometry.regelCcInfo.realSpacingMm, 3);
    }
  });

  it("splices every joist into 2 segments (7000mm > longest 6000mm stock) and buys 50 x 3600mm boards", () => {
    // Each 7000mm joist splits into ceil(7000/6000)=2 segments of 3500mm.
    // 25 joists * 2 = 50 segments, all 3500mm. All 5 stock lengths (3600..6000) fit,
    // but since no two 3500mm segments can share a board (2*3500=7000 > 6000 max),
    // the shortest sufficient length (3600mm, offcut 100mm) always wins.
    const regelCutPlan = cutPlans.find((p) => p.materialId === "regel_45x120")!;
    expect(regelCutPlan.piecesCount).toBe(25);
    expect(regelCutPlan.segmentsCount).toBe(50);
    expect(regelCutPlan.purchasedBreakdown).toEqual([{ lengthMm: 3600, count: 50 }]);
    expect(regelCutPlan.totalPurchasedLengthMm).toBeCloseTo(180000, 3);
    expect(regelCutPlan.wasteMm).toBeCloseTo(5000, 3);
  });

  it("prices from purchase quantity: 180.00 m x 26 kr/m = 4,680.00 kr", () => {
    const regelLine = bomLines.find((l) => l.materialId === "regel_45x120")!;
    expect(regelLine.technicalLinearMeters).toBeCloseTo(175, 6); // 25 * 7000mm = 175,000mm
    expect(regelLine.purchaseLinearMeters).toBeCloseTo(180, 3);
    expect(regelLine.purchaseTotal).toBeCloseTo(4680, 2);
  });
});

describe("bärlinor (beams) & real spacing", () => {
  it("computes uniform spacing: span=7000, max=2000 -> 4 spaces, real 1750mm, 5 beams", () => {
    // numberOfSpaces = ceil(7000/2000) = ceil(3.5) = 4. realSpacing = 7000/4 = 1750mm.
    expect(geometry.barlinaSpacingInfo.numberOfSpaces).toBe(4);
    expect(geometry.barlinaSpacingInfo.realSpacingMm).toBeCloseTo(1750, 6);
    expect(geometry.barlinaSpacingInfo.realSpacingMm).toBeLessThanOrEqual(2000);
    expect(geometry.beams).toHaveLength(5);
  });

  it("every beam spans the full 14000mm width", () => {
    for (const b of geometry.beams) expect(b.lengthMm).toBeCloseTo(14000, 6);
  });

  it("splices every beam into 3 segments and buys 15 x 4800mm boards (same shape as the trall case)", () => {
    const barlinaCutPlan = cutPlans.find((p) => p.materialId === "barlina_45x195")!;
    expect(barlinaCutPlan.piecesCount).toBe(5);
    expect(barlinaCutPlan.segmentsCount).toBe(15);
    expect(barlinaCutPlan.purchasedBreakdown).toEqual([{ lengthMm: 4800, count: 15 }]);
  });

  it("prices from purchase quantity: 72.00 m x 44 kr/m = 3,168.00 kr", () => {
    const barlinaLine = bomLines.find((l) => l.materialId === "barlina_45x195")!;
    expect(barlinaLine.technicalLinearMeters).toBeCloseTo(70, 6); // 5 * 14000mm
    expect(barlinaLine.purchaseLinearMeters).toBeCloseTo(72, 3); // 15 * 4800mm
    expect(barlinaLine.purchaseTotal).toBeCloseTo(3168, 2);
  });
});

describe("plintar (footings) & spacing", () => {
  it("computes uniform spacing per beam: span=14000, max=1800 -> 8 spaces, real 1750mm, 9 footings/beam", () => {
    // numberOfSpaces = ceil(14000/1800) = ceil(7.778) = 8. realSpacing = 14000/8 = 1750mm.
    for (const s of geometry.plintSpacingInfoByBeam) {
      expect(s.numberOfSpaces).toBe(8);
      expect(s.realSpacingMm).toBeCloseTo(1750, 6);
      expect(s.realSpacingMm).toBeLessThanOrEqual(1800);
      expect(s.numberOfMembers).toBe(9);
    }
  });

  it("totals 5 beams x 9 footings = 45 footings, each tagged with its beamId", () => {
    expect(geometry.footings).toHaveLength(45);
    for (const beam of geometry.beams) {
      expect(geometry.footings.filter((f) => f.beamId === beam.id)).toHaveLength(9);
    }
  });

  it("numbers footings sequentially P1..P45", () => {
    expect(geometry.footings[0].label).toBe("P1");
    expect(geometry.footings[44].label).toBe("P45");
  });

  it("costs 45 x 89 kr = 4,005.00 kr", () => {
    const plintLine = bomLines.find((l) => l.materialId === "plint_betong")!;
    expect(plintLine.technicalQuantity).toBe(45);
    expect(plintLine.purchaseTotal).toBeCloseTo(4005, 2);
  });

  it("needs no posts: heightAboveGround(200mm) < build-up(28+120+195=343mm)", () => {
    expect(geometry.postHeightMm).toBe(0);
    expect(geometry.posts).toHaveLength(0);
  });
});

describe("kortlingar (blocking)", () => {
  it("estimates 72 pieces: 24 bays x 3 rows/bay (spacing 1800mm over a 7000mm joist)", () => {
    // bays = 25 joists - 1 = 24. rowsPerBay = floor(7000/1800) = floor(3.888) = 3.
    expect(geometry.kortlingCount).toBe(72);
  });
});

describe("fasteners (tornillos)", () => {
  it("counts REAL board/joist segment intersections, not a naive boards*joists*2 shortcut", () => {
    // For this plain (non-notched) rectangle every one of the 56 full-width
    // boards crosses every one of the 25 full-height joists exactly once,
    // so intersections = 56*25 = 1400 — this coincides with boards*joists
    // here ONLY because there is no opening/notch splitting any segment;
    // see integration-lshape/ushape for cases where it does NOT coincide.
    const trallskruvLine = bomLines.find((l) => l.materialId === "skruv_trall")!;
    expect(trallskruvLine.technicalQuantity).toBe(1400 * 2); // 2 screws/intersection
    // 2800 screws / 200 per package = 14 packages exactly.
    expect(trallskruvLine.purchaseQuantity).toBe(14);
    expect(trallskruvLine.purchaseTotal).toBeCloseTo(14 * 249, 2);
  });

  it("vinkelbeslag: 2 per joist end = 25 * 2 = 50, at 8.5 kr each = 425.00 kr", () => {
    const line = bomLines.find((l) => l.materialId === "mat_beslag_vinkel")!;
    expect(line.technicalQuantity).toBe(50);
    expect(line.purchaseTotal).toBeCloseTo(425, 2);
  });

  it("konstruktionsskruv: 4 per kortling x 72 = 288 -> ceil(288/100)=3 packages x 329 kr = 987.00 kr", () => {
    const line = bomLines.find((l) => l.materialId === "mat_skruv_konstruktion")!;
    expect(line.technicalQuantity).toBe(288);
    expect(line.purchaseQuantity).toBe(3);
    expect(line.purchaseTotal).toBeCloseTo(987, 2);
  });

  it("plintskruv: 4 per footing (no posts) x 45 = 180, at 12 kr each = 2,160.00 kr", () => {
    const line = bomLines.find((l) => l.materialId === "mat_skruv_plint")!;
    expect(line.technicalQuantity).toBe(180);
    expect(line.purchaseTotal).toBeCloseTo(2160, 2);
  });
});

describe("full BOM & material cost total", () => {
  it("sums all 8 purchased lines to 44,715.80 kr", () => {
    // 25804.80 (trall) + 4680.00 (regel) + 3168.00 (bärlina) + 4005.00 (plint)
    // + 3486.00 (trallskruv, 14*249) + 425.00 (vinkelbeslag) + 987.00 (konstruktionsskruv)
    // + 2160.00 (plintskruv) = 44,715.80 kr.
    expect(bomLines).toHaveLength(8);
    const materialCost = computeMaterialCost(bomLines);
    expect(materialCost).toBeCloseTo(44715.8, 2);
  });
});

describe("mano de obra (labour)", () => {
  const labourItems = computeLabourItems(
    { area: summarizeLevel(level), footingCount: geometry.footings.length, stairCount: 0, edgeLengthM: 0 },
    { stommeHoursPerM2: 0.5, trallHoursPerM2: 0.4, plintHoursPerUnit: 0.5, stairHoursPerUnit: 3, kantbradaHoursPerMeter: 0.2, hourlyRate: 500, workerCount: 2 },
  );

  it("computes hours from configurable rates: stomme 49h, trall 39.2h, plint 22.5h = 110.7h total", () => {
    // stomme: 98 m^2 * 0.5 h/m^2 = 49h. trall: 98 * 0.4 = 39.2h. plint: 45 * 0.5 = 22.5h.
    expect(totalLabourHours(labourItems)).toBeCloseTo(110.7, 6);
  });

  it("costs 110.7h x 500 kr/h = 55,350.00 kr, independent of worker count", () => {
    expect(totalLabourCost(labourItems)).toBeCloseTo(55350, 2);
  });
});

describe("markup (påslag), moms & ROT — full pricing chain", () => {
  const labourItems = computeLabourItems(
    { area: summarizeLevel(level), footingCount: geometry.footings.length, stairCount: 0, edgeLengthM: 0 },
    { stommeHoursPerM2: 0.5, trallHoursPerM2: 0.4, plintHoursPerUnit: 0.5, stairHoursPerUnit: 3, kantbradaHoursPerMeter: 0.2, hourlyRate: 500, workerCount: 2 },
  );
  const materialCost = computeMaterialCost(bomLines);
  const labourCost = totalLabourCost(labourItems);

  it("subtotal = material(44715.80) + labour(55350.00) = 100,065.80 kr", () => {
    expect(materialCost + labourCost).toBeCloseTo(100065.8, 2);
  });

  it("applies 20% påslag (markup ON cost, not a margin): 100065.80 * 1.20 = 120,078.96 kr ex moms", () => {
    const costs = computeCostSummary(
      materialCost,
      labourCost,
      0,
      { markupPercent: 20, machineCost: 0, transportCost: 0, excavationCost: 0, wasteRemovalCost: 0 },
      25,
      { rotEnabled: false, rotPercent: 0, rotMaxDeduction: 0, eligibility: { materialEligible: false, labourEligible: true, machinesEligible: false, transportEligible: false } },
    );
    expect(costs.subtotal).toBeCloseTo(100065.8, 2);
    expect(costs.markupAmount).toBeCloseTo(20013.16, 2);
    expect(costs.priceExVat).toBeCloseTo(120078.96, 2);
  });

  it("applies 25% moms on top: 120078.96 * 1.25 = 150,098.70 kr inc moms", () => {
    const costs = computeCostSummary(
      materialCost,
      labourCost,
      0,
      { markupPercent: 20, machineCost: 0, transportCost: 0, excavationCost: 0, wasteRemovalCost: 0 },
      25,
      { rotEnabled: false, rotPercent: 0, rotMaxDeduction: 0, eligibility: { materialEligible: false, labourEligible: true, machinesEligible: false, transportEligible: false } },
    );
    expect(costs.vatAmount).toBeCloseTo(30019.74, 2);
    expect(costs.priceIncVat).toBeCloseTo(150098.7, 2);
  });

  it("applies a configured 30% ROT on labour only, capped at 50000: deducts 16,605.00 kr -> 133,493.70 kr final", () => {
    // rotEligibleAmount = labourCost (55350, material/machines/transport excluded by default eligibility).
    // rawDeduction = 55350 * 0.30 = 16,605.00, under the 50,000 cap -> deduction = 16,605.00.
    // final = 150,098.70 - 16,605.00 = 133,493.70 kr.
    const costs = computeCostSummary(
      materialCost,
      labourCost,
      0,
      { markupPercent: 20, machineCost: 0, transportCost: 0, excavationCost: 0, wasteRemovalCost: 0 },
      25,
      { rotEnabled: true, rotPercent: 30, rotMaxDeduction: 50000, eligibility: { materialEligible: false, labourEligible: true, machinesEligible: false, transportEligible: false } },
    );
    expect(costs.rotEligibleAmount).toBeCloseTo(55350, 2);
    expect(costs.rotDeductionAmount).toBeCloseTo(16605, 2);
    expect(costs.priceAfterRot).toBeCloseTo(133493.7, 2);
  });
});

describe("kantbräda edge classification (separate minimal case)", () => {
  it("only counts EXTERNAL edges — a wall edge and a stair edge are excluded from the same run", () => {
    // Small 2000x1000mm rectangle. Edge 0 = top (0,0)->(2000,0), length 2000mm.
    // Edge 1 = right (2000,0)->(2000,1000), length 1000mm — marked as a wall edge.
    // Edge 2 = bottom (2000,1000)->(0,1000), length 2000mm — external.
    // Edge 3 = left (0,1000)->(0,0), length 1000mm — has a stair attached.
    const miniLevel: DeckLevel = {
      ...level,
      polygon: rectanglePolygon(2000, 1000),
      wallEdgeIndices: [1],
      stairs: [{ id: "s1", edgeIndex: 3, widthMm: 900, totalHeightMm: 400, stepCount: 2, stepDepthMm: 300, trallMaterialId: "trall_28x120", regelMaterialId: "regel_45x120" }],
      edgeBoards: [{ id: "run1", type: "kantbrada", materialId: "trall_28x120", edgeIndices: [0, 1, 2, 3] }],
    };
    const classification = classifyEdges(miniLevel);
    expect(classification).toEqual(["external", "wall", "external", "stair"]);
    const eligible = filterEdgeBoardEligible([0, 1, 2, 3], classification);
    expect(eligible).toEqual([0, 2]); // only the two external edges

    const { bomLines: miniBom } = computeLevelBom(miniLevel, library, []);
    const edgeLine = miniBom.find((l) => l.group === "OVRIGT" && l.materialId === "trall_28x120");
    // Length must be 2000+2000=4000mm (edges 0 and 2 only), NOT 2000+1000+2000+1000=6000mm.
    expect(edgeLine?.technicalLinearMeters).toBeCloseTo(4, 6);
  });
});
