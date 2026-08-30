/**
 * Geometry engine. All inputs/outputs are in millimetres.
 * Pure functions only — no React, no DOM, no pixels.
 */
import type { DeckOpening, DeckPolygon, Point, ValidationIssue } from "../types";

export function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function rectanglePolygon(widthMm: number, heightMm: number): DeckPolygon {
  return {
    id: makeId("poly"),
    points: [
      { x: 0, y: 0 },
      { x: widthMm, y: 0 },
      { x: widthMm, y: heightMm },
      { x: 0, y: heightMm },
    ],
  };
}

/**
 * L-shaped polygon: a big rectangle (widthMm x heightMm) with a
 * (cutWidthMm x cutHeightMm) rectangle removed from the top-right corner.
 */
export function lShapePolygon(
  widthMm: number,
  heightMm: number,
  cutWidthMm: number,
  cutHeightMm: number,
): DeckPolygon {
  const cw = Math.min(cutWidthMm, widthMm - 1);
  const ch = Math.min(cutHeightMm, heightMm - 1);
  return {
    id: makeId("poly"),
    points: [
      { x: 0, y: 0 },
      { x: widthMm - cw, y: 0 },
      { x: widthMm - cw, y: ch },
      { x: widthMm, y: ch },
      { x: widthMm, y: heightMm },
      { x: 0, y: heightMm },
    ],
  };
}

/**
 * U-shaped polygon: a big rectangle with a notch removed from the middle
 * of the top edge.
 */
export function uShapePolygon(
  widthMm: number,
  heightMm: number,
  notchWidthMm: number,
  notchHeightMm: number,
): DeckPolygon {
  const nw = Math.min(notchWidthMm, widthMm - 200);
  const nh = Math.min(notchHeightMm, heightMm - 1);
  const left = (widthMm - nw) / 2;
  const right = left + nw;
  return {
    id: makeId("poly"),
    points: [
      { x: 0, y: 0 },
      { x: left, y: 0 },
      { x: left, y: nh },
      { x: right, y: nh },
      { x: right, y: 0 },
      { x: widthMm, y: 0 },
      { x: widthMm, y: heightMm },
      { x: 0, y: heightMm },
    ],
  };
}

/** Shoelace formula. Returns absolute area in mm^2. */
export function polygonArea(points: Point[]): number {
  let sum = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function polygonPerimeter(points: Point[]): number {
  let sum = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    sum += distance(a, b);
  }
  return sum;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export interface AreaSummary {
  grossAreaM2: number;
  openingsAreaM2: number;
  netAreaM2: number;
  perimeterM: number;
}

export function computeAreaSummary(polygon: DeckPolygon, openings: DeckOpening[]): AreaSummary {
  const gross = polygonArea(polygon.points);
  const openingsArea = openings.reduce((sum, o) => sum + polygonArea(o.points), 0);
  return {
    grossAreaM2: gross / 1_000_000,
    openingsAreaM2: openingsArea / 1_000_000,
    netAreaM2: (gross - openingsArea) / 1_000_000,
    perimeterM: polygonPerimeter(polygon.points) / 1000,
  };
}

export function boundingBox(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Snap a value to the nearest multiple of gridMm (no-op if gridMm <= 0). */
export function snapToGrid(value: number, gridMm: number): number {
  if (!gridMm || gridMm <= 0) return value;
  return Math.round(value / gridMm) * gridMm;
}

export function snapPoint(p: Point, gridMm: number): Point {
  return { x: snapToGrid(p.x, gridMm), y: snapToGrid(p.y, gridMm) };
}

/** Point-in-polygon test (ray casting), points/polygon in mm. */
export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Insert a new vertex at index `afterIndex + 1`. Mutates nothing, returns new array. */
export function insertVertex(points: Point[], afterIndex: number, point: Point): Point[] {
  const next = [...points];
  next.splice(afterIndex + 1, 0, point);
  return next;
}

export function removeVertex(points: Point[], index: number): Point[] {
  if (points.length <= 3) return points;
  return points.filter((_, i) => i !== index);
}

export function edgeMidpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function edgeLength(a: Point, b: Point): number {
  return distance(a, b);
}

/** Angle of edge a->b, degrees, 0-360. */
export function edgeAngleDeg(a: Point, b: Point): number {
  const rad = Math.atan2(b.y - a.y, b.x - a.x);
  let deg = (rad * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

/**
 * Change the length of one edge (points[edgeIndex] -> points[edgeIndex+1])
 * by moving its end vertex along the edge direction, then rigidly
 * translating every vertex "downstream" of it (wrapping around a closed
 * polygon) by the same delta. This lets the user click any dimension
 * label — including on an L/U/free polygon, not just a rectangle — and
 * type an exact new length while keeping the rest of the shape intact.
 */
export function editEdgeLength(points: Point[], edgeIndex: number, newLengthMm: number): Point[] {
  const n = points.length;
  if (n < 2 || newLengthMm <= 0) return points;
  const startIdx = ((edgeIndex % n) + n) % n;
  const endIdx = (startIdx + 1) % n;
  const a = points[startIdx];
  const b = points[endIdx];
  const len = distance(a, b);
  if (len < 1e-9) return points;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const newB: Point = { x: a.x + ux * newLengthMm, y: a.y + uy * newLengthMm };
  const deltaX = newB.x - b.x;
  const deltaY = newB.y - b.y;

  const result = [...points];
  result[endIdx] = newB;
  for (let k = 2; k < n; k++) {
    const idx = (startIdx + k) % n;
    if (idx === startIdx) break;
    result[idx] = { x: points[idx].x + deltaX, y: points[idx].y + deltaY };
  }
  return result;
}

/** True if `points` forms a simple axis-aligned rectangle (4 points, edges alternating H/V). */
export function isAxisAlignedRectangle(points: Point[]): boolean {
  if (points.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    const a = points[i];
    const b = points[(i + 1) % 4];
    const isHorizontal = Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.x - b.x) > 1e-6;
    const isVertical = Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) > 1e-6;
    if (!isHorizontal && !isVertical) return false;
  }
  return true;
}

/**
 * Resize an axis-aligned rectangle by editing one of its edges, keeping it
 * a clean rectangle (unlike the generic `editEdgeLength`, which is
 * intentionally unconstrained and can skew non-edited edges). The
 * rectangle's origin (points[0]) is preserved; editing a "width" edge
 * (index 0 or 2) changes width, a "height" edge (index 1 or 3) changes
 * height.
 */
export function resizeRectangleEdge(points: Point[], edgeIndex: number, newLengthMm: number): Point[] {
  if (!isAxisAlignedRectangle(points) || newLengthMm <= 0) return points;
  const origin = points[0];
  const width = distance(points[0], points[1]);
  const height = distance(points[1], points[2]);
  const editsWidth = edgeIndex % 2 === 0;
  const newWidth = editsWidth ? newLengthMm : width;
  const newHeight = editsWidth ? height : newLengthMm;
  return rectanglePolygon(newWidth, newHeight).points.map((p) => ({ x: p.x + origin.x, y: p.y + origin.y }));
}

// ---------------------------------------------------------------------------
// Free-form polygon editing: insert a point on an edge, split into
// subpolygons, and validate the result.
// ---------------------------------------------------------------------------

/**
 * Insert a new point on edge (points[edgeIndex] -> points[edgeIndex+1]) at
 * parametric position `t` (0 = start, 1 = end, 0.5 = midpoint, the
 * default) along that edge — used by "Lägg till punkt på kant". The
 * polygon's shape is unchanged immediately after (the new point sits
 * exactly on the existing edge); the caller typically drags it afterward
 * to create an inset/outset.
 */
export function insertPointOnEdge(points: Point[], edgeIndex: number, t = 0.5): Point[] {
  const n = points.length;
  if (n < 2) return points;
  const startIdx = ((edgeIndex % n) + n) % n;
  const endIdx = (startIdx + 1) % n;
  const a = points[startIdx];
  const b = points[endIdx];
  const clampedT = Math.min(1, Math.max(0, t));
  const newPoint: Point = { x: a.x + (b.x - a.x) * clampedT, y: a.y + (b.y - a.y) * clampedT };
  return insertVertex(points, startIdx, newPoint);
}

/**
 * Split a closed polygon into two closed subpolygons along the chord
 * connecting the vertices at `indexA` and `indexB` — the geometric engine
 * behind "DELA SEKTION". Both indices must refer to EXISTING vertices; to
 * split at a point that currently sits mid-edge, call `insertPointOnEdge`
 * first (this is exactly how the UI's "split along an edge" flow works).
 *
 * Walking the original vertex order from A to B (inclusive) gives one
 * subpolygon; the complementary walk from B back around to A gives the
 * other. Both subpolygons share the new A-B edge, so sections built this
 * way always partition the source polygon exactly — no gaps, no overlap.
 */
export function splitPolygon(points: Point[], indexA: number, indexB: number): [Point[], Point[]] {
  const n = points.length;
  if (n < 4 || indexA === indexB) {
    throw new Error("splitPolygon requires >=4 points and two distinct vertex indices");
  }
  const a = ((indexA % n) + n) % n;
  const b = ((indexB % n) + n) % n;

  const walk = (from: number, to: number): Point[] => {
    const result: Point[] = [];
    let i = from;
    while (true) {
      result.push(points[i]);
      if (i === to) break;
      i = (i + 1) % n;
    }
    return result;
  };

  const partA = walk(a, b);
  const partB = walk(b, a);
  return [partA, partB];
}

const MIN_EDGE_LENGTH_MM = 50;
const MIN_DUPLICATE_DISTANCE_MM = 1;

/** Proper (strict interior) segment crossing test — shared endpoints don't count. */
function segmentsCrossStrictly(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return false; // parallel/collinear — not treated as a crossing here
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom;
  const eps = 1e-9;
  return t > eps && t < 1 - eps && u > eps && u < 1 - eps;
}

/** True if any two non-adjacent edges of the polygon cross each other. */
export function polygonSelfIntersects(points: Point[]): boolean {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a1 = points[i];
    const a2 = points[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      const areAdjacent = j === i || j === (i + 1) % n || (j + 1) % n === i;
      if (areAdjacent) continue;
      const b1 = points[j];
      const b2 = points[(j + 1) % n];
      if (segmentsCrossStrictly(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

/** Indices of points that coincide (within `minDistMm`) with an earlier point. */
export function findDuplicatePointIndices(points: Point[], minDistMm = MIN_DUPLICATE_DISTANCE_MM): number[] {
  const duplicates: number[] = [];
  for (let i = 1; i < points.length; i++) {
    for (let j = 0; j < i; j++) {
      if (distance(points[i], points[j]) < minDistMm) {
        duplicates.push(i);
        break;
      }
    }
  }
  return duplicates;
}

/** Indices of edges (points[i] -> points[i+1]) shorter than `minLengthMm`. */
export function findTinyEdgeIndices(points: Point[], minLengthMm = MIN_EDGE_LENGTH_MM): number[] {
  const n = points.length;
  const tiny: number[] = [];
  for (let i = 0; i < n; i++) {
    if (distance(points[i], points[(i + 1) % n]) < minLengthMm) tiny.push(i);
  }
  return tiny;
}

/**
 * Validate a polygon before it is used for any material calculation.
 * Returns `error`-severity issues for anything that makes the geometry
 * unusable (self-intersection, zero/near-zero area, too few points) and
 * `warning`-severity issues for things that are legal but suspicious
 * (duplicate points, extremely short edges). Callers must block material
 * calculations when any `error` issue is present.
 */
export function validatePolygon(points: Point[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (message: string) => issues.push({ id: makeId("geom_issue"), severity: "error", message });
  const warn = (message: string) => issues.push({ id: makeId("geom_issue"), severity: "warning", message });

  if (points.length < 3) {
    error("Formen har färre än 3 punkter — en yta kräver minst en triangel.");
    return issues; // nothing else can be meaningfully checked
  }

  const area = polygonArea(points);
  if (area < 1) {
    error("Formens area är noll (eller extremt liten) — kontrollera punkterna.");
  }

  if (polygonSelfIntersects(points)) {
    error("Formens kanter korsar varandra (self-intersection) — kontrollera punktordningen.");
  }

  const duplicates = findDuplicatePointIndices(points);
  if (duplicates.length > 0) {
    warn(`${duplicates.length} punkt(er) ligger nästan exakt på en annan punkt — kan orsaka felaktiga kanter.`);
  }

  const tinyEdges = findTinyEdgeIndices(points);
  if (tinyEdges.length > 0) {
    warn(`${tinyEdges.length} kant(er) är kortare än ${MIN_EDGE_LENGTH_MM} mm — kontrollera om det är avsiktligt.`);
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Stair placement: a simple outward-facing rectangle attached to one edge,
// used only for drawing a stair in the plan (never for material take-off,
// which lives in structural/stairs.ts).
// ---------------------------------------------------------------------------

/**
 * Signed polygon area via the shoelace formula (unlike `polygonArea`, the
 * sign is kept): positive for one winding direction, negative for the
 * other. Used to work out which side of an edge is "outward" regardless of
 * how the polygon happened to be wound (rectangle preset, free-form
 * drawing, or after edits).
 */
export function signedArea(points: Point[]): number {
  let sum = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum;
}

/**
 * A rectangle attached to edge `edgeIndex`, centred on that edge, `widthMm`
 * along it and extending `runMm` outward (away from the polygon's
 * interior) — the visual footprint of a stair in the plan. The outward
 * direction is derived from the polygon's actual winding (via
 * `signedArea`), so this works for any polygon, not just axis-aligned
 * rectangles.
 */
export function computeStairPlacementRect(points: Point[], edgeIndex: number, widthMm: number, runMm: number): Point[] {
  const n = points.length;
  const a = points[((edgeIndex % n) + n) % n];
  const b = points[(((edgeIndex + 1) % n) + n) % n];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return [a, a, a, a];
  const ux = dx / len;
  const uy = dy / len;
  const outward = signedArea(points) >= 0 ? { x: uy, y: -ux } : { x: -uy, y: ux };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const halfW = widthMm / 2;
  const innerA = { x: mid.x - ux * halfW, y: mid.y - uy * halfW };
  const innerB = { x: mid.x + ux * halfW, y: mid.y + uy * halfW };
  const outerA = { x: innerA.x + outward.x * runMm, y: innerA.y + outward.y * runMm };
  const outerB = { x: innerB.x + outward.x * runMm, y: innerB.y + outward.y * runMm };
  return [innerA, innerB, outerB, outerA];
}
