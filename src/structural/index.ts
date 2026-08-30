/**
 * Structural layout engine (stomme): reglar, bärlinor, plintar (footings),
 * stolpar (posts) and kortlingar (blocking).
 *
 * Conventions:
 *  - Trall (boards) run along `boardAngle`.
 *  - Reglar (joists) run perpendicular to the boards, spaced at CC
 *    (`regelSpacing`) measured along the board direction.
 *  - Bärlinor (beams) run parallel to the boards (i.e. perpendicular to
 *    the reglar), spaced at `barlinaMaxSpacing` measured perpendicular to
 *    the boards.
 *  - Plintar (footings) are distributed along each bärlina at
 *    `plintMaxSpacing`, edge-to-edge.
 *  - For material dimension strings like "45x95", `widthMm` is the
 *    horizontal cross-section and `thicknessMm` is the installed
 *    (vertical) height of the member.
 *
 * CC (centre-to-centre) spacing: every family of parallel members
 * (reglar, bärlinor, and plintar along a bärlina) uses the uniform
 * edge-to-edge spacing plan from `computeUniformSpacing` — see that
 * function's doc comment for why a naive `ceil(span / maxCC)` with one
 * short leftover bay is wrong. The resulting `realSpacingMm` is always
 * <= the configured maximum, by construction.
 */
import type { Beam, DeckLevel, Footing, Joist, MaterialLibrary, Point, Post } from "../types";
import { makeId } from "../geometry";
import { boardAngleFor } from "../deck/boardLayout";
import {
  computeMemberLines,
  computePerpendicularMemberLines,
  computeUniformSpacing,
  rotatedBoundingBox,
  type UniformSpacingResult,
} from "./memberLayout";

function findMaterialDimension(library: MaterialLibrary, materialId: string): string | undefined {
  const m = library.materials.find((mat) => mat.id === materialId);
  return m?.widthMm && m?.thicknessMm ? `${m.widthMm}x${m.thicknessMm}` : undefined;
}

export interface ReglarResult {
  joists: Joist[];
  /** CC spacing plan computed from the polygon's bounding-box span along the board direction. */
  ccInfo: UniformSpacingResult;
}

export function computeReglar(level: DeckLevel, library: MaterialLibrary): ReglarResult {
  const angle = boardAngleFor(level.boardDirection);
  const dimension = findMaterialDimension(library, level.regelMaterialId);

  // Reglar run perpendicular to the boards (world direction angle+90); the
  // row spacing that places them is measured along local-Y of THAT
  // rotation, which is `computePerpendicularMemberLines`'s internal frame
  // (angle+90). Using `angle` here instead would measure the wrong axis
  // (the board-length direction instead of the board-width/CC direction)
  // — this must match the bbox computeMemberLines(..., angle+90, ...)
  // actually uses internally, or the reported CC info would silently
  // disagree with the real joist placement.
  const bbox = rotatedBoundingBox(level.polygon.points, angle + 90);
  const ccInfo = computeUniformSpacing(bbox.maxY - bbox.minY, level.regelSpacing);

  const lines = computePerpendicularMemberLines(level.polygon, level.openings, angle, level.regelSpacing, "edge-to-edge");
  const joists: Joist[] = lines.map((line) => ({
    id: makeId("regel"),
    materialId: level.regelMaterialId,
    start: line.start,
    end: line.end,
    lengthMm: line.lengthMm,
    dimension,
  }));
  return { joists, ccInfo };
}

export interface BarlinorResult {
  beams: Beam[];
  spacingInfo: UniformSpacingResult;
}

export function computeBarlinor(level: DeckLevel, library: MaterialLibrary): BarlinorResult {
  const angle = boardAngleFor(level.boardDirection);
  const dimension = findMaterialDimension(library, level.barlinaMaterialId);

  // Bärlinor run parallel to the boards (world direction `angle`), placed
  // via `computeMemberLines(..., angle, ...)`, whose internal bbox is
  // exactly `rotatedBoundingBox(points, angle)` — reuse the same rotation
  // here so this reported spacing always matches the real beam placement.
  const bbox = rotatedBoundingBox(level.polygon.points, angle);
  const spacingInfo = computeUniformSpacing(bbox.maxY - bbox.minY, level.barlinaMaxSpacing);

  const lines = computeMemberLines(level.polygon, level.openings, angle, level.barlinaMaxSpacing, "edge-to-edge");
  const beams: Beam[] = lines.map((line) => ({
    id: makeId("barlina"),
    materialId: level.barlinaMaterialId,
    start: line.start,
    end: line.end,
    lengthMm: line.lengthMm,
    dimension,
  }));
  return { beams, spacingInfo };
}

export interface FootingsResult {
  footings: Footing[];
  /** Per-beam spacing plans, in the same order as the `barlinor` argument. */
  spacingInfoByBeam: UniformSpacingResult[];
}

/** Distribute footings (plintar) along each bärlina, numbered P1, P2, ... */
export function computeFootings(barlinor: Beam[], plintTypeId: string, maxSpacingMm: number): FootingsResult {
  const footings: Footing[] = [];
  const spacingInfoByBeam: UniformSpacingResult[] = [];
  let counter = 1;
  for (const beam of barlinor) {
    const spacing = computeUniformSpacing(beam.lengthMm, maxSpacingMm);
    spacingInfoByBeam.push(spacing);
    const dx = beam.end.x - beam.start.x;
    const dy = beam.end.y - beam.start.y;
    const len = beam.lengthMm || 1;
    for (const t of spacing.positions) {
      const position: Point = {
        x: beam.start.x + (dx * t) / len,
        y: beam.start.y + (dy * t) / len,
      };
      footings.push({ id: makeId("plint"), typeId: plintTypeId, position, label: `P${counter}`, beamId: beam.id });
      counter++;
    }
  }
  return { footings, spacingInfoByBeam };
}

/**
 * Height of each post (stolpe), in mm, from the top of the footing to the
 * underside of the deck boards, accounting for board thickness, joist
 * height and beam height. Returns 0 (no posts needed) when the deck sits
 * low enough that bärlinor rest directly on the footings.
 */
export function computePostHeight(
  heightAboveGroundMm: number,
  trallThicknessMm: number,
  regelHeightMm: number,
  barlinaHeightMm: number,
): number {
  const buildUp = trallThicknessMm + regelHeightMm + barlinaHeightMm;
  return Math.max(0, heightAboveGroundMm - buildUp);
}

export function computePosts(footings: Footing[], postMaterialId: string, heightMm: number): Post[] {
  if (heightMm <= 0) return [];
  return footings.map((f) => ({
    id: makeId("stolpe"),
    materialId: postMaterialId,
    position: f.position,
    heightMm,
  }));
}

/**
 * Approximate count of kortlingar (blocking pieces between adjacent
 * reglar), placed at roughly `spacingMm` intervals along the run of the
 * reglar, one row of blocking per bay between two consecutive reglar.
 *
 * This is a simplified estimate: it does not model openings or irregular
 * polygons precisely. Always shown alongside the standard structural
 * disclaimer.
 */
export function estimateKortlingCount(reglar: Joist[], spacingMm: number): number {
  if (reglar.length < 2 || spacingMm <= 0) return 0;
  const bays = reglar.length - 1;
  const avgLength = reglar.reduce((s, r) => s + r.lengthMm, 0) / reglar.length;
  const rowsPerBay = Math.max(0, Math.floor(avgLength / spacingMm));
  return bays * rowsPerBay;
}

export { computeUniformSpacing } from "./memberLayout";
export type { UniformSpacingResult } from "./memberLayout";
