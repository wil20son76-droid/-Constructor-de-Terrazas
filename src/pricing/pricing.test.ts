import { describe, expect, it } from "vitest";
import type { BomLine, RotEligibility } from "../types";
import { computeClientSuppliedValue, computeCostSummary, computeMaterialCost } from "./index";

function makeLine(overrides: Partial<BomLine>): BomLine {
  return {
    materialId: "m1",
    group: "TRALL",
    materialName: "Test",
    dimension: "",
    technicalQuantity: 1,
    unit: "st",
    pricePerUnit: 0,
    technicalCost: 0,
    wastePercent: 0,
    purchaseQuantity: 1,
    purchaseTotal: 0,
    ...overrides,
  };
}

const noEligibility: RotEligibility = {
  materialEligible: false,
  labourEligible: false,
  machinesEligible: false,
  transportEligible: false,
};

describe("computeMaterialCost", () => {
  it("excludes client-supplied lines from the priced material total, using PURCHASE quantity", () => {
    const lines: BomLine[] = [
      makeLine({ purchaseTotal: 1000, technicalCost: 900, suppliedByClient: false }),
      makeLine({ purchaseTotal: 500, technicalCost: 500, suppliedByClient: true }),
    ];
    expect(computeMaterialCost(lines)).toBe(1000);
    expect(computeClientSuppliedValue(lines)).toBe(500);
  });
});

describe("computeCostSummary — påslag (markup), not margin", () => {
  it("applies markup ON TOP of cost: cost=100, markup=20% -> 120 (not a margin calculation)", () => {
    const summary = computeCostSummary(
      100,
      0,
      0,
      { markupPercent: 20, machineCost: 0, transportCost: 0, excavationCost: 0, wasteRemovalCost: 0 },
      0,
      { rotEnabled: false, rotPercent: 0, rotMaxDeduction: 0, eligibility: noEligibility },
    );
    // Markup: sellingPrice = cost * (1 + markup%) = 100 * 1.20 = 120.
    // (A margin calculation would instead solve cost / (1 - margin%) = 100 / 0.8 = 125 — different!)
    expect(summary.subtotal).toBe(100);
    expect(summary.markupAmount).toBe(20);
    expect(summary.priceExVat).toBe(120);
  });

  it("applies markup on top of the internal subtotal, then VAT on top of that", () => {
    const summary = computeCostSummary(
      10000, // material
      5000, // labour
      0, // other
      { markupPercent: 20, machineCost: 0, transportCost: 0, excavationCost: 0, wasteRemovalCost: 0 },
      25,
      { rotEnabled: false, rotPercent: 0, rotMaxDeduction: 0, eligibility: noEligibility },
    );
    expect(summary.subtotal).toBe(15000);
    expect(summary.markupAmount).toBe(3000);
    expect(summary.priceExVat).toBe(18000);
    expect(summary.vatAmount).toBe(4500);
    expect(summary.priceIncVat).toBe(22500);
    expect(summary.priceAfterRot).toBe(22500);
  });
});

describe("computeCostSummary — ROT eligibility", () => {
  it("applies ROT only to labour by default, capped at the configured maximum", () => {
    const summary = computeCostSummary(
      10000,
      20000,
      0,
      { markupPercent: 0, machineCost: 0, transportCost: 0, excavationCost: 0, wasteRemovalCost: 0 },
      0,
      { rotEnabled: true, rotPercent: 50, rotMaxDeduction: 5000, eligibility: { ...noEligibility, labourEligible: true } },
    );
    // 50% of the 20000 labour cost = 10000, capped at the configured 5000 max.
    expect(summary.rotEligibleAmount).toBe(20000);
    expect(summary.rotDeductionAmount).toBe(5000);
    expect(summary.priceAfterRot).toBe(summary.priceIncVat - 5000);
  });

  it("never makes material/machines/transport ROT-eligible unless explicitly configured", () => {
    const summary = computeCostSummary(
      10000, // material
      20000, // labour
      0,
      { markupPercent: 0, machineCost: 3000, transportCost: 1000, excavationCost: 0, wasteRemovalCost: 0 },
      0,
      { rotEnabled: true, rotPercent: 100, rotMaxDeduction: 1_000_000, eligibility: { ...noEligibility, labourEligible: true } },
    );
    // Only labour (20000) counts, even though material/machine/transport costs exist.
    expect(summary.rotEligibleAmount).toBe(20000);
  });

  it("respects a user-widened eligibility (e.g. material also made ROT-eligible)", () => {
    const summary = computeCostSummary(
      10000,
      20000,
      0,
      { markupPercent: 0, machineCost: 0, transportCost: 0, excavationCost: 0, wasteRemovalCost: 0 },
      0,
      {
        rotEnabled: true,
        rotPercent: 100,
        rotMaxDeduction: 1_000_000,
        eligibility: { materialEligible: true, labourEligible: true, machinesEligible: false, transportEligible: false },
      },
    );
    expect(summary.rotEligibleAmount).toBe(30000); // material + labour
  });

  it("deducts nothing when ROT is disabled, regardless of eligibility flags", () => {
    const summary = computeCostSummary(
      10000,
      20000,
      0,
      { markupPercent: 0, machineCost: 0, transportCost: 0, excavationCost: 0, wasteRemovalCost: 0 },
      0,
      { rotEnabled: false, rotPercent: 100, rotMaxDeduction: 1_000_000, eligibility: { ...noEligibility, labourEligible: true } },
    );
    expect(summary.rotEligibleAmount).toBe(0);
    expect(summary.rotDeductionAmount).toBe(0);
  });
});
