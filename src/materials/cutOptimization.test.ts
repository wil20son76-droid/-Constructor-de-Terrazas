import { describe, expect, it } from "vitest";
import { chooseBestStockLength, computeCutPlan, packPieces, splitRunsToMaxLength } from "./cutOptimization";

describe("packPieces", () => {
  it("packs pieces first-fit-decreasing into fixed-length bins", () => {
    const result = packPieces([3000, 3000, 3000], 6000);
    expect(result.binCount).toBe(2);
    expect(result.totalWasteMm).toBe(3000);
  });

  it("reuses an offcut within the same bin when a later, smaller piece fits exactly", () => {
    const result = packPieces([4000, 1000], 5000);
    // 4000 fits alone leaving a 1000mm offcut, which the 1000mm piece fills exactly.
    expect(result.binCount).toBe(1);
    expect(result.totalWasteMm).toBe(0);
  });

  it("opens a new bin once existing offcuts are too small for a piece", () => {
    const result = packPieces([4000, 1000, 1000], 5000);
    // First 1000 fills the 4000-piece's offcut exactly; the second 1000 needs a new bin.
    expect(result.binCount).toBe(2);
    expect(result.totalWasteMm).toBe(4000);
  });

  it("gives a piece longer than the stock its own oversized bin", () => {
    const result = packPieces([7000], 6000);
    expect(result.binCount).toBe(1);
    expect(result.bins[0]).toEqual([7000]);
  });
});

describe("chooseBestStockLength", () => {
  it("picks the stock length that minimises total purchased length", () => {
    const pieces = [3000, 3000, 3000];
    const best = chooseBestStockLength(pieces, [6000, 9000]);
    expect(best.stockLengthMm).toBe(9000);
    expect(best.binCount).toBe(1);
    expect(best.totalWasteMm).toBe(0);
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
    expect(plan.fullBoardsNeeded).toBe(0);
    expect(plan.wasteMm).toBe(0);
  });

  it("flags reusable offcuts at or above the reuse threshold", () => {
    const plan = computeCutPlan("mat", [3000], [3600]);
    // 3600 - 3000 = 600mm offcut, above the 300mm reuse threshold.
    expect(plan.offcutsReusable).toBe(1);
  });
});

describe("splitRunsToMaxLength", () => {
  it("leaves runs at or under the max length untouched", () => {
    expect(splitRunsToMaxLength([3000, 5000], 5400)).toEqual([3000, 5000]);
  });

  it("splits a run longer than the longest stock into equal spliced segments", () => {
    // A 14m board row with only 5.4m boards available needs 3 equal ~4.667m segments.
    const split = splitRunsToMaxLength([14000], 5400);
    expect(split).toHaveLength(3);
    for (const seg of split) expect(seg).toBeLessThanOrEqual(5400);
    expect(split.reduce((s, v) => s + v, 0)).toBeCloseTo(14000, 6);
  });

  it("prevents a too-long run from being priced as one unbuyable board", () => {
    const withoutSplit = computeCutPlan("mat", [14000], [5400]);
    const split = splitRunsToMaxLength([14000], 5400);
    const withSplit = computeCutPlan("mat", split, [5400]);
    // Splitting must not reduce the total purchased length below what's actually needed.
    expect(withSplit.fullBoardsNeeded * withSplit.chosenLengthMm).toBeGreaterThanOrEqual(14000);
    // The unsplit plan wrongly reports needing only one (oversized, unbuyable) board.
    expect(withoutSplit.fullBoardsNeeded).toBe(1);
    expect(withSplit.fullBoardsNeeded).toBeGreaterThan(1);
  });
});
