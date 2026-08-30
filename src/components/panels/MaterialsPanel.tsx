import type { BomGroup, BomLine, CutPlanResult, ValidationIssue } from "../../types";
import { formatMeters, formatSek } from "../../utils/format";
import { Section } from "./common";

interface Props {
  bomLines: BomLine[];
  cutPlans: CutPlanResult[];
  clientSuppliedMaterialIds: string[];
  onToggleClientSupplied: (materialId: string) => void;
  validation: ValidationIssue[];
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

export function MaterialsPanel({ bomLines, cutPlans, clientSuppliedMaterialIds, onToggleClientSupplied, validation }: Props) {
  const total = bomLines.filter((l) => !l.suppliedByClient).reduce((s, l) => s + l.purchaseTotal, 0);
  const errors = validation.filter((v) => v.severity === "error");

  if (errors.length > 0) {
    return (
      <div className="h-full overflow-y-auto p-3">
        <div className="rounded bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">Materialberäkningen visas inte — formen är ogiltig.</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
            {errors.map((e) => (
              <li key={e.id}>{e.message}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs">Rätta formen (se fliken Vista terrass/struktur) innan materialåtgången kan litas på.</p>
        </div>
      </div>
    );
  }

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
                      Behov (teknisk): {line.technicalQuantity} {line.unit}
                      {line.technicalLinearMeters !== undefined && ` (${formatMeters(line.technicalLinearMeters)})`}
                    </span>
                    <span>
                      Inköp: {line.purchaseQuantity} {line.unit}
                      {line.purchaseLinearMeters !== undefined && ` (${formatMeters(line.purchaseLinearMeters)})`}
                    </span>
                    <span className="font-semibold text-slate-800">{formatSek(line.purchaseTotal)}</span>
                  </div>
                  {line.purchaseBreakdown && line.purchaseBreakdown.length > 0 && (
                    <div className="mt-0.5 text-slate-400">
                      {line.purchaseBreakdown.map((g) => `${g.count} x ${(g.lengthMm / 1000).toFixed(1)} m`).join(" + ")}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        );
      })}

      <Section title="Kapoptimering">
        <ul className="space-y-1 text-xs text-slate-600">
          {cutPlans.map((plan, i) => (
            <li key={`${plan.materialId}-${i}`}>
              {plan.materialId}: teknisk {formatMeters(plan.requiredLengthMm / 1000)} ({plan.piecesCount} st,{" "}
              {plan.segmentsCount} segment{plan.spliceCount > 0 ? `, ${plan.spliceCount} skarvade` : ""}) → inköp{" "}
              {plan.purchasedBreakdown.map((g) => `${g.count} x ${(g.lengthMm / 1000).toFixed(1)} m`).join(" + ")} ={" "}
              {formatMeters(plan.totalPurchasedLengthMm / 1000)}, {plan.offcutsReusable} återanvändbara rester, spill{" "}
              {formatMeters(plan.wasteMm / 1000)} ({plan.wastePercent.toFixed(1)}%)
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
