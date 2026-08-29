import type { DeckLevel, MaterialLibrary, ValidationIssue } from "../../types";
import { STRUCTURAL_DISCLAIMER } from "../../validation";
import { Field, inputClass, MaterialSelect, QuickButtons, Section } from "./common";

interface Props {
  level: DeckLevel;
  library: MaterialLibrary;
  validation: ValidationIssue[];
  jointCount: { joists: number; beams: number; footings: number; posts: number };
  onUpdate: (fn: (level: DeckLevel) => DeckLevel) => void;
}

export function StructurePanel({ level, library, validation, jointCount, onUpdate }: Props) {
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
