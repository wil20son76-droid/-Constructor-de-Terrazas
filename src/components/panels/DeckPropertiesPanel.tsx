import type { AreaSummary } from "../../geometry";
import type { DeckLevel, MaterialLibrary, TrallOrientation } from "../../types";
import { formatM2, formatMeters } from "../../utils/format";
import { Field, inputClass, MaterialSelect, Section } from "./common";

interface Props {
  level: DeckLevel;
  library: MaterialLibrary;
  area: AreaSummary;
  onUpdate: (fn: (level: DeckLevel) => DeckLevel) => void;
}

const orientations: { id: TrallOrientation; label: string }[] = [
  { id: "horizontal", label: "Horisontell" },
  { id: "vertical", label: "Vertikal" },
  { id: "diagonal45", label: "Diagonal 45°" },
  { id: "custom", label: "Anpassad vinkel" },
];

export function DeckPropertiesPanel({ level, library, area, onUpdate }: Props) {
  return (
    <div className="h-full overflow-y-auto">
      <Section title="Area & mått">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-xs text-slate-500">Bruttoarea</div>
            <div className="font-medium">{formatM2(area.grossAreaM2)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Nettoarea</div>
            <div className="font-medium">{formatM2(area.netAreaM2)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Hål/urtag</div>
            <div className="font-medium">{formatM2(area.openingsAreaM2)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Omkrets</div>
            <div className="font-medium">{formatMeters(area.perimeterM)}</div>
          </div>
        </div>
      </Section>

      <Section title="Trallriktning">
        <div className="grid grid-cols-2 gap-1">
          {orientations.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onUpdate((l) => ({ ...l, boardDirection: { ...l.boardDirection, mode: o.id } }))}
              className={`rounded border px-2 py-1.5 text-xs ${
                level.boardDirection.mode === o.id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-600"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {level.boardDirection.mode === "custom" && (
          <Field label="Vinkel (grader)">
            <input
              type="number"
              className={inputClass}
              value={level.boardDirection.angleDeg}
              onChange={(e) =>
                onUpdate((l) => ({ ...l, boardDirection: { ...l.boardDirection, angleDeg: Number(e.target.value) || 0 } }))
              }
            />
          </Field>
        )}
      </Section>

      <Section title="Trallmaterial">
        <Field label="Material">
          <MaterialSelect
            materials={library.materials}
            category="trall"
            value={level.trallMaterialId}
            onChange={(id) => onUpdate((l) => ({ ...l, trallMaterialId: id }))}
          />
        </Field>
        <Field label="Trallspalt (mm)">
          <input
            type="number"
            className={inputClass}
            value={level.boardGap}
            onChange={(e) => onUpdate((l) => ({ ...l, boardGap: Number(e.target.value) || 0 }))}
          />
        </Field>
      </Section>
    </div>
  );
}
