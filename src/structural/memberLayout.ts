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

/**
 * Bounding box of `points` after rotating into the local frame where
 * `angleDeg` becomes the local X axis (same convention as
 * `computeMemberLines`). Used to measure a polygon's span along a given
 * direction for CC-spacing calculations, without duplicating the
 * rotation/rounding logic at each call site.
 */
export function rotatedBoundingBox(points: Point[], angleDeg: number) {
  const local = points.map((p) => rotatePoint(p, angleDeg));
  return boundingBox(local);
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
  /** Index into the `rows` array passed to `clipRowsToPolygon`. */
  rowIndex: number;
}

const BOUNDARY_SAMPLE_EPS = 1e-3;

/**
 * Clip a family of rows (each a line at a given position along the
 * perpendicular axis, running along `angleDeg`) against a polygon minus
 * openings. A row lying exactly on the polygon's bounding-box boundary —
 * which for an axis-aligned edge means the scanline sits exactly on top
 * of a horizontal polygon edge — is a degenerate case for the crossing
 * test above (it produces no crossings at all, not the full-width
 * interval we actually want there), so such rows are sampled a hair
 * inside the polygon; the reported line still uses the true, un-nudged
 * row position.
 *
 * A single row can produce zero, one, or several segments (e.g. an
 * L-shape notch splits one row into two disjoint pieces) — each becomes
 * its own `MemberLine`, tagged with the originating row's index so
 * callers can look up per-row metadata (e.g. a deck board's width).
 */
export function clipRowsToPolygon(
  polygon: DeckPolygon,
  openings: DeckOpening[],
  angleDeg: number,
  rows: number[],
): MemberLine[] {
  const localPoly = polygon.points.map((p) => rotatePoint(p, angleDeg));
  const localOpenings = openings.map((o) => o.points.map((p) => rotatePoint(p, angleDeg)));
  const bbox = boundingBox(localPoly);
  const lines: MemberLine[] = [];

  rows.forEach((rowY, rowIndex) => {
    const nearMin = Math.abs(rowY - bbox.minY) < BOUNDARY_SAMPLE_EPS;
    const nearMax = Math.abs(rowY - bbox.maxY) < BOUNDARY_SAMPLE_EPS;
    const sampleY = nearMin ? rowY + BOUNDARY_SAMPLE_EPS : nearMax ? rowY - BOUNDARY_SAMPLE_EPS : rowY;

    let intervals = scanlineIntervals(localPoly, sampleY);
    for (const opening of localOpenings) {
      intervals = subtractIntervals(intervals, scanlineIntervals(opening, sampleY));
    }
    for (const [x1, x2] of intervals) {
      const start = rotatePointInverse({ x: x1, y: rowY }, angleDeg);
      const end = rotatePointInverse({ x: x2, y: rowY }, angleDeg);
      lines.push({ start, end, lengthMm: x2 - x1, rowPosition: rowY, rowIndex });
    }
  });
  return lines;
}

export type SpacingMode = "centered" | "edge-to-edge";

export interface UniformSpacingResult {
  /** The user-configured maximum centre-to-centre spacing, mm. */
  maxSpacingMm: number;
  /** ceil(span / maxSpacing): the minimum number of bays needed so no bay exceeds maxSpacing. */
  numberOfSpaces: number;
  /** span / numberOfSpaces: the actual, uniform centre-to-centre spacing used — always <= maxSpacingMm. */
  realSpacingMm: number;
  /** numberOfSpaces + 1: one member at each end plus one per interior bay boundary. */
  numberOfMembers: number;
  /** Member positions along the span, from 0 to span, evenly spaced by realSpacingMm. */
  positions: number[];
}

/**
 * Compute a uniform, edge-to-edge centre-to-centre (CC) spacing plan for a
 * span of structural members (reglar, bärlinor, plintar along a beam).
 *
 * This is deliberately NOT `ceil(span / maxSpacing)` boards placed at the
 * nominal spacing with one short leftover bay at the end — that can leave
 * a real CC very different from the configured maximum and never
 * guarantees every bay is <= maxSpacing in a way a carpenter would expect
 * ("uneven last bay" is not standard practice). Instead every bay gets the
 * same real spacing, which is mathematically guaranteed to be
 * <= maxSpacingMm because numberOfSpaces is rounded UP:
 *
 *   numberOfSpaces = ceil(span / maxSpacing)
 *   realSpacing    = span / numberOfSpaces   (<= maxSpacing by construction)
 *   numberOfMembers = numberOfSpaces + 1
 */
export function computeUniformSpacing(span: number, maxSpacingMm: number): UniformSpacingResult {
  if (span <= 0 || maxSpacingMm <= 0) {
    return { maxSpacingMm, numberOfSpaces: 0, realSpacingMm: 0, numberOfMembers: span > 0 ? 1 : 0, positions: span > 0 ? [0] : [] };
  }
  const numberOfSpaces = Math.max(1, Math.ceil(span / maxSpacingMm));
  const realSpacingMm = span / numberOfSpaces;
  const numberOfMembers = numberOfSpaces + 1;
  const positions = Array.from({ length: numberOfMembers }, (_, i) => i * realSpacingMm);
  return { maxSpacingMm, numberOfSpaces, realSpacingMm, numberOfMembers, positions };
}

/**
 * Compute row positions (along the perpendicular axis) for a family of
 * parallel members, given the axis extent [min, max] and nominal spacing.
 *
 * - "edge-to-edge": uniform CC spacing via `computeUniformSpacing` (see
 *   above) — the real spacing is always <= the configured maximum and
 *   identical between every pair of adjacent members. Used for
 *   reglar/bärlinor/plintar, which must reach both edges of the deck.
 * - "centered": rows start at `min + spacing/2` and stop before `max`.
 *   Kept for callers that don't need the deck-board-specific last-row/cut
 *   handling in `deck/boardLayout.ts`.
 */
export function computeRowPositions(min: number, max: number, spacing: number, mode: SpacingMode): number[] {
  if (spacing <= 0 || max <= min) return [];
  if (mode === "edge-to-edge") {
    const { positions } = computeUniformSpacing(max - min, spacing);
    return positions.map((p) => p + min);
  }
  const positions: number[] = [];
  let pos = min + spacing / 2;
  while (pos <= max - 1e-6) {
    positions.push(pos);
    pos += spacing;
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
  const bbox = rotatedBoundingBox(polygon.points, angleDeg);
  const rows = computeRowPositions(bbox.minY, bbox.maxY, spacing, mode);
  return clipRowsToPolygon(polygon, openings, angleDeg, rows);
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
