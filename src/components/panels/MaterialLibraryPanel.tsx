import { useState } from "react";
import type { Material, MaterialCategory, MaterialPriceModel, PriceUnit, StockVariant, VatMode } from "../../types";
import { makeId } from "../../geometry";
import { Section } from "./common";

interface Props {
  priceLibrary: Material[];
  onUpsertMaterial: (material: Material) => void;
  onDuplicateMaterial: (id: string) => void;
  onRemoveMaterial: (id: string) => void;
  onSetActive: (id: string, active: boolean) => void;
}

const categoryOrder: MaterialCategory[] = [
  "trall",
  "regel",
  "barlina",
  "stolpe",
  "plint",
  "skruv",
  "beslag",
  "kantbrada",
  "ventilationsprofil",
  "ovrigt",
];
const categoryLabels: Record<MaterialCategory, string> = {
  trall: "Trall",
  regel: "Reglar",
  barlina: "Bärlinor",
  stolpe: "Stolpar",
  plint: "Plintar",
  skruv: "Skruv",
  beslag: "Beslag",
  kantbrada: "Kantbrädor",
  ventilationsprofil: "Ventilationsprofiler",
  ovrigt: "Övrigt",
};
const priceUnits: PriceUnit[] = ["kr/st", "kr/m", "kr/lm", "kr/m2", "kr/förpackning", "kr/kg", "kr/set"];
const vatModes: { value: VatMode; label: string }[] = [
  { value: "exkl", label: "exkl. moms" },
  { value: "inkl", label: "inkl. moms" },
];

const emptyPriceModel: MaterialPriceModel = { price: 0, priceUnit: "kr/st", vatMode: "exkl", active: true };

function emptyMaterial(category: MaterialCategory): Material {
  return { id: makeId("mat"), category, name: "Nytt material", nameSv: "Nytt material", wastePercent: 0, priceModel: { ...emptyPriceModel } };
}

const inputXs = "w-full rounded border border-slate-300 px-1 py-0.5 text-xs";

export function MaterialLibraryPanel({ priceLibrary, onUpsertMaterial, onDuplicateMaterial, onRemoveMaterial, onSetActive }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const updateMaterial = (material: Material, patch: Partial<Material>) => onUpsertMaterial({ ...material, ...patch });
  const updatePrice = (material: Material, patch: Partial<MaterialPriceModel>) =>
    onUpsertMaterial({ ...material, priceModel: { ...(material.priceModel ?? emptyPriceModel), ...patch } });

  return (
    <div className="h-full overflow-y-auto">
      {categoryOrder.map((category) => {
        const materials = priceLibrary.filter((m) => m.category === category);
        if (materials.length === 0 && category !== "trall") return null;
        return (
          <Section key={category} title={categoryLabels[category]}>
            <div className="space-y-2">
              {materials.map((m) => {
                const pm = m.priceModel;
                const inactive = pm?.active === false;
                return (
                  <div key={m.id} className={`rounded border p-2 text-xs ${inactive ? "border-slate-200 bg-slate-50 opacity-60" : "border-slate-200"}`}>
                    <div className="mb-1 flex items-center gap-1">
                      <input
                        className="flex-1 rounded border border-slate-300 px-1.5 py-1 text-xs font-medium"
                        value={m.nameSv}
                        onChange={(e) => updateMaterial(m, { nameSv: e.target.value, name: e.target.value })}
                      />
                      <button type="button" title="Duplicera" onClick={() => onDuplicateMaterial(m.id)} className="rounded border border-slate-300 px-1.5 py-1 hover:bg-slate-100">
                        ⧉
                      </button>
                      <button
                        type="button"
                        title={inactive ? "Aktivera" : "Inaktivera"}
                        onClick={() => onSetActive(m.id, inactive)}
                        className="rounded border border-slate-300 px-1.5 py-1 hover:bg-slate-100"
                      >
                        {inactive ? "Aktivera" : "Inaktivera"}
                      </button>
                      <button
                        type="button"
                        title="Ta bort"
                        onClick={() => {
                          if (window.confirm(`Ta bort "${m.nameSv}" från materialbiblioteket?`)) onRemoveMaterial(m.id);
                        }}
                        className="rounded border border-red-200 px-1.5 py-1 text-red-600 hover:bg-red-50"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      <label>
                        <span className="block text-[10px] text-slate-500">Pris</span>
                        <input
                          type="number"
                          className={inputXs}
                          value={pm?.price ?? 0}
                          onChange={(e) => updatePrice(m, { price: Number(e.target.value) || 0, lastUpdated: new Date().toISOString().slice(0, 10) })}
                        />
                      </label>
                      <label>
                        <span className="block text-[10px] text-slate-500">Enhet</span>
                        <select className={inputXs} value={pm?.priceUnit ?? "kr/st"} onChange={(e) => updatePrice(m, { priceUnit: e.target.value as PriceUnit })}>
                          {priceUnits.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className="block text-[10px] text-slate-500">Moms</span>
                        <select className={inputXs} value={pm?.vatMode ?? "exkl"} onChange={(e) => updatePrice(m, { vatMode: e.target.value as VatMode })}>
                          {vatModes.map((v) => (
                            <option key={v.value} value={v.value}>
                              {v.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className="block text-[10px] text-slate-500">Leverantör</span>
                        <input className={inputXs} value={pm?.supplier ?? ""} onChange={(e) => updatePrice(m, { supplier: e.target.value || undefined })} />
                      </label>
                    </div>
                    {(pm?.priceUnit === "kr/förpackning" || pm?.priceUnit === "kr/m2") && (
                      <label className="mt-1 block">
                        <span className="block text-[10px] text-slate-500">
                          {pm.priceUnit === "kr/förpackning" ? "Antal per förpackning" : "m² per förpackning (valfritt)"}
                        </span>
                        <input
                          type="number"
                          className="w-24 rounded border border-slate-300 px-1 py-0.5 text-xs"
                          value={pm.packageSize ?? ""}
                          onChange={(e) => updatePrice(m, { packageSize: Number(e.target.value) || undefined })}
                        />
                      </label>
                    )}
                    {(m.availableLengthsMm?.length ?? 0) > 0 && (
                      <button type="button" className="mt-1.5 text-blue-600 hover:underline" onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}>
                        {expandedId === m.id ? "Dölj priser per längd" : `Priser per längd (${pm?.stockVariants?.length ?? 0}/${m.availableLengthsMm!.length})`}
                      </button>
                    )}
                    {expandedId === m.id && <StockVariantEditor material={m} onChange={(stockVariants) => updatePrice(m, { stockVariants })} />}
                    {pm?.lastUpdated && <div className="mt-1 text-[10px] text-slate-400">Uppdaterad {pm.lastUpdated}</div>}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => onUpsertMaterial(emptyMaterial(category))}
                className="w-full rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
              >
                + Nytt material
              </button>
            </div>
          </Section>
        );
      })}
    </div>
  );
}

function StockVariantEditor({ material, onChange }: { material: Material; onChange: (variants: StockVariant[]) => void }) {
  const variants = material.priceModel?.stockVariants ?? [];
  const lengths = material.availableLengthsMm ?? [];
  const findVariant = (lengthMm: number) => variants.find((v) => v.lengthMm === lengthMm);
  const setVariantPrice = (lengthMm: number, price: number) => {
    const existing = findVariant(lengthMm);
    const next = existing
      ? variants.map((v) => (v.lengthMm === lengthMm ? { ...v, price } : v))
      : [...variants, { id: makeId("variant"), lengthMm, price, priceUnit: "kr/st" as const }];
    onChange(next);
  };
  return (
    <div className="mt-1.5 rounded border border-slate-200 bg-slate-50 p-1.5">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-slate-500">
            <th className="text-left font-medium">Längd</th>
            <th className="text-left font-medium">Pris (kr/st)</th>
          </tr>
        </thead>
        <tbody>
          {lengths.map((lengthMm) => (
            <tr key={lengthMm}>
              <td className="py-0.5 pr-2">{lengthMm} mm</td>
              <td className="py-0.5">
                <input
                  type="number"
                  className="w-20 rounded border border-slate-300 px-1 py-0.5"
                  value={findVariant(lengthMm)?.price ?? ""}
                  placeholder="—"
                  onChange={(e) => setVariantPrice(lengthMm, Number(e.target.value) || 0)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[10px] text-slate-400">Tom ruta = inget pris angivet för den längden ("Pris saknas").</p>
    </div>
  );
}
