/**
 * Package (kr/förpackning) and area (kr/m2) pricing — the Trallskruv and
 * composite-decking examples from the spec.
 */
import { describe, expect, it } from "vitest";
import type { MaterialPriceModel } from "../types";
import { resolveLumberPurchaseCost, resolveUnitPurchaseCost } from "./materialPricing";

describe("resolveUnitPurchaseCost — kr/förpackning", () => {
  it("Trallskruv: 200 st/förp @ 599 kr, need 742 st -> 4 packs, 800 st, 2396 kr", () => {
    const priceModel: MaterialPriceModel = { price: 599, priceUnit: "kr/förpackning", vatMode: "exkl", packageSize: 200, active: true };
    const result = resolveUnitPurchaseCost(priceModel, 742, 0, 25);
    expect(result.purchaseQuantity).toBe(4); // ceil(742/200)
    expect(result.cost).toBe(4 * 599);
    expect(result.cost).toBe(2396);
  });

  it("an exact multiple needs no extra package: 400 st at 200/pack -> exactly 2 packs", () => {
    const priceModel: MaterialPriceModel = { price: 599, priceUnit: "kr/förpackning", vatMode: "exkl", packageSize: 200, active: true };
    const result = resolveUnitPurchaseCost(priceModel, 400, 0, 25);
    expect(result.purchaseQuantity).toBe(2);
    expect(result.cost).toBe(1198);
  });
});

describe("resolveUnitPurchaseCost — kr/st (packageSize absent)", () => {
  it("Betongplint: 149 kr/st, 6 needed -> 6 purchased, 894 kr", () => {
    const priceModel: MaterialPriceModel = { price: 149, priceUnit: "kr/st", vatMode: "exkl", active: true };
    const result = resolveUnitPurchaseCost(priceModel, 6, 6, 25);
    expect(result.cost).toBe(6 * 149);
    expect(result.purchaseQuantity).toBe(6);
  });
});

describe("resolveLumberPurchaseCost — kr/m2 (composite decking sold by area)", () => {
  it("899 kr/m2, no packaging: 10 boards of 4000mm x 140mm width = 5.6 m2 -> 5033.6 kr", () => {
    const priceModel: MaterialPriceModel = { price: 899, priceUnit: "kr/m2", vatMode: "exkl", active: true };
    const result = resolveLumberPurchaseCost({
      priceModel,
      byLength: [{ lengthMm: 4000, count: 10 }],
      vatPercent: 25,
      widthMm: 140,
    });
    // area = (4000*10 * 140) / 1_000_000 = 5.6 m2
    expect(result.purchaseAreaM2).toBeCloseTo(5.6, 6);
    expect(result.cost).toBeCloseTo(5.6 * 899, 6);
  });

  it("rounds up to whole boxes when packageAreaM2 is set: 1 box = 2.3 m2, needing 5.6 m2 -> 3 boxes = 6.9 m2", () => {
    const priceModel: MaterialPriceModel = { price: 899, priceUnit: "kr/m2", vatMode: "exkl", packageSize: 2.3, active: true };
    const result = resolveLumberPurchaseCost({
      priceModel,
      byLength: [{ lengthMm: 4000, count: 10 }],
      vatPercent: 25,
      widthMm: 140,
    });
    expect(result.purchaseAreaM2).toBeCloseTo(6.9, 6); // ceil(5.6/2.3)=3 boxes * 2.3
    expect(result.cost).toBeCloseTo(6.9 * 899, 6);
  });
});
