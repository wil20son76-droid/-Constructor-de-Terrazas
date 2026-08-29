/**
 * Quotation (offert) assembly. Combines the BOM, labour items and cost
 * summary into the printable/exportable Quotation shape. Materials the
 * client supplies themselves appear in the BOM (so quantities are still
 * known) but never contribute to the priced total — enforced upstream in
 * `pricing.computeMaterialCost`, which excludes `suppliedByClient` lines.
 */
import type { BomLine, CostItem, CostSummary, LabourItem, Quotation, QuotationInfo } from "../types";

export function assembleQuotation(
  info: QuotationInfo,
  bom: BomLine[],
  labour: LabourItem[],
  costs: CostSummary,
): Quotation {
  return { info, bom, labour, costs };
}

export function sumOtherCosts(items: CostItem[]): number {
  return items.reduce((sum, i) => sum + i.amount, 0);
}

export interface QuotationLineGroup {
  label: string;
  amount: number;
}

/** High-level Arbete/Material/Maskiner/Transport/Övrigt breakdown for the offert view. */
export function quotationGroups(costs: CostSummary): QuotationLineGroup[] {
  return [
    { label: "Arbete", amount: costs.labourCost },
    { label: "Material", amount: costs.materialCost },
    { label: "Maskiner", amount: costs.machineCost },
    { label: "Transport", amount: costs.transportCost },
    { label: "Övrigt", amount: costs.excavationCost + costs.wasteRemovalCost + costs.otherCost },
  ];
}
