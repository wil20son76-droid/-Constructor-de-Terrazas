import { useState } from "react";
import type { BomGroup, BomLine, CutPlanResult, Material, ValidationIssue } from "../../types";
import { formatMeters, formatSek } from "../../utils/format";
import { Section } from "./common";
import { MaterialLibraryPanel } from "./MaterialLibraryPanel";

interface Props {
  bomLines: BomLine[];
  cutPlans: CutPlanResult[];
  clientSuppliedMaterialIds: string[];
  onToggleClientSupplied: (materialId: string) => void;
  validation: ValidationIssue[];
  priceLibrary: Material[];
  onUpsertLibraryMaterial: (material: Material) => void;
  onDuplicateLibraryMaterial: (id: string) => void;
  onRemoveLibraryMaterial: (id: string) => void;
  onSetLibraryMaterialActive: (id: string, active: boolean) => void;
  onSetProjectMaterialOverride: (materialId: string, price: { price: number; priceUnit: string; vatMode: string; supplier?: string }, locked: boolean) => void;
  onClearProjectMaterialOverride: (materialId: string) => void;
  onExportPricesCsv: () => void;
  onImportPricesCsv: (file: File) => void;
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

function EditablePriceCell({
  line,
  priceLibrary,
  onUpsertLibraryMaterial,
  onSetProjectMaterialOverride,
}: Pick<Props, "priceLibrary" | "onUpsertLibraryMaterial" | "onSetProjectMaterialOverride"> & { line: BomLine }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const material = priceLibrary.find((m) => m.id === line.materialId);
  const priceModel = material?.priceModel;

  if (!editing) {
    return (
      <button
        type="button"
        className="rounded border border-transparent px-1 text-left underline decoration-dotted hover:border-slate-300"
        title="Klicka för att redigera priset"
        onClick={() => {
          setValue(String(Math.round(line.pricePerUnit * 100) / 100));
          setEditing(true);
        }}
      >
        {line.pricePerUnit.toLocaleString("sv-SE", { maximumFractionDigits: 2 })} {line.priceUnit ?? "kr/st"}
      </button>
    );
  }

  const commit = () => {
    setEditing(false);
    const newPrice = Number(value.replace(",", "."));
    if (Number.isNaN(newPrice) || newPrice < 0 || !priceModel || !material) return;
    if (newPrice === line.pricePerUnit) return;
    const updateLibrary = window.confirm(
      'Uppdatera materialbiblioteket?\n\nOK = "Ja" — det nya priset gäller för alla framtida projekt.\nAvbryt = "Endast detta projekt" — priset låses bara här.',
    );
    if (updateLibrary) {
      onUpsertLibraryMaterial({
        ...material,
        priceModel: { ...priceModel, price: newPrice, lastUpdated: new Date().toISOString().slice(0, 10) },
      });
    } else {
      onSetProjectMaterialOverride(
        line.materialId,
        { price: newPrice, priceUnit: priceModel.priceUnit, vatMode: priceModel.vatMode, supplier: priceModel.supplier },
        true,
      );
    }
  };

  return (
    <input
      autoFocus
      type="number"
      className="w-20 rounded border border-blue-400 px-1 py-0.5 text-xs"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

export function MaterialsPanel(props: Props) {
  const { bomLines, cutPlans, clientSuppliedMaterialIds, onToggleClientSupplied, validation } = props;
  const [tab, setTab] = useState<"bom" | "bibliotek">("bom");
  const total = bomLines.filter((l) => !l.suppliedByClient).reduce((s, l) => s + l.purchaseTotal, 0);
  const errors = validation.filter((v) => v.severity === "error");

  const tabBar = (
    <div className="flex gap-1 border-b border-slate-200 p-2">
      <button
        type="button"
        onClick={() => setTab("bom")}
        className={`flex-1 rounded px-2 py-1 text-xs font-medium ${tab === "bom" ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"}`}
      >
        BOM
      </button>
      <button
        type="button"
        onClick={() => setTab("bibliotek")}
        className={`flex-1 rounded px-2 py-1 text-xs font-medium ${tab === "bibliotek" ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"}`}
      >
        Materialbibliotek
      </button>
    </div>
  );

  if (tab === "bibliotek") {
    return (
      <div className="flex h-full flex-col">
        {tabBar}
        <div className="flex gap-1 border-b border-slate-200 p-2">
          <button type="button" onClick={props.onExportPricesCsv} className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
            Exportera CSV
          </button>
          <label className="flex-1 cursor-pointer rounded border border-slate-300 px-2 py-1 text-center text-xs hover:bg-slate-50">
            Importera CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) props.onImportPricesCsv(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <div className="min-h-0 flex-1">
          <MaterialLibraryPanel
            priceLibrary={props.priceLibrary}
            onUpsertMaterial={props.onUpsertLibraryMaterial}
            onDuplicateMaterial={props.onDuplicateLibraryMaterial}
            onRemoveMaterial={props.onRemoveLibraryMaterial}
            onSetActive={props.onSetLibraryMaterialActive}
          />
        </div>
      </div>
    );
  }

  if (errors.length > 0) {
    return (
      <div className="flex h-full flex-col">
        {tabBar}
        <div className="overflow-y-auto p-3">
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
      </div>
    );
  }

  const missingCount = bomLines.filter((l) => !l.suppliedByClient && l.priceMissing).length;

  return (
    <div className="flex h-full flex-col">
      {tabBar}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {missingCount > 0 && (
          <div className="m-2 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
            Materialkostnad ofullständig — {missingCount} pris{missingCount === 1 ? "" : "er"} saknas. Kvantiteterna ovan är ändå korrekta.
          </div>
        )}
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
                    </div>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                      <div className="flex items-center gap-2 text-slate-500">
                        <EditablePriceCell
                          line={line}
                          priceLibrary={props.priceLibrary}
                          onUpsertLibraryMaterial={props.onUpsertLibraryMaterial}
                          onSetProjectMaterialOverride={props.onSetProjectMaterialOverride}
                        />
                        {line.supplier && <span>· {line.supplier}</span>}
                        {line.priceIsOverride && (
                          <span className="flex items-center gap-1 rounded bg-blue-50 px-1 text-blue-700">
                            Låst i projekt
                            <button
                              type="button"
                              title="Lås upp — använd biblioteksprisets nuvarande värde igen"
                              onClick={() => props.onClearProjectMaterialOverride(line.materialId)}
                              className="underline hover:no-underline"
                            >
                              Lås upp
                            </button>
                          </span>
                        )}
                        {line.priceMissing && !line.suppliedByClient && <span className="rounded bg-amber-50 px-1 text-amber-700">Pris saknas</span>}
                      </div>
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
      </div>

      <div className="sticky bottom-0 border-t border-slate-300 bg-white p-3 text-sm font-semibold">
        Materialtotal (exkl. kundtillhandahållet): {formatSek(total)}
        {missingCount > 0 && <span className="ml-2 text-xs font-normal text-amber-700">(ofullständig)</span>}
      </div>
    </div>
  );
}
