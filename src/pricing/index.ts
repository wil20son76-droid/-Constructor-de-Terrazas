/**
 * Pricing / cost engine. Pure functions producing a deterministic
 * CostSummary from a material cost figure, a labour cost figure, and the
 * project's configurable påslag (markup) / VAT (moms) / ROT settings.
 *
 * Påslag vs. margin: this engine applies a MARKUP on cost —
 * sellingPrice = cost * (1 + markupPercent / 100) — never a margin
 * (sellingPrice such that (sellingPrice - cost) / sellingPrice =
 * marginPercent). The two are mathematically different for the same
 * percent input; the UI must always label this "Påslag %".
 *
 * ROT-avdrag rules change over time and depend on the client's personal
 * tax situation — this module never assumes a rate, cap, or which cost
 * categories are eligible. It only applies whatever percent/limit/
 * eligibility the user has configured (see RotEligibility), all values
 * kept at full floating-point precision until the final presentation
 * layer rounds them for display.
 */
import type { BomLine, CostSummary, RotEligibility } from "../types";

export interface MarkupConfig {
  markupPercent: number;
  machineCost: number;
  transportCost: number;
  excavationCost: number;
  wasteRemovalCost: number;
}

export interface RotConfig {
  rotEnabled: boolean;
  rotPercent: number;
  rotMaxDeduction: number;
  eligibility: RotEligibility;
}

export function computeMaterialCost(bomLines: BomLine[]): number {
  return bomLines.filter((l) => !l.suppliedByClient).reduce((sum, l) => sum + l.purchaseTotal, 0);
}

export function computeClientSuppliedValue(bomLines: BomLine[]): number {
  return bomLines.filter((l) => l.suppliedByClient).reduce((sum, l) => sum + l.purchaseTotal, 0);
}

export function computeCostSummary(
  materialCost: number,
  labourCost: number,
  otherCostsTotal: number,
  markup: MarkupConfig,
  vatPercent: number,
  rot: RotConfig,
): CostSummary {
  const machineCost = markup.machineCost;
  const transportCost = markup.transportCost;
  const excavationCost = markup.excavationCost;
  const wasteRemovalCost = markup.wasteRemovalCost;
  const otherCost = otherCostsTotal;

  const subtotal = materialCost + labourCost + machineCost + transportCost + excavationCost + wasteRemovalCost + otherCost;

  // Påslag (markup on cost) — NOT a margin. cost=100, markup=20% -> 120.
  const markupAmount = subtotal * (markup.markupPercent / 100);
  const priceExVat = subtotal + markupAmount;
  const vatAmount = priceExVat * (vatPercent / 100);
  const priceIncVat = priceExVat + vatAmount;

  const rotEligibleAmount = rot.rotEnabled
    ? (rot.eligibility.materialEligible ? materialCost : 0) +
      (rot.eligibility.labourEligible ? labourCost : 0) +
      (rot.eligibility.machinesEligible ? machineCost : 0) +
      (rot.eligibility.transportEligible ? transportCost : 0)
    : 0;
  const rawRotDeduction = rotEligibleAmount * (rot.rotPercent / 100);
  const rotDeductionAmount = rot.rotEnabled ? Math.min(rawRotDeduction, rot.rotMaxDeduction) : 0;
  const priceAfterRot = priceIncVat - rotDeductionAmount;

  return {
    materialCost,
    labourCost,
    machineCost,
    transportCost,
    excavationCost,
    wasteRemovalCost,
    otherCost,
    subtotal,
    markupPercent: markup.markupPercent,
    markupAmount,
    priceExVat,
    vatPercent,
    vatAmount,
    priceIncVat,
    rotEnabled: rot.rotEnabled,
    rotPercent: rot.rotPercent,
    rotEligibleAmount,
    rotDeductionAmount,
    priceAfterRot,
  };
}
