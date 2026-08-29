import { describe, expect, it } from "vitest";
import {
  computeAreaSummary,
  editEdgeLength,
  lShapePolygon,
  pointInPolygon,
  polygonArea,
  polygonPerimeter,
  rectanglePolygon,
  resizeRectangleEdge,
  snapToGrid,
} from "./index";

describe("rectanglePolygon", () => {
  it("produces a 14m x 7m rectangle with correct area and perimeter", () => {
    const poly = rectanglePolygon(14000, 7000);
    expect(polygonArea(poly.points)).toBe(14000 * 7000);
    expect(polygonPerimeter(poly.points)).toBe(2 * (14000 + 7000));
  });
});

describe("computeAreaSummary", () => {
  it("computes gross, net and opening areas in m2, and perimeter in m", () => {
    const poly = rectanglePolygon(14000, 7000);
    const summary = computeAreaSummary(poly, []);
    expect(summary.grossAreaM2).toBeCloseTo(98, 6);
    expect(summary.netAreaM2).toBeCloseTo(98, 6);
    expect(summary.openingsAreaM2).toBe(0);
    expect(summary.perimeterM).toBeCloseTo(42, 6);
  });

  it("subtracts opening area from the net area", () => {
    const poly = rectanglePolygon(10000, 10000);
    const opening = { id: "o1", points: rectanglePolygon(2000, 2000).points };
    const summary = computeAreaSummary(poly, [opening]);
    expect(summary.grossAreaM2).toBeCloseTo(100, 6);
    expect(summary.openingsAreaM2).toBeCloseTo(4, 6);
    expect(summary.netAreaM2).toBeCloseTo(96, 6);
  });
});

describe("lShapePolygon", () => {
  it("has the gross bounding area minus the notch", () => {
    const poly = lShapePolygon(10000, 10000, 4000, 3000);
    const area = polygonArea(poly.points);
    expect(area).toBe(10000 * 10000 - 4000 * 3000);
  });
});

describe("snapToGrid", () => {
  it("rounds to the nearest multiple of the grid size", () => {
    expect(snapToGrid(1240, 500)).toBe(1000);
    expect(snapToGrid(1260, 500)).toBe(1500);
    expect(snapToGrid(1234, 0)).toBe(1234);
  });
});

describe("pointInPolygon", () => {
  it("detects points inside and outside a rectangle", () => {
    const poly = rectanglePolygon(1000, 1000).points;
    expect(pointInPolygon({ x: 500, y: 500 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 1500, y: 500 }, poly)).toBe(false);
  });
});

describe("editEdgeLength", () => {
  it("pins the edge's start vertex and gives the edited edge exactly the requested length", () => {
    const poly = rectanglePolygon(1000, 2000);
    const updated = editEdgeLength(poly.points, 0, 1500);
    // edge 0 is (0,0)->(1000,0); its start vertex (index 0) never moves.
    expect(updated[0]).toEqual({ x: 0, y: 0 });
    const newEdgeLen = Math.hypot(updated[1].x - updated[0].x, updated[1].y - updated[0].y);
    expect(newEdgeLen).toBeCloseTo(1500, 6);
  });

  it("handles editing the wrap-around edge, keeping its start vertex fixed", () => {
    const poly = rectanglePolygon(1000, 2000);
    // edge 3 is (0,2000)->(0,0) [wraps back to point 0]; start vertex (index 3) stays put,
    // the edge's end vertex (index 0) moves to shorten the edge to 500mm, and every other
    // vertex downstream is translated rigidly by the same delta.
    const updated = editEdgeLength(poly.points, 3, 500);
    expect(updated[3]).toEqual({ x: 0, y: 2000 });
    expect(updated[0]).toEqual({ x: 0, y: 1500 });
    const newLen = Math.hypot(updated[0].x - updated[3].x, updated[0].y - updated[3].y);
    expect(newLen).toBeCloseTo(500, 6);
  });
});

describe("resizeRectangleEdge", () => {
  it("changes only the width when editing a horizontal edge, staying a clean rectangle", () => {
    const poly = rectanglePolygon(14000, 7000);
    const updated = resizeRectangleEdge(poly.points, 0, 16000);
    expect(updated).toEqual([
      { x: 0, y: 0 },
      { x: 16000, y: 0 },
      { x: 16000, y: 7000 },
      { x: 0, y: 7000 },
    ]);
    expect(polygonArea(updated)).toBe(16000 * 7000);
  });

  it("changes only the height when editing a vertical edge", () => {
    const poly = rectanglePolygon(14000, 7000);
    const updated = resizeRectangleEdge(poly.points, 1, 8000);
    expect(polygonArea(updated)).toBe(14000 * 8000);
    expect(distance2(updated[0], updated[1])).toBe(14000);
  });
});

function distance2(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
