/**
 * Pure geometry -> world-space transforms for the 3D client view.
 *
 * No React, no Three.js classes — plain numbers only, so this is fully
 * testable without a WebGL context. This module NEVER recalculates deck
 * geometry: it only converts the app's existing calculated results
 * (`DeckBoard[]`, `Stair` + `StairCalculationResult`, polygon edges) into
 * render-ready box placements.
 *
 * Coordinate convention: millimetres -> metres (Three.js scene unit).
 * Plan (x, y) maps to world (x, z); "up" (world y) is height above ground,
 * derived from `DeckLevel.heightAboveGround` — there is no Z field
 * anywhere in the 2D data model. A box's local +X axis is its "length"
 * axis; `rotationY` (radians, applied about the world Y axis) rotates
 * that local +X to point along a given plan-space direction vector.
 */
import type { DeckBoard, DeckLevel, EdgeType, MaterialLibrary, Point, Stair } from "../types";
import type { StairCalculationResult } from "../structural/stairs";
import { computeStairPlacementRect } from "../geometry";

export const MM_PER_M = 1000;

export function mmToM(mm: number): number {
  return mm / MM_PER_M;
}

/** A box placement in world space: metres, radians. */
export interface Transform3D {
  position: [number, number, number];
  /** Rotation about the world Y axis, radians. */
  rotationY: number;
  /** [length (local X), height (local Y), depth (local Z)], metres. */
  size: [number, number, number];
}

/**
 * Places a box whose local +X axis is its "length" axis, oriented (about
 * world Y only — everything here is flat-on-the-ground furniture, no
 * pitch/roll) so local +X points along `lengthDirMm`. The box's TOP face
 * sits at world Y = `topMm` (mm); its footprint is `lengthMm` (along the
 * direction) x `crossMm` (perpendicular, horizontal) x `heightMm`
 * (vertical, downward from the top face).
 */
export function orientedBoxTransform(
  centerMm: Point,
  lengthDirMm: Point,
  lengthMm: number,
  crossMm: number,
  heightMm: number,
  topMm: number,
): Transform3D {
  const angle = Math.atan2(lengthDirMm.y, lengthDirMm.x);
  const heightM = mmToM(heightMm);
  const topM = mmToM(topMm);
  return {
    position: [mmToM(centerMm.x), topM - heightM / 2, mmToM(centerMm.y)],
    rotationY: -angle,
    size: [mmToM(lengthMm), heightM, mmToM(crossMm)],
  };
}

/**
 * Board thickness for one `DeckBoard`: sectioned boards use their own
 * `DeckSection.boardThicknessMm`; legacy (no-sections) boards use the
 * trall material's thickness, falling back to 28mm — mirroring exactly
 * what `computeLevelGeometry` (`src/materials/index.ts`) uses for the
 * real BOM/structural calculation, so the 3D view never invents a
 * different thickness than the one actually costed/structurally assumed.
 */
export function boardThicknessMmFor(board: DeckBoard, level: DeckLevel, library: MaterialLibrary): number {
  if (board.sectionId) {
    const section = level.sections?.find((s) => s.id === board.sectionId);
    if (section) return section.boardThicknessMm;
  }
  const materialId = board.materialId ?? level.trallMaterialId;
  const material = library.materials.find((m) => m.id === materialId);
  return material?.thicknessMm ?? 28;
}

/** One placed `DeckBoard`, top face flush with the deck's walking surface. */
export function boardTransform(board: DeckBoard, thicknessMm: number, deckTopMm: number): Transform3D {
  const center: Point = { x: (board.start.x + board.end.x) / 2, y: (board.start.y + board.end.y) / 2 };
  const dir: Point = { x: board.end.x - board.start.x, y: board.end.y - board.start.y };
  return orientedBoxTransform(center, dir, board.lengthMm, board.widthMm, thicknessMm, deckTopMm);
}

/**
 * Per-step solid-block placements for one stair, descending from the deck
 * edge (`stair.edgeIndex`) outward to the ground. Reuses
 * `computeStairPlacementRect` (the same function the 2D plan uses to draw
 * the stair footprint) so the 3D footprint always matches the 2D one —
 * this never re-derives "which way is outward" itself.
 *
 * Each step is rendered as one solid block from its tread surface down to
 * the tread below (or to ground for the last step) — a deliberately simple
 * "stacked blocks" stair silhouette, not individual tread+riser meshes;
 * good enough for a client-facing presentation view.
 */
export function stairStepTransforms(
  levelPolygonPoints: Point[],
  stair: Stair,
  result: StairCalculationResult,
  deckTopMm: number,
): Transform3D[] {
  if (stair.stepCount <= 0 || stair.stepDepthMm <= 0 || stair.widthMm <= 0) return [];

  const totalRunMm = stair.stepCount * stair.stepDepthMm;
  const [innerA, innerB, , outerA] = computeStairPlacementRect(levelPolygonPoints, stair.edgeIndex, stair.widthMm, totalRunMm);

  const widthLenMm = Math.hypot(innerB.x - innerA.x, innerB.y - innerA.y) || 1;
  const widthUnit: Point = { x: (innerB.x - innerA.x) / widthLenMm, y: (innerB.y - innerA.y) / widthLenMm };
  const outwardLenMm = Math.hypot(outerA.x - innerA.x, outerA.y - innerA.y) || 1;
  const outwardUnit: Point = { x: (outerA.x - innerA.x) / outwardLenMm, y: (outerA.y - innerA.y) / outwardLenMm };

  const steps: Transform3D[] = [];
  for (let i = 0; i < stair.stepCount; i++) {
    const outwardOffsetMm = (i + 0.5) * stair.stepDepthMm;
    const centerMm: Point = {
      x: innerA.x + widthUnit.x * (stair.widthMm / 2) + outwardUnit.x * outwardOffsetMm,
      y: innerA.y + widthUnit.y * (stair.widthMm / 2) + outwardUnit.y * outwardOffsetMm,
    };
    const topMm = deckTopMm - result.riserHeightMm * i;
    steps.push(orientedBoxTransform(centerMm, outwardUnit, stair.stepDepthMm, stair.widthMm, result.riserHeightMm, topMm));
  }
  return steps;
}

export type LateralStyle = "none" | "horizontal" | "vertical";

const FASCIA_PANEL_DEPTH_MM = 20;
const FASCIA_TARGET_STRIP_SIZE_MM = 140;

/**
 * Cosmetic skirting ("lateral") panel strips along every polygon edge
 * classified "external" (see `classifyEdges`, `src/deck/edgeClassification.ts`
 * — never a wall or stair edge), from ground (Y=0) up to the deck's top
 * face. Purely visual — this NEVER touches BOM/materials, matching the
 * spec's "Este ajuste är SOLO visual" requirement.
 */
export function fasciaStripTransforms(
  polygonPoints: Point[],
  edgeClassification: EdgeType[],
  heightAboveGroundMm: number,
  style: LateralStyle,
): Transform3D[] {
  if (style === "none" || heightAboveGroundMm <= 0) return [];

  const n = polygonPoints.length;
  const strips: Transform3D[] = [];
  for (let i = 0; i < n; i++) {
    if (edgeClassification[i] !== "external") continue;
    const a = polygonPoints[i];
    const b = polygonPoints[(i + 1) % n];
    const edgeLenMm = Math.hypot(b.x - a.x, b.y - a.y);
    if (edgeLenMm < 1) continue;
    const dir: Point = { x: b.x - a.x, y: b.y - a.y };

    if (style === "horizontal") {
      const stripCount = Math.max(1, Math.round(heightAboveGroundMm / FASCIA_TARGET_STRIP_SIZE_MM));
      const stripHeightMm = heightAboveGroundMm / stripCount;
      const centerMm: Point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      for (let j = 0; j < stripCount; j++) {
        const topMm = heightAboveGroundMm - j * stripHeightMm;
        strips.push(orientedBoxTransform(centerMm, dir, edgeLenMm, FASCIA_PANEL_DEPTH_MM, stripHeightMm, topMm));
      }
    } else {
      const stripCount = Math.max(1, Math.round(edgeLenMm / FASCIA_TARGET_STRIP_SIZE_MM));
      const stripWidthMm = edgeLenMm / stripCount;
      const unit: Point = { x: dir.x / edgeLenMm, y: dir.y / edgeLenMm };
      for (let k = 0; k < stripCount; k++) {
        const offsetMm = (k + 0.5) * stripWidthMm;
        const centerMm: Point = { x: a.x + unit.x * offsetMm, y: a.y + unit.y * offsetMm };
        strips.push(orientedBoxTransform(centerMm, dir, stripWidthMm, FASCIA_PANEL_DEPTH_MM, heightAboveGroundMm, heightAboveGroundMm));
      }
    }
  }
  return strips;
}

export interface GroundBounds {
  centerMm: Point;
  widthMm: number;
  depthMm: number;
}

/** Bounding-box footprint (+ margin) of the level polygon, for sizing the ground plane. */
export function groundBoundsFor(points: Point[], marginMm = 3000): GroundBounds {
  if (points.length === 0) return { centerMm: { x: 0, y: 0 }, widthMm: marginMm * 2, depthMm: marginMm * 2 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    centerMm: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    widthMm: maxX - minX + marginMm * 2,
    depthMm: maxY - minY + marginMm * 2,
  };
}
