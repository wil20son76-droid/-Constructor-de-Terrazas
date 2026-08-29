/**
 * Pricing / cost engine. Pure functions producing a deterministic
 * CostSummary from a material cost figure, a labour cost figure, and the
 * project's configurable margin / VAT (moms) / ROT settings.
 *
 * ROT-avdrag rules change over time and depend on the client's personal
 * tax situation — this module never assumes a rate or cap. It only
 * applies whatever percent/limit the user has configured, and only ever
 * to the labour portion of the cost (materials are never ROT-deductible
 * under current Swedish rules), per the spec's explicit requirement.
 */
import type { BomLine, CostSummary } from "../types";

export interface MarginConfig {
  marginPercent: number;
  machineCost: number;
  transportCost: number;
  excavationCost: number;
  wasteRemovalCost: number;
}

export interface RotConfig {
  rotEnabled: boolean;
  rotPercent: number;
  rotMaxDeduction: number;
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
  margin: MarginConfig,
  vatPercent: number,
  rot: RotConfig,
): CostSummary {
  const machineCost = margin.machineCost;
  const transportCost = margin.transportCost;
  const excavationCost = margin.excavationCost;
  const wasteRemovalCost = margin.wasteRemovalCost;
  const otherCost = otherCostsTotal;

  const subtotal = materialCost + labourCost + machineCost + transportCost + excavationCost + wasteRemovalCost + otherCost;

  const marginAmount = subtotal * (margin.marginPercent / 100);
  const priceExVat = subtotal + marginAmount;
  const vatAmount = priceExVat * (vatPercent / 100);
  const priceIncVat = priceExVat + vatAmount;

  const rotDeductibleLabourAmount = rot.rotEnabled ? labourCost : 0;
  const rawRotDeduction = rotDeductibleLabourAmount * (rot.rotPercent / 100);
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
    marginPercent: margin.marginPercent,
    marginAmount,
    priceExVat,
    vatPercent,
    vatAmount,
    priceIncVat,
    rotEnabled: rot.rotEnabled,
    rotPercent: rot.rotPercent,
    rotDeductibleLabourAmount,
    rotDeductionAmount,
    priceAfterRot,
  };
}
