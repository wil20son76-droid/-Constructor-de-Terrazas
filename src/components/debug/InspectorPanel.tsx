import type { InspectorDetail } from "../../deck/inspector";
import { formatMm } from "../../utils/format";

interface Props {
  detail: InspectorDetail | null;
  onClose: () => void;
}

function fmtPoint(p: { x: number; y: number }) {
  return `(${Math.round(p.x)}, ${Math.round(p.y)})`;
}

export function InspectorPanel({ detail, onClose }: Props) {
  if (!detail) return null;

  return (
    <div className="no-print absolute right-3 top-3 w-72 rounded-lg border border-blue-300 bg-white/95 p-3 text-xs shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-blue-700">{detail.label}</span>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
          ✕
        </button>
      </div>
      <dl className="space-y-1">
        <Row label="Typ" value={typeLabel(detail.type)} />
        {detail.materialName && <Row label="Material" value={detail.materialName} />}
        {detail.dimension && <Row label="Dimension" value={detail.dimension} />}
        <Row label="Start" value={fmtPoint(detail.start)} />
        {detail.end && <Row label="Slut" value={fmtPoint(detail.end)} />}
        {detail.lengthMm !== undefined && <Row label="Längd" value={formatMm(detail.lengthMm)} />}
        {detail.widthMm !== undefined && <Row label="Bredd" value={formatMm(detail.widthMm)} />}
        {detail.heightMm !== undefined && <Row label="Höjd" value={formatMm(detail.heightMm)} />}
        {detail.beamId && <Row label="Bärlina" value={detail.beamId} />}
        {detail.spacingToPreviousMm !== undefined && <Row label="Avstånd, föregående" value={formatMm(detail.spacingToPreviousMm)} />}
        {detail.spacingToNextMm !== undefined && <Row label="Avstånd, nästa" value={formatMm(detail.spacingToNextMm)} />}
      </dl>

      {detail.cutAssignments && detail.cutAssignments.length > 0 && (
        <div className="mt-2 border-t border-slate-200 pt-2">
          <div className="mb-1 font-medium text-slate-600">
            {detail.cutAssignments.length > 1 ? `Skarvad i ${detail.cutAssignments.length} segment` : "Kapplan"}
          </div>
          <ul className="space-y-1">
            {detail.cutAssignments.map((a) => (
              <li key={a.segmentIndex} className="rounded bg-slate-50 px-1.5 py-1">
                Segment {a.segmentIndex + 1}/{a.totalSegments}: stock {formatMm(a.stockLengthMm)}, restbit {formatMm(a.offcutMm)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function typeLabel(type: InspectorDetail["type"]): string {
  switch (type) {
    case "trall":
      return "Trall";
    case "regel":
      return "Regel";
    case "barlina":
      return "Bärlina";
    case "plint":
      return "Plint";
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}
