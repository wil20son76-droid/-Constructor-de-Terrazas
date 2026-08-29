import { describe, expect, it } from "vitest";
import type { BomLine } from "../types";
import { computeClientSuppliedValue, computeCostSummary, computeMaterialCost } from "./index";

function makeLine(overrides: Partial<BomLine>): BomLine {
  return {
    materialId: "m1",
    group: "TRALL",
    materialName: "Test",
    dimension: "",
    quantity: 1,
    unit: "st",
    pricePerUnit: 0,
    subtotal: 0,
    wastePercent: 0,
    purchaseQuantity: 1,
    purchaseTotal: 0,
    ...overrides,
  };
}

describe("computeMaterialCost", () => {
  it("excludes client-supplied lines from the priced material total", () => {
    const lines: BomLine[] = [
      makeLine({ purchaseTotal: 1000, suppliedByClient: false }),
      makeLine({ purchaseTotal: 500, suppliedByClient: true }),
    ];
    expect(computeMaterialCost(lines)).toBe(1000);
    expect(computeClientSuppliedValue(lines)).toBe(500);
  });
});

describe("computeCostSummary", () => {
  it("applies margin on top of the internal subtotal, then VAT on top of that", () => {
    const summary = computeCostSummary(
      10000, // material
      5000, // labour
      0, // other
      { marginPercent: 20, machineCost: 0, transportCost: 0, excavationCost: 0, wasteRemovalCost: 0 },
      25,
      { rotEnabled: false, rotPercent: 0, rotMaxDeduction: 0 },
    );
    expect(summary.subtotal).toBe(15000);
    expect(summary.marginAmount).toBe(3000);
    expect(summary.priceExVat).toBe(18000);
    expect(summary.vatAmount).toBe(4500);
    expect(summary.priceIncVat).toBe(22500);
    expect(summary.priceAfterRot).toBe(22500);
  });

  it("applies ROT only to the labour cost, capped at the configured maximum", () => {
    const summary = computeCostSummary(
      10000,
      20000,
      0,
      { marginPercent: 0, machineCost: 0, transportCost: 0, excavationCost: 0, wasteRemovalCost: 0 },
      0,
      { rotEnabled: true, rotPercent: 50, rotMaxDeduction: 5000 },
    );
    // 50% of 20000 labour = 10000, capped at 5000.
    expect(summary.rotDeductibleLabourAmount).toBe(20000);
    expect(summary.rotDeductionAmount).toBe(5000);
    expect(summary.priceAfterRot).toBe(summary.priceIncVat - 5000);
  });
});
