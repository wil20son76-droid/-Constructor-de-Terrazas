import { describe, expect, it } from "vitest";
import { buildPieceSegments, computeCutPlan, packSegments, splitRunsToMaxLength } from "./cutOptimization";

describe("buildPieceSegments / splitRunsToMaxLength", () => {
  it("leaves runs at or under the max length untouched", () => {
    expect(splitRunsToMaxLength([3000, 5000], 5400)).toEqual([3000, 5000]);
  });

  it("splits a run longer than the longest stock into equal spliced segments", () => {
    // A 14m board row with only 5.4m boards available needs ceil(14000/5400)=3 equal segments.
    const split = splitRunsToMaxLength([14000], 5400);
    expect(split).toHaveLength(3);
    for (const seg of split) expect(seg).toBeLessThanOrEqual(5400);
    expect(split.reduce((s, v) => s + v, 0)).toBeCloseTo(14000, 6);
  });

  it("tracks which source piece and segment index each split segment came from", () => {
    const segments = buildPieceSegments([14000, 2000], 5400);
    // 14000 -> 3 segments (source 0), 2000 -> 1 segment (source 1, unsplit).
    expect(segments.filter((s) => s.sourceIndex === 0)).toHaveLength(3);
    expect(segments.filter((s) => s.sourceIndex === 1)).toHaveLength(1);
    expect(segments.find((s) => s.sourceIndex === 1)?.totalSegments).toBe(1);
  });
});

describe("packSegments — the 3 mandatory worked examples", () => {
  const stock = [3600, 4200, 4800, 5400];

  it("2.1m + 2.1m -> detects that a single 4.2m board covers both (0 waste)", () => {
    const segments = buildPieceSegments([2100, 2100], Math.max(...stock));
    const bins = packSegments(segments, stock);
    expect(bins).toHaveLength(1);
    expect(bins[0].stockLengthMm).toBe(4200);
    expect(bins[0].offcutMm).toBeCloseTo(0, 6);
    expect(bins[0].items).toHaveLength(2);
  });

  it("3.0m + 1.8m -> detects that a single 4.8m board covers both (0 waste)", () => {
    const segments = buildPieceSegments([3000, 1800], Math.max(...stock));
    const bins = packSegments(segments, stock);
    expect(bins).toHaveLength(1);
    expect(bins[0].stockLengthMm).toBe(4800);
    expect(bins[0].offcutMm).toBeCloseTo(0, 6);
  });

  it("5.0m + 4.0m + 3.0m -> compares combinations instead of forcing one uniform stock length", () => {
    const segments = buildPieceSegments([5000, 4000, 3000], Math.max(...stock));
    const bins = packSegments(segments, stock);
    // Manual derivation (see CALCULATION_AUDIT.md):
    //  - 5000 only fits 5400 -> bin(5400), offcut 400.
    //  - 4000 doesn't fit the 400mm leftover; best new bin for 4000 (with 3000
    //    still to come) is 4200 (offcut 200 < 4800's 800 < 5400's 1400).
    //  - 3000 doesn't fit either open bin's leftover (400 or 200); with nothing
    //    left to look ahead to, the shortest stock that fits (3600) wins, offcut 600.
    // Total purchased = 5400+4200+3600 = 13200mm; total waste = 400+200+600 = 1200mm.
    // This is strictly better than forcing one uniform length (e.g. all-5400 would
    // need 3 boards = 16200mm) and never treats a too-short board as fitting a
    // too-long piece (the bug this replaces — see CALCULATION_AUDIT.md).
    expect(bins).toHaveLength(3);
    const lengths = bins.map((b) => b.stockLengthMm).sort((a, b) => a - b);
    expect(lengths).toEqual([3600, 4200, 5400]);
    const totalPurchased = bins.reduce((s, b) => s + b.stockLengthMm, 0);
    const totalWaste = bins.reduce((s, b) => s + b.offcutMm, 0);
    expect(totalPurchased).toBe(13200);
    expect(totalWaste).toBe(1200);
    // No bin may contain a piece longer than its own stock length (the bug this replaces).
    for (const bin of bins) {
      for (const item of bin.items) expect(item.lengthMm).toBeLessThanOrEqual(bin.stockLengthMm + 1e-9);
    }
  });
});

describe("packSegments — offcut reuse", () => {
  it("reuses an earlier piece's offcut for a later, smaller piece", () => {
    // 3600mm piece leaves 1200mm in a 4800mm board; the following 1000mm
    // piece fits in that leftover instead of opening a second board.
    const segments = buildPieceSegments([3600, 1000], 4800);
    const bins = packSegments(segments, [4800]);
    expect(bins).toHaveLength(1);
    expect(bins[0].items).toHaveLength(2);
    expect(bins[0].offcutMm).toBeCloseTo(200, 6);
  });
});

describe("computeCutPlan", () => {
  it("is deterministic and reproducible for the same input", () => {
    const pieces = [3300, 3300, 2000, 2000, 2000];
    const a = computeCutPlan("mat", pieces, [3600, 4800]);
    const b = computeCutPlan("mat", pieces, [3600, 4800]);
    expect(a).toEqual(b);
  });

  it("returns zero waste and zero boards for an empty piece list", () => {
    const plan = computeCutPlan("mat", [], [3600]);
    expect(plan.totalPurchasedCount).toBe(0);
    expect(plan.wasteMm).toBe(0);
  });

  it("flags reusable offcuts at or above the reuse threshold", () => {
    const plan = computeCutPlan("mat", [3000], [3600]);
    // 3600 - 3000 = 600mm offcut, above the 300mm reuse threshold.
    expect(plan.offcutsReusable).toBe(1);
  });

  it("prices a too-long run as the multiple spliced boards it actually takes, not one unbuyable board", () => {
    // Packing the RAW 14000mm piece without pre-splitting demonstrates the
    // failure mode this pipeline must avoid: no stock length (max 5400mm)
    // can fit it, so packSegments has no choice but to report a bin whose
    // "stock length" (14000) doesn't correspond to any real purchasable
    // board at all — a clear invalid-bin signal.
    const rawBins = packSegments([{ sourceIndex: 0, segmentIndex: 0, totalSegments: 1, lengthMm: 14000 }], [5400]);
    expect(rawBins[0].stockLengthMm).toBe(14000); // not one of [5400] -> invalid/unbuyable
    expect([5400]).not.toContain(rawBins[0].stockLengthMm);

    // computeCutPlan must never hit that failure mode: it pre-splits runs
    // to the longest available length first, so every purchased board's
    // stock length is a real, requested length that's >= what's in it.
    const plan = computeCutPlan("mat", [14000], [5400]);
    for (const bin of plan.bins) {
      expect([5400]).toContain(bin.stockLengthMm);
      const used = bin.items.reduce((s, i) => s + i.lengthMm, 0);
      expect(used).toBeLessThanOrEqual(bin.stockLengthMm + 1e-6);
    }
    expect(plan.spliceCount).toBe(1);
    expect(plan.segmentsCount).toBe(3); // ceil(14000/5400) = 3
  });

  it("reports required (technical) length separately from purchased length", () => {
    const plan = computeCutPlan("mat", [3300, 3300], [3600, 4800]);
    expect(plan.requiredLengthMm).toBe(6600);
    expect(plan.totalPurchasedLengthMm).toBeGreaterThanOrEqual(plan.requiredLengthMm);
  });
});
