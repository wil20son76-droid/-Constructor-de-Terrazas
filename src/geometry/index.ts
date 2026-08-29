/**
 * Geometry engine. All inputs/outputs are in millimetres.
 * Pure functions only — no React, no DOM, no pixels.
 */
import type { DeckOpening, DeckPolygon, Point } from "../types";

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
