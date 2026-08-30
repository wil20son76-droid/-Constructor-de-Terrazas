import type { DeckLevel, MaterialLibrary, ValidationIssue } from "../../types";
import type { UniformSpacingResult } from "../../structural";
import { STRUCTURAL_DISCLAIMER } from "../../validation";
import { formatMm } from "../../utils/format";
import { Field, inputClass, MaterialSelect, QuickButtons, Section } from "./common";

interface Props {
  level: DeckLevel;
  library: MaterialLibrary;
  validation: ValidationIssue[];
  jointCount: { joists: number; beams: number; footings: number; posts: number };
  regelCcInfo: UniformSpacingResult;
  barlinaSpacingInfo: UniformSpacingResult;
  onUpdate: (fn: (level: DeckLevel) => DeckLevel) => void;
}

function CcSummary({ info }: { info: UniformSpacingResult }) {
  return (
    <dl className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 rounded bg-slate-50 px-2 py-1.5 text-xs">
      <dt className="text-slate-500">CC max</dt>
      <dd className="text-right font-medium">{formatMm(info.maxSpacingMm)}</dd>
      <dt className="text-slate-500">CC verklig</dt>
      <dd className="text-right font-medium">{formatMm(info.realSpacingMm)}</dd>
      <dt className="text-slate-500">Antal fack</dt>
      <dd className="text-right font-medium">{info.numberOfSpaces}</dd>
      <dt className="text-slate-500">Antal element</dt>
      <dd className="text-right font-medium">{info.numberOfMembers}</dd>
    </dl>
  );
}

export function StructurePanel({ level, library, validation, jointCount, regelCcInfo, barlinaSpacingInfo, onUpdate }: Props) {
  return (
    <div className="h-full overflow-y-auto">
      <Section title="Reglar">
        <Field label="CC-avstånd (mm)">
          <QuickButtons
            values={[300, 400, 450, 600]}
            current={level.regelSpacing}
            onSelect={(v) => onUpdate((l) => ({ ...l, regelSpacing: v }))}
          />
          <input
            type="number"
            className={`${inputClass} mt-1`}
            value={level.regelSpacing}
            onChange={(e) => onUpdate((l) => ({ ...l, regelSpacing: Number(e.target.value) || 1 }))}
          />
        </Field>
        <Field label="Regelmaterial">
          <MaterialSelect
            materials={library.materials}
            category="regel"
            value={level.regelMaterialId}
            onChange={(id) => onUpdate((l) => ({ ...l, regelMaterialId: id }))}
          />
        </Field>
        <div className="text-xs text-slate-500">Antal reglar: {jointCount.joists} st</div>
        <CcSummary info={regelCcInfo} />
      </Section>

      <Section title="Bärlinor">
        <Field label="Max spannlängd (mm)">
          <input
            type="number"
            className={inputClass}
            value={level.barlinaMaxSpacing}
            onChange={(e) => onUpdate((l) => ({ ...l, barlinaMaxSpacing: Number(e.target.value) || 1 }))}
          />
        </Field>
        <Field label="Bärlinamaterial">
          <MaterialSelect
            materials={library.materials}
            category="barlina"
            value={level.barlinaMaterialId}
            onChange={(id) => onUpdate((l) => ({ ...l, barlinaMaterialId: id }))}
          />
        </Field>
        <div className="text-xs text-slate-500">Antal bärlinor: {jointCount.beams} st</div>
        <CcSummary info={barlinaSpacingInfo} />
      </Section>

      <Section title="Plintar">
        <Field label="Plinttyp">
          <select
            className={inputClass}
            value={level.plintTypeId}
            onChange={(e) => onUpdate((l) => ({ ...l, plintTypeId: e.target.value }))}
          >
            {library.plintTypes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nameSv}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Max avstånd (mm)">
          <QuickButtons
            values={[1200, 1500, 1800, 2000]}
            current={level.plintMaxSpacing}
            onSelect={(v) => onUpdate((l) => ({ ...l, plintMaxSpacing: v }))}
          />
          <input
            type="number"
            className={`${inputClass} mt-1`}
            value={level.plintMaxSpacing}
            onChange={(e) => onUpdate((l) => ({ ...l, plintMaxSpacing: Number(e.target.value) || 1 }))}
          />
        </Field>
        <div className="text-xs text-slate-500">Antal plintar: {jointCount.footings} st</div>
      </Section>

      <Section title="Stolpar">
        <Field label="Stolpmaterial">
          <MaterialSelect
            materials={library.materials}
            category="stolpe"
            value={level.postMaterialId ?? ""}
            onChange={(id) => onUpdate((l) => ({ ...l, postMaterialId: id }))}
          />
        </Field>
        <div className="text-xs text-slate-500">Antal stolpar: {jointCount.posts} st</div>
      </Section>

      <Section title="Kortlingar">
        <Field label="Avstånd (mm), 0 = ingen">
          <QuickButtons
            values={[0, 1200, 1800, 2400]}
            current={level.kortlingSpacing ?? 0}
            onSelect={(v) => onUpdate((l) => ({ ...l, kortlingSpacing: v || undefined }))}
          />
        </Field>
      </Section>

      <Section title="Trappor">
        {level.stairs.length === 0 ? (
          <p className="text-xs text-slate-400">Ingen trappa tillagd. Använd "Lägg till trappa" i vänsterpanelen och klicka på en kant.</p>
        ) : (
          <div className="space-y-3">
            {level.stairs.map((stair) => {
              const edgeCount = level.polygon.points.length;
              const fromLabel = ((stair.edgeIndex % edgeCount) + edgeCount) % edgeCount;
              const toLabel = (fromLabel + 1) % edgeCount;
              const updateStair = (patch: Partial<typeof stair>) =>
                onUpdate((l) => ({ ...l, stairs: l.stairs.map((s) => (s.id === stair.id ? { ...s, ...patch } : s)) }));
              return (
                <div key={stair.id} className="rounded border border-slate-200 p-2">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">
                      Trappa vid kant {fromLabel + 1}-{toLabel + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => onUpdate((l) => ({ ...l, stairs: l.stairs.filter((s) => s.id !== stair.id) }))}
                      className="rounded border border-red-200 px-1.5 py-0.5 text-[10px] text-red-600 hover:bg-red-50"
                    >
                      Ta bort
                    </button>
                  </div>
                  <Field label="Bredd (mm)">
                    <input
                      type="number"
                      className={inputClass}
                      value={stair.widthMm}
                      onChange={(e) => updateStair({ widthMm: Number(e.target.value) || 1 })}
                    />
                  </Field>
                  <Field label="Total höjd (mm)">
                    <input
                      type="number"
                      className={inputClass}
                      value={stair.totalHeightMm}
                      onChange={(e) => updateStair({ totalHeightMm: Number(e.target.value) || 1 })}
                    />
                  </Field>
                  <Field label="Antal steg">
                    <input
                      type="number"
                      className={inputClass}
                      value={stair.stepCount}
                      onChange={(e) => updateStair({ stepCount: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </Field>
                  <Field label="Stegdjup (mm)">
                    <input
                      type="number"
                      className={inputClass}
                      value={stair.stepDepthMm}
                      onChange={(e) => updateStair({ stepDepthMm: Number(e.target.value) || 1 })}
                    />
                  </Field>
                  <Field label="Trallmaterial">
                    <MaterialSelect
                      materials={library.materials}
                      category="trall"
                      value={stair.trallMaterialId}
                      onChange={(id) => updateStair({ trallMaterialId: id })}
                    />
                  </Field>
                  <Field label="Regelmaterial">
                    <MaterialSelect
                      materials={library.materials}
                      category="regel"
                      value={stair.regelMaterialId}
                      onChange={(id) => updateStair({ regelMaterialId: id })}
                    />
                  </Field>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Infästningssystem">
        <select
          className={inputClass}
          value={level.fastenerSystemId}
          onChange={(e) => onUpdate((l) => ({ ...l, fastenerSystemId: e.target.value }))}
        >
          {library.fastenerSystems.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </Section>

      <Section title="Kontroll">
        {validation.length === 0 ? (
          <p className="text-sm text-green-700">Inga avvikelser upptäckta.</p>
        ) : (
          <ul className="space-y-1.5">
            {validation.map((issue) => (
              <li
                key={issue.id}
                className={`rounded px-2 py-1.5 text-xs ${
                  issue.severity === "error" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"
                }`}
              >
                {issue.message}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs italic text-slate-500">{STRUCTURAL_DISCLAIMER}</p>
      </Section>
    </div>
  );
}
