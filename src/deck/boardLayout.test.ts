import { describe, expect, it } from "vitest";
import { rectanglePolygon } from "../geometry";
import { computeBoardLayout } from "./boardLayout";

describe("computeBoardLayout", () => {
  it("fills a rectangle with horizontal boards at the given width+gap pitch", () => {
    const polygon = rectanglePolygon(14000, 7000);
    const result = computeBoardLayout(polygon, [], { mode: "horizontal", angleDeg: 0 }, 120, 5);
    // pitch = 125mm; rows fit while centre <= 7000 - 60: floor((7000-120)/125)+1 = 55 +1 = 56
    expect(result.rowCount).toBe(56);
    expect(result.boards).toHaveLength(56);
    // Every board should span the full 14m width since the polygon is a plain rectangle.
    for (const board of result.boards) {
      expect(board.lengthMm).toBeCloseTo(14000, 6);
    }
    expect(result.totalLinearMm).toBeCloseTo(56 * 14000, 3);
  });

  it("rotates the layout for vertical boards (rows run along X instead of Y)", () => {
    const polygon = rectanglePolygon(14000, 7000);
    const horizontal = computeBoardLayout(polygon, [], { mode: "horizontal", angleDeg: 0 }, 120, 5);
    const vertical = computeBoardLayout(polygon, [], { mode: "vertical", angleDeg: 0 }, 120, 5);
    // Vertical boards run along Y (7000mm long each) with rows spread across the 14000mm width.
    for (const board of vertical.boards) {
      expect(board.lengthMm).toBeCloseTo(7000, 6);
    }
    expect(vertical.rowCount).not.toBe(horizontal.rowCount);
  });

  it("produces two segments per row for an L-shaped notch that a row's scanline crosses twice", () => {
    // A simple rectangle with an opening should split a board row into two segments.
    const polygon = rectanglePolygon(10000, 4000);
    const opening = { id: "hole", points: rectanglePolygon(2000, 2000).points.map((p) => ({ x: p.x + 4000, y: p.y + 1000 })) };
    const result = computeBoardLayout(polygon, [opening], { mode: "horizontal", angleDeg: 0 }, 100, 0);
    const rowsThroughHole = result.boards.filter((b) => b.start.y > 1000 && b.start.y < 3000);
    // Rows passing through the hole's Y range should be split into 2 segments (left + right of the hole).
    const segmentsAtSameRow = rowsThroughHole.filter((b) => Math.abs(b.start.y - rowsThroughHole[0].start.y) < 1e-6);
    expect(segmentsAtSameRow.length).toBe(2);
  });
});
