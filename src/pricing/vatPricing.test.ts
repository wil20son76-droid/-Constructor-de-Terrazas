/**
 * VAT (moms) handling: a price entered "inkl. moms" is normalised to
 * exkl. moms before use, at whatever moms rate the project has configured
 * (never a hard-coded 25%); an "exkl." price is used as-is. No double
 * application of moms anywhere in the resolvers.
 */
import { describe, expect, it } from "vitest";
import type { MaterialPriceModel } from "../types";
import { normalizeExklMoms, resolveLumberPurchaseCost, resolveUnitPurchaseCost } from "./materialPricing";

describe("normalizeExklMoms — case D (inkl moms) / E (exkl moms)", () => {
  it("case E — exkl.-moms price passes through unchanged", () => {
    expect(normalizeExklMoms(80, "exkl", 25)).toBe(80);
  });

  it("case D — inkl.-moms price at 25% moms is divided down: 100 inkl -> 80 exkl", () => {
    expect(normalizeExklMoms(100, "inkl", 25)).toBeCloseTo(80, 6);
  });

  it("respects the project's configured moms rate, not a hard-coded 25%: 106 inkl at 6% -> 100 exkl", () => {
    expect(normalizeExklMoms(106, "inkl", 6)).toBeCloseTo(100, 6);
  });
});

describe("resolveLumberPurchaseCost applies VAT normalisation exactly once", () => {
  it("an inkl.-moms kr/m price is normalised before multiplying by length", () => {
    // 125 kr/m inkl. moms at 25% -> 100 kr/m exkl.; 4.2 m of it -> 420 kr.
    const priceModel: MaterialPriceModel = { price: 125, priceUnit: "kr/m", vatMode: "inkl", active: true };
    const result = resolveLumberPurchaseCost({ priceModel, byLength: [{ lengthMm: 4200, count: 1 }], vatPercent: 25 });
    expect(result.cost).toBeCloseTo(100 * 4.2, 6);
  });

  it("a stock variant's own vatMode overrides the material's default vatMode", () => {
    const priceModel: MaterialPriceModel = {
      price: 0,
      priceUnit: "kr/st",
      vatMode: "exkl", // material default is exkl...
      active: true,
      stockVariants: [{ id: "v1", lengthMm: 4200, price: 115, priceUnit: "kr/st", vatMode: "inkl" }], // ...but this one variant is inkl.
    };
    const result = resolveLumberPurchaseCost({ priceModel, byLength: [{ lengthMm: 4200, count: 1 }], vatPercent: 15 });
    // 115 inkl at 15% -> 100 exkl.
    expect(result.cost).toBeCloseTo(100, 6);
  });
});

describe("resolveUnitPurchaseCost applies VAT normalisation exactly once", () => {
  it("an inkl.-moms kr/st price is normalised before multiplying by quantity", () => {
    // 12.5 kr/st inkl at 25% -> 10 kr/st exkl; 6 units -> 60 kr.
    const priceModel: MaterialPriceModel = { price: 12.5, priceUnit: "kr/st", vatMode: "inkl", active: true };
    const result = resolveUnitPurchaseCost(priceModel, 6, 6, 25);
    expect(result.cost).toBeCloseTo(60, 6);
  });
});
