import type { BomGroup, BomLine, CutPlanResult } from "../../types";
import { formatMeters, formatSek } from "../../utils/format";
import { Section } from "./common";

interface Props {
  bomLines: BomLine[];
  cutPlans: CutPlanResult[];
  clientSuppliedMaterialIds: string[];
  onToggleClientSupplied: (materialId: string) => void;
}

const groupOrder: BomGroup[] = ["TRALL", "STOMME", "PLINTAR", "INFASTNING", "TRAPPA", "OVRIGT"];
const groupLabels: Record<BomGroup, string> = {
  TRALL: "Trall",
  STOMME: "Stomme",
  PLINTAR: "Plintar",
  INFASTNING: "Infästning",
  TRAPPA: "Trappa",
  OVRIGT: "Övrigt",
};

export function MaterialsPanel({ bomLines, cutPlans, clientSuppliedMaterialIds, onToggleClientSupplied }: Props) {
  const total = bomLines.filter((l) => !l.suppliedByClient).reduce((s, l) => s + l.purchaseTotal, 0);

  return (
    <div className="h-full overflow-y-auto">
      {groupOrder.map((group) => {
        const lines = bomLines.filter((l) => l.group === group);
        if (lines.length === 0) return null;
        return (
          <Section key={group} title={groupLabels[group]}>
            <ul className="space-y-2">
              {lines.map((line, i) => (
                <li key={`${line.materialId}-${i}`} className="rounded border border-slate-200 px-2 py-1.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-slate-800">
                      {line.materialName}
                      {line.dimension && <span className="ml-1 font-normal text-slate-400">{line.dimension}</span>}
                    </span>
                    <label className="flex shrink-0 items-center gap-1 text-[10px] text-slate-500">
                      <input
                        type="checkbox"
                        checked={clientSuppliedMaterialIds.includes(line.materialId)}
                        onChange={() => onToggleClientSupplied(line.materialId)}
                        title="Kund tillhandahåller material"
                      />
                      Kund
                    </label>
                  </div>
                  <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-slate-500">
                    <span>
                      Behov: {line.quantity} {line.unit}
                    </span>
                    <span>
                      Inköp: {line.purchaseQuantity} {line.unit}
                    </span>
                    <span className="font-semibold text-slate-800">{formatSek(line.purchaseTotal)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        );
      })}

      <Section title="Kapoptimering">
        <ul className="space-y-1 text-xs text-slate-600">
          {cutPlans.map((plan) => (
            <li key={plan.materialId}>
              {plan.materialId}: {formatMeters(plan.requiredLengthMm / 1000)} behövs → {plan.fullBoardsNeeded} st à{" "}
              {plan.chosenLengthMm} mm, {plan.offcutsReusable} återanvändbara rester, spill {plan.wastePercent.toFixed(1)}%
            </li>
          ))}
        </ul>
      </Section>

      <div className="sticky bottom-0 border-t border-slate-300 bg-white p-3 text-sm font-semibold">
        Materialtotal (exkl. kundtillhandahållet): {formatSek(total)}
      </div>
    </div>
  );
}
