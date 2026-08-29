/**
 * Shared line-layout primitive used by the structural (reglar/bärlinor)
 * and deck-board engines: given a polygon (+ openings), lay out a family
 * of parallel lines running along `angleDeg`, spaced along the
 * perpendicular axis, clipped to the polygon.
 *
 * All units are millimetres. Pure geometry, no rendering concerns.
 */
import type { DeckOpening, DeckPolygon, Point } from "../types";
import { boundingBox } from "../geometry";

// Rounding rotated coordinates to nanometre precision (1e-6 mm) discards
// trig floating-point noise (e.g. cos(-90°) landing on 6.1e-17 instead of
// exactly 0) that would otherwise turn an exactly-horizontal/vertical edge
// into a barely-sloped one. Left unrounded, that noise makes the scanline
// below treat a polygon edge lying exactly on a row as a real crossing,
// which can cancel out the row's true interval — real-world deck geometry
// never needs sub-micron precision, so this is a safe, deterministic snap.
function roundMm(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

function rotatePoint(p: Point, angleDeg: number): Point {
  const rad = (-angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: roundMm(p.x * cos - p.y * sin), y: roundMm(p.x * sin + p.y * cos) };
}

function rotatePointInverse(p: Point, angleDeg: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: roundMm(p.x * cos - p.y * sin), y: roundMm(p.x * sin + p.y * cos) };
}

type Interval = [number, number];

function scanlineIntervals(points: Point[], rowY: number): Interval[] {
  const xs: number[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const yi = a.y;
    const yj = b.y;
    if ((yi <= rowY && yj > rowY) || (yj <= rowY && yi > rowY)) {
      const t = (rowY - yi) / (yj - yi);
      xs.push(a.x + t * (b.x - a.x));
    }
  }
  xs.sort((a, b) => a - b);
  const intervals: Interval[] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (xs[i + 1] - xs[i] > 1e-6) intervals.push([xs[i], xs[i + 1]]);
  }
  return intervals;
}

function subtractIntervals(solid: Interval[], holes: Interval[]): Interval[] {
  let result = solid;
  for (const [hs, he] of holes) {
    const next: Interval[] = [];
    for (const [s, e] of result) {
      if (he <= s || hs >= e) {
        next.push([s, e]);
        continue;
      }
      if (hs > s) next.push([s, Math.min(hs, e)]);
      if (he < e) next.push([Math.max(he, s), e]);
    }
    result = next;
  }
  return result.filter(([s, e]) => e - s > 1e-6);
}

export interface MemberLine {
  start: Point;
  end: Point;
  lengthMm: number;
  /** Position along the perpendicular axis, in the local rotated frame (mm). */
  rowPosition: number;
}

export type SpacingMode = "centered" | "edge-to-edge";

/**
 * Compute row positions (along the perpendicular axis) for a family of
 * parallel members, given the axis extent [min, max] and nominal spacing.
 *
 * - "edge-to-edge": first row at `min`, then every `spacing`, plus a final
 *   row exactly at `max` (the last bay may be shorter than nominal spacing).
 *   Used for reglar/bärlinor, which must reach both edges of the deck.
 * - "centered": rows start at `min + spacing/2` and stop before `max`.
 *   Used for deck boards, where `spacing` already includes board width.
 */
export function computeRowPositions(min: number, max: number, spacing: number, mode: SpacingMode): number[] {
  if (spacing <= 0 || max <= min) return [];
  const positions: number[] = [];
  if (mode === "edge-to-edge") {
    let pos = min;
    while (pos < max - 1e-6) {
      positions.push(pos);
      pos += spacing;
    }
    positions.push(max);
  } else {
    let pos = min + spacing / 2;
    while (pos <= max - 1e-6) {
      positions.push(pos);
      pos += spacing;
    }
  }
  return positions;
}

/**
 * Lay out parallel member lines running along `angleDeg`, spaced along the
 * perpendicular axis according to `spacing`/`mode`, clipped against the
 * polygon minus openings.
 */
export function computeMemberLines(
  polygon: DeckPolygon,
  openings: DeckOpening[],
  angleDeg: number,
  spacing: number,
  mode: SpacingMode,
): MemberLine[] {
  const localPoly = polygon.points.map((p) => rotatePoint(p, angleDeg));
  const localOpenings = openings.map((o) => o.points.map((p) => rotatePoint(p, angleDeg)));
  const bbox = boundingBox(localPoly);

  const rows = computeRowPositions(bbox.minY, bbox.maxY, spacing, mode);
  const lines: MemberLine[] = [];

  // In edge-to-edge mode the first/last rows sit exactly on the polygon's
  // bounding-box boundary, which for an axis-aligned edge means the
  // scanline lies exactly on top of a horizontal polygon edge — a
  // degenerate case for the crossing test below (a boundary lying exactly
  // on the scanline produces no crossings at all, not the full-width
  // interval we actually want there). Sampling a hair inside the polygon
  // for those two rows sidesteps the degeneracy while the reported line
  // still uses the true, un-nudged row position.
  const BOUNDARY_SAMPLE_EPS = 1e-3;
  const sampleYFor = (rowY: number, index: number): number => {
    if (mode !== "edge-to-edge") return rowY;
    if (index === 0 && rowY === bbox.minY) return rowY + BOUNDARY_SAMPLE_EPS;
    if (index === rows.length - 1 && rowY === bbox.maxY) return rowY - BOUNDARY_SAMPLE_EPS;
    return rowY;
  };

  rows.forEach((rowY, index) => {
    const sampleY = sampleYFor(rowY, index);
    let intervals = scanlineIntervals(localPoly, sampleY);
    for (const opening of localOpenings) {
      intervals = subtractIntervals(intervals, scanlineIntervals(opening, sampleY));
    }
    for (const [x1, x2] of intervals) {
      const start = rotatePointInverse({ x: x1, y: rowY }, angleDeg);
      const end = rotatePointInverse({ x: x2, y: rowY }, angleDeg);
      lines.push({ start, end, lengthMm: x2 - x1, rowPosition: rowY });
    }
  });
  return lines;
}

/**
 * Lay out perpendicular member lines running along `angleDeg + 90`, with
 * rows spaced along `angleDeg` itself (used for reglar, whose run
 * direction is perpendicular to the deck boards but whose spacing is
 * measured along the board direction).
 */
export function computePerpendicularMemberLines(
  polygon: DeckPolygon,
  openings: DeckOpening[],
  angleDeg: number,
  spacing: number,
  mode: SpacingMode,
): MemberLine[] {
  return computeMemberLines(polygon, openings, angleDeg + 90, spacing, mode);
}
