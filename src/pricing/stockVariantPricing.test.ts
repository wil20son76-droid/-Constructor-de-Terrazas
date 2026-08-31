/**
 * Per-commercial-length stock variant pricing (Regel 45x120 example from
 * the spec: 3600mm=79kr/st, 4200mm=92, 4800mm=109, 5400mm=124). Proves the
 * engine never falls back to price/m x length when the user has entered an
 * explicit per-piece price for that exact length.
 */
import { describe, expect, it } from "vitest";
import type { MaterialPriceModel } from "../types";
import { resolveLumberPurchaseCost } from "./materialPricing";

const regel45x120: MaterialPriceModel = {
  price: 26, // legacy-style fallback rate, kr/m — must NOT be used once stockVariants match
  priceUnit: "kr/m",
  vatMode: "exkl",
  active: true,
  stockVariants: [
    { id: "v1", lengthMm: 3600, price: 79, priceUnit: "kr/st" },
    { id: "v2", lengthMm: 4200, price: 92, priceUnit: "kr/st" },
    { id: "v3", lengthMm: 4800, price: 109, priceUnit: "kr/st" },
    { id: "v4", lengthMm: 5400, price: 124, priceUnit: "kr/st" },
  ],
};

describe("resolveLumberPurchaseCost with stock variants", () => {
  it("uses the exact per-length price, not price/m x length (e.g. 4200mm != 26*4.2=109.2)", () => {
    const result = resolveLumberPurchaseCost({
      priceModel: regel45x120,
      byLength: [{ lengthMm: 4200, count: 1 }],
      vatPercent: 25,
    });
    expect(result.cost).toBe(92);
    expect(result.cost).not.toBeCloseTo(26 * 4.2, 1);
    expect(result.missing).toBe(false);
  });

  it("sums correctly across a mixed purchase: 3 x 3600mm + 2 x 4800mm = 3*79 + 2*109 = 455", () => {
    const result = resolveLumberPurchaseCost({
      priceModel: regel45x120,
      byLength: [
        { lengthMm: 3600, count: 3 },
        { lengthMm: 4800, count: 2 },
      ],
      vatPercent: 25,
    });
    expect(result.cost).toBe(3 * 79 + 2 * 109);
    expect(result.cost).toBe(455);
  });

  it("flags a purchased length with no matching variant as missing, contributing 0 (never extrapolated)", () => {
    const result = resolveLumberPurchaseCost({
      priceModel: regel45x120,
      byLength: [
        { lengthMm: 4200, count: 1 }, // has a variant: 92
        { lengthMm: 6000, count: 1 }, // no variant on file
      ],
      vatPercent: 25,
    });
    expect(result.cost).toBe(92); // only the priced length contributes
    expect(result.missing).toBe(true);
  });

  it("falls back to the flat kr/m rate when the material has NO stock variants at all", () => {
    const noVariants: MaterialPriceModel = { price: 26, priceUnit: "kr/m", vatMode: "exkl", active: true };
    const result = resolveLumberPurchaseCost({ priceModel: noVariants, byLength: [{ lengthMm: 4200, count: 1 }], vatPercent: 25 });
    expect(result.cost).toBeCloseTo(26 * 4.2, 6);
  });
});
