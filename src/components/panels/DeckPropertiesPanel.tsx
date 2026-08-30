import type { AreaSummary } from "../../geometry";
import type { DeckLevel, DeckSection, MaterialLibrary, TrallOrientation } from "../../types";
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

const sectionDirectionPresets: { label: string; angleDeg: number }[] = [
  { label: "→ 0°", angleDeg: 0 },
  { label: "↑ 90°", angleDeg: 90 },
  { label: "↗ 45°", angleDeg: 45 },
  { label: "↖ -45°", angleDeg: -45 },
];

/**
 * Per-section trall direction + material, once the level has been split via
 * "Dela sektion" — each section is calculated from its own real, clipped
 * geometry (see deck/boardLayout.ts and materials/index.ts), so a change
 * here only affects that section's boards.
 */
function SectionsSection({ level, library, onUpdate }: Pick<Props, "level" | "library" | "onUpdate">) {
  const sections = level.sections ?? [];
  const updateSection = (id: string, patch: Partial<DeckSection>) =>
    onUpdate((l) => ({
      ...l,
      sections: (l.sections ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));

  return (
    <Section title="Sektioner">
      <p className="mb-2 text-xs text-slate-400">
        Terrassen är uppdelad i {sections.length} sektioner. Varje sektion har egen trallriktning och eget material.
      </p>
      <div className="space-y-3">
        {sections.map((sec) => (
          <div key={sec.id} className="rounded border border-slate-200 p-2">
            <div className="mb-1.5 text-xs font-semibold text-slate-700">{sec.name}</div>

            <div className="mb-1 text-[11px] font-medium text-slate-500">Riktning</div>
            <div className="grid grid-cols-4 gap-1">
              {sectionDirectionPresets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => updateSection(sec.id, { boardDirection: { mode: "custom", angleDeg: p.angleDeg } })}
                  className={`rounded border px-1 py-1 text-[11px] ${
                    sec.boardDirection.angleDeg === p.angleDeg ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-600"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Field label="Anpassad vinkel (grader)">
              <input
                type="number"
                className={inputClass}
                value={sec.boardDirection.angleDeg}
                onChange={(e) => updateSection(sec.id, { boardDirection: { mode: "custom", angleDeg: Number(e.target.value) || 0 } })}
              />
            </Field>

            <Field label="Material">
              <MaterialSelect
                materials={library.materials}
                category="trall"
                value={sec.materialId}
                onChange={(id) => {
                  const mat = library.materials.find((m) => m.id === id);
                  updateSection(sec.id, {
                    materialId: id,
                    boardWidthMm: mat?.widthMm ?? sec.boardWidthMm,
                    boardThicknessMm: mat?.thicknessMm ?? sec.boardThicknessMm,
                  });
                }}
              />
            </Field>
            <Field label="Trallspalt (mm)">
              <input
                type="number"
                className={inputClass}
                value={sec.boardGap}
                onChange={(e) => updateSection(sec.id, { boardGap: Number(e.target.value) || 0 })}
              />
            </Field>
          </div>
        ))}
      </div>
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

      {level.sections && level.sections.length > 0 ? (
        <SectionsSection level={level} library={library} onUpdate={onUpdate} />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
