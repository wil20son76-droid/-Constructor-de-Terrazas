import type { CostItem, CostSummary, CutOptimizationMode, LabourItem, LabourRates, Project, QuotationInfo, VatMode } from "../../types";
import { formatSek } from "../../utils/format";
import { Field, inputClass, QuickButtons, Section } from "./common";

const optimizationModes: { value: CutOptimizationMode; label: string }[] = [
  { value: "minWaste", label: "Minsta spill" },
  { value: "minCost", label: "Lägsta kostnad" },
  { value: "balanced", label: "Balanserad" },
];

interface Props {
  project: Project;
  costs: CostSummary;
  labourItems: LabourItem[];
  onUpdateProject: (fn: (project: Project) => Project) => void;
}

function NumField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <input type="number" className={inputClass} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />;
}

export function CostsPanel({ project, costs, labourItems, onUpdateProject }: Props) {
  const rates = project.labourRates;
  const updateRates = (fn: (r: LabourRates) => LabourRates) =>
    onUpdateProject((p) => ({ ...p, labourRates: fn(p.labourRates) }));
  const updateInfo = (fn: (i: QuotationInfo) => QuotationInfo) =>
    onUpdateProject((p) => ({ ...p, quotationInfo: fn(p.quotationInfo) }));

  const addOtherCost = () =>
    onUpdateProject((p) => ({
      ...p,
      otherCosts: [...p.otherCosts, { id: `cost_${Date.now()}`, description: "Övrig kostnad", amount: 0 }],
    }));
  const updateOtherCost = (id: string, fn: (c: CostItem) => CostItem) =>
    onUpdateProject((p) => ({ ...p, otherCosts: p.otherCosts.map((c) => (c.id === id ? fn(c) : c)) }));
  const removeOtherCost = (id: string) =>
    onUpdateProject((p) => ({ ...p, otherCosts: p.otherCosts.filter((c) => c.id !== id) }));

  return (
    <div className="h-full overflow-y-auto">
      <Section title="Offertuppgifter">
        <Field label="Offertnummer">
          <input
            className={inputClass}
            value={project.quotationInfo.offertNumber}
            onChange={(e) => updateInfo((i) => ({ ...i, offertNumber: e.target.value }))}
          />
        </Field>
        <Field label="Kund">
          <input
            className={inputClass}
            value={project.quotationInfo.clientName}
            onChange={(e) => updateInfo((i) => ({ ...i, clientName: e.target.value }))}
          />
        </Field>
        <Field label="Projektadress">
          <input
            className={inputClass}
            value={project.quotationInfo.projectAddress}
            onChange={(e) => updateInfo((i) => ({ ...i, projectAddress: e.target.value }))}
          />
        </Field>
      </Section>

      <Section title="Arbetstid (produktivitet)">
        <Field label="Stomme (h/m²)">
          <NumField value={rates.stommeHoursPerM2} onChange={(v) => updateRates((r) => ({ ...r, stommeHoursPerM2: v }))} />
        </Field>
        <Field label="Trall (h/m²)">
          <NumField value={rates.trallHoursPerM2} onChange={(v) => updateRates((r) => ({ ...r, trallHoursPerM2: v }))} />
        </Field>
        <Field label="Plint/stolpe (h/st)">
          <NumField value={rates.plintHoursPerUnit} onChange={(v) => updateRates((r) => ({ ...r, plintHoursPerUnit: v }))} />
        </Field>
        <Field label="Trappa (h/st)">
          <NumField value={rates.stairHoursPerUnit} onChange={(v) => updateRates((r) => ({ ...r, stairHoursPerUnit: v }))} />
        </Field>
        <Field label="Kantbräda (h/m)">
          <NumField value={rates.kantbradaHoursPerMeter} onChange={(v) => updateRates((r) => ({ ...r, kantbradaHoursPerMeter: v }))} />
        </Field>
        <Field label="Timpris (kr/h)">
          <NumField value={rates.hourlyRate} onChange={(v) => updateRates((r) => ({ ...r, hourlyRate: v }))} />
        </Field>
        <Field label="Antal arbetare">
          <NumField value={rates.workerCount} onChange={(v) => updateRates((r) => ({ ...r, workerCount: v }))} />
        </Field>
        <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
          {labourItems.map((item) => (
            <li key={item.id}>
              {item.description}: {item.hours.toFixed(1)} h → {formatSek(item.cost)}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Övriga kostnader">
        <Field label="Maskiner (kr)">
          <NumField value={project.markup.machineCost} onChange={(v) => onUpdateProject((p) => ({ ...p, markup: { ...p.markup, machineCost: v } }))} />
        </Field>
        <Field label="Transport (kr)">
          <NumField value={project.markup.transportCost} onChange={(v) => onUpdateProject((p) => ({ ...p, markup: { ...p.markup, transportCost: v } }))} />
        </Field>
        <Field label="Schaktning (kr)">
          <NumField value={project.markup.excavationCost} onChange={(v) => onUpdateProject((p) => ({ ...p, markup: { ...p.markup, excavationCost: v } }))} />
        </Field>
        <Field label="Bortforsling (kr)">
          <NumField value={project.markup.wasteRemovalCost} onChange={(v) => onUpdateProject((p) => ({ ...p, markup: { ...p.markup, wasteRemovalCost: v } }))} />
        </Field>
        {project.otherCosts.map((c) => (
          <div key={c.id} className="mb-1 flex gap-1">
            <input
              className={inputClass}
              value={c.description}
              onChange={(e) => updateOtherCost(c.id, (cc) => ({ ...cc, description: e.target.value }))}
            />
            <input
              type="number"
              className={`${inputClass} w-24`}
              value={c.amount}
              onChange={(e) => updateOtherCost(c.id, (cc) => ({ ...cc, amount: Number(e.target.value) || 0 }))}
            />
            <button type="button" className="text-red-600" onClick={() => removeOtherCost(c.id)}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" onClick={addOtherCost} className="text-xs text-blue-600 hover:underline">
          + Lägg till kostnad
        </button>
      </Section>

      <Section title="Påslag, moms & ROT">
        <Field label="Påslag % (på kostnad)">
          <QuickButtons
            values={[10, 15, 20, 25, 30]}
            current={project.markup.markupPercent}
            onSelect={(v) => onUpdateProject((p) => ({ ...p, markup: { ...p.markup, markupPercent: v } }))}
          />
        </Field>
        <Field label="Moms (%)">
          <NumField value={project.settings.vatPercent} onChange={(v) => onUpdateProject((p) => ({ ...p, settings: { ...p.settings, vatPercent: v } }))} />
        </Field>
        <label className="mb-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={project.settings.rotEnabled}
            onChange={(e) => onUpdateProject((p) => ({ ...p, settings: { ...p.settings, rotEnabled: e.target.checked } }))}
          />
          ROT-avdrag aktiverat
        </label>
        {project.settings.rotEnabled && (
          <>
            <Field label="ROT-procent (%)">
              <NumField value={project.settings.rotPercent} onChange={(v) => onUpdateProject((p) => ({ ...p, settings: { ...p.settings, rotPercent: v } }))} />
            </Field>
            <Field label="Max avdrag (kr)">
              <NumField value={project.settings.rotMaxDeduction} onChange={(v) => onUpdateProject((p) => ({ ...p, settings: { ...p.settings, rotMaxDeduction: v } }))} />
            </Field>
            <div className="mb-2 space-y-1 text-sm">
              <p className="text-xs font-medium text-slate-600">Avdragsgilla kostnadsslag</p>
              {(
                [
                  ["labourEligible", "Arbete"],
                  ["materialEligible", "Material"],
                  ["machinesEligible", "Maskiner"],
                  ["transportEligible", "Transport"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={project.settings.rotEligibility[key]}
                    onChange={(e) =>
                      onUpdateProject((p) => ({
                        ...p,
                        settings: { ...p.settings, rotEligibility: { ...p.settings.rotEligibility, [key]: e.target.checked } },
                      }))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-400">
              Standard: endast arbetskostnad är avdragsgill. Kontrollera aktuella Skatteverket-regler och gränser innan du ändrar.
            </p>
          </>
        )}
      </Section>

      <Section title="Materialprissättning">
        <Field label="Optimera kapning för">
          <div className="flex gap-1">
            {optimizationModes.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => onUpdateProject((p) => ({ ...p, settings: { ...p.settings, cutOptimizationMode: m.value } }))}
                className={`flex-1 rounded border px-1.5 py-1 text-xs ${
                  (project.settings.cutOptimizationMode ?? "minCost") === m.value
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-300 text-slate-600"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Inmatade priser är">
          <div className="flex gap-1">
            {([{ value: "exkl", label: "exkl. moms" }, { value: "inkl", label: "inkl. moms" }] as { value: VatMode; label: string }[]).map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => onUpdateProject((p) => ({ ...p, settings: { ...p.settings, defaultPriceVatMode: v.value } }))}
                className={`flex-1 rounded border px-1.5 py-1 text-xs ${
                  (project.settings.defaultPriceVatMode ?? "exkl") === v.value
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-300 text-slate-600"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-400">Standard för nya material i Materialbibliotek — varje material kan ändå ha sin egen momsinställning.</p>
        </Field>
      </Section>

      {costs.materialCostIncomplete && (
        <div className="m-3 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          Materialkostnad ofullständig — {costs.missingPriceCount} pris{costs.missingPriceCount === 1 ? "" : "er"} saknas i Materialbibliotek eller BOM. Summorna nedan är beräknade ändå, men underskattar den verkliga kostnaden.
        </div>
      )}

      <Section title="Kostnadssammanställning">
        <table className="w-full text-sm">
          <tbody>
            <Row label="Material" value={costs.materialCost} />
            <Row label="Arbete" value={costs.labourCost} />
            <Row label="Maskiner" value={costs.machineCost} />
            <Row label="Transport" value={costs.transportCost} />
            <Row label="Schaktning" value={costs.excavationCost} />
            <Row label="Bortforsling" value={costs.wasteRemovalCost} />
            <Row label="Övrigt" value={costs.otherCost} />
            <Row label="Delsumma (internt, kostnad)" value={costs.subtotal} bold />
            <Row label={`Påslag (${costs.markupPercent}%)`} value={costs.markupAmount} />
            <Row label="Pris exkl. moms" value={costs.priceExVat} bold />
            <Row label={`Moms (${costs.vatPercent}%)`} value={costs.vatAmount} />
            <Row label="Pris inkl. moms" value={costs.priceIncVat} bold />
            {costs.rotEnabled && <Row label="ROT-avdrag" value={-costs.rotDeductionAmount} />}
            {costs.rotEnabled && <Row label="Att betala efter ROT" value={costs.priceAfterRot} bold />}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <tr className={bold ? "border-t border-slate-300 font-semibold" : ""}>
      <td className="py-1 text-slate-600">{label}</td>
      <td className="py-1 text-right">{formatSek(value)}</td>
    </tr>
  );
}
