/**
 * Cost-aware cut optimization: "Optimera för" Minsta spill / Lägsta
 * kostnad / Balanserad. All expected values below are derived by hand in
 * the comments, not copied from running the app.
 *
 * Worked example: two pieces of 3.5 m each, from stock lengths 3.6 m
 * (300 kr) and 4.2 m (150 kr) — deliberately pricing the LONGER board
 * cheaper (a real scenario: promotional/bulk pricing on one length),
 * so the waste-minimising choice and the cost-minimising choice differ
 * even though both are physically valid (each piece needs its own board
 * either way, since no stock length here holds two 3.5 m pieces).
 *
 * Per board:
 *   3.6 m: waste = 3.6 - 3.5 = 0.1 m,  cost = 300 kr
 *   4.2 m: waste = 4.2 - 3.5 = 0.7 m,  cost = 150 kr
 * Two boards needed (one per piece) under every mode:
 *   minWaste:  2 x 3.6 m -> cost 600 kr, waste 0.2 m (200 mm)
 *   minCost:   2 x 4.2 m -> cost 300 kr, waste 1.4 m (1400 mm)
 */
import { describe, expect, it } from "vitest";
import { computeCutPlan, packSegments } from "./cutOptimization";

const STOCK_LENGTHS = [3600, 4200];
const costPerLengthMm = (lengthMm: number) => (lengthMm === 3600 ? 300 : lengthMm === 4200 ? 150 : Infinity);

describe("cut optimization modes", () => {
  it("minWaste (the default, cost function present but mode explicit): picks the lower-waste 3.6 m board for both pieces", () => {
    const plan = computeCutPlan("m1", [3500, 3500], STOCK_LENGTHS, { mode: "minWaste", costPerLengthMm });
    expect(plan.purchasedBreakdown).toEqual([{ lengthMm: 3600, count: 2 }]);
    expect(plan.wasteMm).toBeCloseTo(200, 6);
    const totalCost = plan.purchasedBreakdown.reduce((s, g) => s + g.count * costPerLengthMm(g.lengthMm), 0);
    expect(totalCost).toBe(600);
  });

  it("with NO cost function at all, behaves exactly like minWaste (backward compatible default)", () => {
    const plan = computeCutPlan("m1", [3500, 3500], STOCK_LENGTHS);
    expect(plan.purchasedBreakdown).toEqual([{ lengthMm: 3600, count: 2 }]);
  });

  it("minCost: chooses the cheaper 4.2 m board for both pieces even though it wastes more material — case J (cheaper valid combination)", () => {
    const plan = computeCutPlan("m1", [3500, 3500], STOCK_LENGTHS, { mode: "minCost", costPerLengthMm });
    expect(plan.purchasedBreakdown).toEqual([{ lengthMm: 4200, count: 2 }]);
    expect(plan.wasteMm).toBeCloseTo(1400, 6);
    const totalCost = plan.purchasedBreakdown.reduce((s, g) => s + g.count * costPerLengthMm(g.lengthMm), 0);
    expect(totalCost).toBe(300);
    // Confirms it's cheaper than the minWaste plan above (200kr saved), not just different.
    expect(totalCost).toBeLessThan(600);
  });

  it("balanced: for this example, normalised waste dominates cost enough to still pick 3.6 m (hand-derived: score(3.6)=100/700+300/300=1.1429 < score(4.2)=700/700+150/300=1.5)", () => {
    const plan = computeCutPlan("m1", [3500, 3500], STOCK_LENGTHS, { mode: "balanced", costPerLengthMm });
    expect(plan.purchasedBreakdown).toEqual([{ lengthMm: 3600, count: 2 }]);
  });

  it("minCost scores by cost PER PIECE SERVED, not raw board price — a cheap board that only fits one piece can lose to a pricier board that fits two", () => {
    // Two 2.1 m pieces; stock 3.6 m at 50 kr (cheap alone, holds only ONE
    // 2.1 m piece) vs 4.2 m at 90 kr (pricier alone, but holds BOTH 2.1 m
    // pieces exactly). Raw-price comparison would wrongly pick 3.6 m twice
    // (2 x 50 = 100 kr); per-piece cost correctly prefers 4.2 m (90/2 = 45
    // < 50), landing both pieces in ONE board at 90 kr — genuinely cheaper.
    const cheap36Expensive42 = (lengthMm: number) => (lengthMm === 3600 ? 50 : lengthMm === 4200 ? 90 : Infinity);
    const plan = computeCutPlan("m1", [2100, 2100], [3600, 4200], { mode: "minCost", costPerLengthMm: cheap36Expensive42 });
    expect(plan.purchasedBreakdown).toEqual([{ lengthMm: 4200, count: 1 }]);
    expect(plan.totalPurchasedCount).toBe(1);
    const totalCost = plan.purchasedBreakdown.reduce((s, g) => s + g.count * cheap36Expensive42(g.lengthMm), 0);
    expect(totalCost).toBe(90);
    expect(totalCost).toBeLessThan(2 * 50); // cheaper than the naive raw-price choice would have been
  });

  it("packSegments with minCost mode produces the same bins as computeCutPlan for a single-segment-per-piece case", () => {
    const bins = packSegments(
      [
        { sourceIndex: 0, segmentIndex: 0, totalSegments: 1, lengthMm: 3500 },
        { sourceIndex: 1, segmentIndex: 0, totalSegments: 1, lengthMm: 3500 },
      ],
      STOCK_LENGTHS,
      { mode: "minCost", costPerLengthMm },
    );
    expect(bins).toHaveLength(2);
    expect(bins.every((b) => b.stockLengthMm === 4200)).toBe(true);
  });
});
