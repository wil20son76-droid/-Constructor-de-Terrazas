import { describe, expect, it } from "vitest";
import type { CostSummary } from "../types";
import { assembleQuotation, quotationGroups, sumOtherCosts } from "./index";

function makeCostSummary(overrides: Partial<CostSummary> = {}): CostSummary {
  return {
    materialCost: 1000,
    labourCost: 500,
    machineCost: 100,
    transportCost: 50,
    excavationCost: 0,
    wasteRemovalCost: 0,
    otherCost: 0,
    subtotal: 1650,
    markupPercent: 20,
    markupAmount: 330,
    priceExVat: 1980,
    vatPercent: 25,
    vatAmount: 495,
    priceIncVat: 2475,
    rotEnabled: false,
    rotPercent: 0,
    rotEligibleAmount: 0,
    rotDeductionAmount: 0,
    priceAfterRot: 2475,
    materialCostIncomplete: false,
    missingPriceCount: 0,
    ...overrides,
  };
}

describe("assembleQuotation", () => {
  it("bundles info, BOM, labour and costs verbatim", () => {
    const info = {
      offertNumber: "OFF-1",
      date: "2026-01-01",
      clientName: "Test AB",
      clientAddress: "",
      projectAddress: "Testgatan 1",
      workDescription: "Ny terrass",
    };
    const costs = makeCostSummary();
    const quotation = assembleQuotation(info, [], [], costs);
    expect(quotation.info).toBe(info);
    expect(quotation.costs).toBe(costs);
  });
});

describe("quotationGroups", () => {
  it("maps the cost summary to the Arbete/Material/Maskiner/Transport/Övrigt breakdown", () => {
    const costs = makeCostSummary({ excavationCost: 200, wasteRemovalCost: 100, otherCost: 50 });
    const groups = quotationGroups(costs);
    expect(groups.find((g) => g.label === "Arbete")?.amount).toBe(500);
    expect(groups.find((g) => g.label === "Material")?.amount).toBe(1000);
    expect(groups.find((g) => g.label === "Maskiner")?.amount).toBe(100);
    expect(groups.find((g) => g.label === "Transport")?.amount).toBe(50);
    // Övrigt bundles excavation + waste removal + other.
    expect(groups.find((g) => g.label === "Övrigt")?.amount).toBe(200 + 100 + 50);
  });
});

describe("sumOtherCosts", () => {
  it("sums arbitrary cost items", () => {
    expect(sumOtherCosts([{ id: "a", description: "x", amount: 10 }, { id: "b", description: "y", amount: 25 }])).toBe(35);
    expect(sumOtherCosts([])).toBe(0);
  });
});

describe("makeCostSummary fixture sanity (not app output)", () => {
  it("is internally consistent: subtotal -> markup -> VAT chain matches computeCostSummary's formula", () => {
    // Hand check: subtotal=1650, markup 20% -> 330, priceExVat=1980, VAT 25% -> 495, priceIncVat=2475.
    const c = makeCostSummary();
    expect(c.subtotal + c.markupAmount).toBe(c.priceExVat);
    expect(c.priceExVat + c.vatAmount).toBe(c.priceIncVat);
    expect(c.rotEligibleAmount).toBeLessThanOrEqual(c.materialCost + c.labourCost + c.machineCost + c.transportCost);
  });
});
