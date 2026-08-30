/**
 * Resolves a selected plan element (a board, joist, beam or footing) into
 * the full technical detail the INSPECT/DEBUG mode shows — geometry plus,
 * for lumber, which purchased stock board/offcut it was cut from. Pure
 * data logic, no rendering.
 */
import type { CutPlanResult, DeckLevel, MaterialLibrary } from "../types";
import type { LevelGeometryResult } from "../materials";

export type SelectedElementType = "trall" | "regel" | "barlina" | "plint";

export interface SelectedElement {
  type: SelectedElementType;
  index: number; // index into the corresponding geometry array
}

export interface CutAssignmentDetail {
  segmentIndex: number;
  totalSegments: number;
  stockLengthMm: number;
  offcutMm: number;
  binIndex: number;
}

export interface InspectorDetail {
  label: string; // e.g. "R14", "T47", "B3", "P18"
  type: SelectedElementType;
  dimension?: string;
  materialName?: string;
  start: { x: number; y: number };
  end?: { x: number; y: number };
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  /** Cut/splice assignment(s) for lumber elements — >1 entry means the piece was spliced. */
  cutAssignments?: CutAssignmentDetail[];
  /** Footing-only: which bärlina it supports, and spacing to the previous/next footing on that beam. */
  beamId?: string;
  spacingToPreviousMm?: number;
  spacingToNextMm?: number;
}

function findCutAssignments(cutPlan: CutPlanResult | undefined, sourceIndex: number): CutAssignmentDetail[] {
  if (!cutPlan) return [];
  const result: CutAssignmentDetail[] = [];
  for (const bin of cutPlan.bins) {
    for (const item of bin.items) {
      if (item.sourceIndex === sourceIndex) {
        result.push({
          segmentIndex: item.segmentIndex,
          totalSegments: item.totalSegments,
          stockLengthMm: bin.stockLengthMm,
          offcutMm: bin.offcutMm,
          binIndex: bin.index,
        });
      }
    }
  }
  return result.sort((a, b) => a.segmentIndex - b.segmentIndex);
}

export function resolveInspectedElement(
  selected: SelectedElement,
  level: DeckLevel,
  geometry: LevelGeometryResult,
  cutPlans: CutPlanResult[],
  library: MaterialLibrary,
): InspectorDetail | null {
  const materialName = (id: string) => library.materials.find((m) => m.id === id)?.nameSv;

  if (selected.type === "trall") {
    const board = geometry.boards[selected.index];
    if (!board) return null;
    const cutPlan = cutPlans.find((p) => p.materialId === level.trallMaterialId);
    return {
      label: `T${selected.index + 1}`,
      type: "trall",
      dimension: board.widthMm ? `${board.widthMm} mm bred` : undefined,
      materialName: materialName(level.trallMaterialId),
      start: board.start,
      end: board.end,
      lengthMm: board.lengthMm,
      widthMm: board.widthMm,
      cutAssignments: findCutAssignments(cutPlan, selected.index),
    };
  }

  if (selected.type === "regel") {
    const joist = geometry.joists[selected.index];
    if (!joist) return null;
    const cutPlan = cutPlans.find((p) => p.materialId === level.regelMaterialId);
    return {
      label: `R${selected.index + 1}`,
      type: "regel",
      dimension: joist.dimension,
      materialName: materialName(level.regelMaterialId),
      start: joist.start,
      end: joist.end,
      lengthMm: joist.lengthMm,
      cutAssignments: findCutAssignments(cutPlan, selected.index),
    };
  }

  if (selected.type === "barlina") {
    const beam = geometry.beams[selected.index];
    if (!beam) return null;
    const cutPlan = cutPlans.find((p) => p.materialId === level.barlinaMaterialId);
    return {
      label: `B${selected.index + 1}`,
      type: "barlina",
      dimension: beam.dimension,
      materialName: materialName(level.barlinaMaterialId),
      start: beam.start,
      end: beam.end,
      lengthMm: beam.lengthMm,
      cutAssignments: findCutAssignments(cutPlan, selected.index),
    };
  }

  // plint
  const footing = geometry.footings[selected.index];
  if (!footing) return null;
  const sameBeam = geometry.footings.filter((f) => f.beamId === footing.beamId);
  const orderedIdx = sameBeam.findIndex((f) => f.id === footing.id);
  const prev = sameBeam[orderedIdx - 1];
  const next = sameBeam[orderedIdx + 1];
  const dist = (a?: { position: { x: number; y: number } }) =>
    a ? Math.hypot(a.position.x - footing.position.x, a.position.y - footing.position.y) : undefined;

  return {
    label: footing.label,
    type: "plint",
    materialName: library.plintTypes.find((p) => p.id === footing.typeId)?.nameSv,
    start: footing.position,
    beamId: footing.beamId,
    spacingToPreviousMm: dist(prev),
    spacingToNextMm: dist(next),
    heightMm: geometry.posts.find((p) => p.position.x === footing.position.x && p.position.y === footing.position.y)?.heightMm,
  };
}
