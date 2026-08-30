import { describe, expect, it } from "vitest";
import {
  computeAreaSummary,
  editEdgeLength,
  findDuplicatePointIndices,
  findTinyEdgeIndices,
  insertPointOnEdge,
  lShapePolygon,
  pointInPolygon,
  polygonArea,
  polygonPerimeter,
  polygonSelfIntersects,
  rectanglePolygon,
  resizeRectangleEdge,
  snapToGrid,
  splitPolygon,
  validatePolygon,
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

describe("insertPointOnEdge", () => {
  it("inserts a new point exactly at the edge midpoint by default, without changing the polygon's area", () => {
    const poly = rectanglePolygon(2000, 1000);
    const updated = insertPointOnEdge(poly.points, 0, 0.5); // edge 0: (0,0)->(2000,0)
    expect(updated).toHaveLength(5);
    expect(updated[1]).toEqual({ x: 1000, y: 0 });
    expect(polygonArea(updated)).toBeCloseTo(polygonArea(poly.points), 6);
  });

  it("inserts at an arbitrary parametric position along the edge", () => {
    const poly = rectanglePolygon(2000, 1000);
    const updated = insertPointOnEdge(poly.points, 0, 0.25);
    expect(updated[1]).toEqual({ x: 500, y: 0 });
  });
});

describe("splitPolygon", () => {
  it("splits a rectangle at two opposite corners into two triangles whose areas sum to the original", () => {
    const poly = rectanglePolygon(10000, 6000);
    const [partA, partB] = splitPolygon(poly.points, 0, 2);
    // walk(0,2) = [p0,p1,p2] -> right triangle with legs 10000 and 6000.
    expect(partA).toEqual([{ x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 6000 }]);
    expect(partB).toEqual([{ x: 10000, y: 6000 }, { x: 0, y: 6000 }, { x: 0, y: 0 }]);
    const areaA = polygonArea(partA);
    const areaB = polygonArea(partB);
    expect(areaA).toBeCloseTo(0.5 * 10000 * 6000, 6);
    expect(areaA + areaB).toBeCloseTo(polygonArea(poly.points), 6);
  });

  it("produces two subpolygons that share the new dividing edge exactly (real, gap-free sections)", () => {
    const poly = rectanglePolygon(10000, 6000);
    // Insert a point mid-way along the top edge, then split it against the opposite (bottom-left) corner.
    const withMidpoint = insertPointOnEdge(poly.points, 0, 0.5); // new point at (5000,0), index 1
    const [partA, partB] = splitPolygon(withMidpoint, 1, 4); // 4 = bottom-left corner (0, 6000)
    // The dividing chord (5000,0)->(0,6000) must appear, in reverse, in both subpolygons.
    expect(partA[0]).toEqual({ x: 5000, y: 0 });
    expect(partA[partA.length - 1]).toEqual({ x: 0, y: 6000 });
    expect(partB[0]).toEqual({ x: 0, y: 6000 });
    expect(partB[partB.length - 1]).toEqual({ x: 5000, y: 0 });
    expect(polygonArea(partA) + polygonArea(partB)).toBeCloseTo(polygonArea(withMidpoint), 6);
  });
});

describe("polygonSelfIntersects", () => {
  it("is false for a simple rectangle", () => {
    expect(polygonSelfIntersects(rectanglePolygon(1000, 1000).points)).toBe(false);
  });

  it("is true for a bowtie (self-crossing) quadrilateral", () => {
    const bowtie = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    expect(polygonSelfIntersects(bowtie)).toBe(true);
  });

  it("is false for an L-shape (concave but non-self-crossing)", () => {
    expect(polygonSelfIntersects(lShapePolygon(8000, 6000, 3000, 2000).points)).toBe(false);
  });
});

describe("findDuplicatePointIndices / findTinyEdgeIndices", () => {
  it("flags a point that nearly coincides with an earlier one", () => {
    const points = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000.2, y: 0.1 }, { x: 0, y: 1000 }];
    expect(findDuplicatePointIndices(points)).toEqual([2]);
  });

  it("flags an edge shorter than the minimum length", () => {
    const points = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 10 }, { x: 0, y: 1000 }];
    // Edge 1 (index 1): (1000,0)->(1000,10), length 10mm, well under the 50mm default.
    expect(findTinyEdgeIndices(points)).toEqual([1]);
  });
});

describe("validatePolygon", () => {
  it("reports no issues for a clean rectangle", () => {
    expect(validatePolygon(rectanglePolygon(14000, 7000).points)).toEqual([]);
  });

  it("reports an error for a self-intersecting (bowtie) shape", () => {
    const bowtie = [{ x: 0, y: 0 }, { x: 10000, y: 10000 }, { x: 10000, y: 0 }, { x: 0, y: 10000 }];
    const issues = validatePolygon(bowtie);
    expect(issues.some((i) => i.severity === "error")).toBe(true);
  });

  it("reports an error for a zero-area (degenerate/collinear) shape", () => {
    const collinear = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 2000, y: 0 }];
    const issues = validatePolygon(collinear);
    expect(issues.some((i) => i.severity === "error")).toBe(true);
  });

  it("reports warnings (not errors) for duplicate points and tiny edges on an otherwise valid shape", () => {
    // A 5000x3000 rectangle with a near-duplicate point (0.36mm away) added
    // right next to the top-right corner: creates both a tiny edge and a
    // near-duplicate point, without making the shape invalid.
    const points = [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 3000 },
      { x: 5000.3, y: 3000.2 },
      { x: 0, y: 3000 },
    ];
    const issues = validatePolygon(points);
    expect(issues.every((i) => i.severity === "warning")).toBe(true);
    expect(issues.length).toBe(2); // one duplicate-point warning, one tiny-edge warning
  });
});

function distance2(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
