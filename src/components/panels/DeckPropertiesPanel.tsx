import type { AreaSummary } from "../../geometry";
import type { DeckLevel, MaterialLibrary, TrallOrientation } from "../../types";
import { formatM2, formatMeters, formatMm } from "../../utils/format";
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

/** "PUNKTLISTA (mm)": every vertex's X/Y, manually editable. */
function PunktlistaSection({ level, onUpdate }: Pick<Props, "level" | "onUpdate">) {
  const points = level.polygon.points;
  const updatePoint = (index: number, axis: "x" | "y", value: number) =>
    onUpdate((l) => ({
      ...l,
      polygon: { ...l.polygon, points: l.polygon.points.map((p, i) => (i === index ? { ...p, [axis]: value } : p)) },
    }));

  return (
    <Section title="Punktlista (mm)">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="w-10 pb-1 font-medium">Punkt</th>
            <th className="pb-1 font-medium">X</th>
            <th className="pb-1 font-medium">Y</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}>
              <td className="py-0.5 pr-1 font-medium text-slate-700">P{i + 1}</td>
              <td className="py-0.5 pr-1">
                <input
                  type="number"
                  className={inputClass}
                  value={Math.round(p.x)}
                  onChange={(e) => updatePoint(i, "x", Number(e.target.value) || 0)}
                />
              </td>
              <td className="py-0.5">
                <input
                  type="number"
                  className={inputClass}
                  value={Math.round(p.y)}
                  onChange={(e) => updatePoint(i, "y", Number(e.target.value) || 0)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

/** "KANTLÄNGDER": every edge's length, auto-updating from the current polygon. */
function KantlangderSection({ level }: Pick<Props, "level">) {
  const points = level.polygon.points;
  const edges = points.map((p, i) => {
    const b = points[(i + 1) % points.length];
    return {
      from: i + 1,
      to: ((i + 1) % points.length) + 1,
      lengthMm: Math.hypot(b.x - p.x, b.y - p.y),
    };
  });

  return (
    <Section title="Kantlängder">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="pb-1 font-medium">Kant</th>
            <th className="pb-1 font-medium">Längd</th>
          </tr>
        </thead>
        <tbody>
          {edges.map((edge, i) => (
            <tr key={i}>
              <td className="py-0.5 pr-2 text-slate-700">
                {edge.from}-{edge.to}
              </td>
              <td className="py-0.5 font-medium">{formatMm(edge.lengthMm)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

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

      <KantlangderSection level={level} />
      <PunktlistaSection level={level} onUpdate={onUpdate} />

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
