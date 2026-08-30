import { describe, expect, it } from "vitest";
import { lShapePolygon, rectanglePolygon } from "../geometry";
import { computeBoardLayout, planBoardRows } from "./boardLayout";

describe("planBoardRows", () => {
  it("fits full-width rows exactly when the span divides evenly (7000mm / 125mm pitch)", () => {
    // span=7000, boardWidth=120, gap=5 -> pitch=125.
    // fullRowCount = floor((7000+5)/125) = floor(56.04) = 56.
    // usedWidth = 56*125 - 5 = 6995. remaining = 7000-6995 = 5, which is
    // NOT > gap(5), so no extra cut row: exactly 56 full-width rows.
    const rows = planBoardRows(7000, 120, 5);
    expect(rows).toHaveLength(56);
    expect(rows.every((r) => r.widthMm === 120 && !r.isCut)).toBe(true);
  });

  it("adds a ripped last row when meaningful width remains (span=7050mm)", () => {
    // fullRowCount = floor((7050+5)/125) = floor(56.44) = 56.
    // usedWidth = 56*125-5 = 6995. remaining = 7050-6995 = 55, which IS > gap(5).
    // lastRowWidth = 55 - 5 = 50mm (a cut/ripped board).
    const rows = planBoardRows(7050, 120, 5);
    expect(rows).toHaveLength(57);
    const last = rows[rows.length - 1];
    expect(last.isCut).toBe(true);
    expect(last.widthMm).toBeCloseTo(50, 6);
  });

  it("never produces a row wider than the board width", () => {
    const rows = planBoardRows(1234, 120, 5);
    for (const r of rows) expect(r.widthMm).toBeLessThanOrEqual(120 + 1e-9);
  });
});

describe("computeBoardLayout", () => {
  it("fills a rectangle with horizontal boards at the given width+gap pitch (14000x7000)", () => {
    const polygon = rectanglePolygon(14000, 7000);
    const result = computeBoardLayout(polygon, [], { mode: "horizontal", angleDeg: 0 }, 120, 5);
    expect(result.rowCount).toBe(56);
    expect(result.boards).toHaveLength(56);
    expect(result.lastRowNeedsCut).toBe(false);
    expect(result.lastRowWidthMm).toBe(120);
    // Every board should span the full 14m width since the polygon is a plain rectangle.
    for (const board of result.boards) {
      expect(board.lengthMm).toBeCloseTo(14000, 6);
      expect(board.widthMm).toBe(120);
    }
    expect(result.totalLinearMm).toBeCloseTo(56 * 14000, 3);
    expect(result.effectiveWidthMm).toBeCloseTo(6995, 6);
  });

  it("rotates the layout for vertical boards (rows run along X instead of Y)", () => {
    const polygon = rectanglePolygon(14000, 7000);
    const horizontal = computeBoardLayout(polygon, [], { mode: "horizontal", angleDeg: 0 }, 120, 5);
    const vertical = computeBoardLayout(polygon, [], { mode: "vertical", angleDeg: 0 }, 120, 5);
    // Vertical boards run along Y (7000mm long each) with rows spread across the 14000mm width.
    for (const board of vertical.boards) {
      expect(board.lengthMm).toBeCloseTo(7000, 6);
    }
    // planBoardRows(14000,120,5): fullRowCount=floor(14005/125)=112, used=112*125-5=13995,
    // remaining=5 (not > gap) -> 112 rows, no cut.
    expect(vertical.rowCount).toBe(112);
    expect(vertical.lastRowNeedsCut).toBe(false);
    expect(vertical.rowCount).not.toBe(horizontal.rowCount);
  });

  it("produces two segments per row for an opening a row's scanline crosses", () => {
    const polygon = rectanglePolygon(10000, 4000);
    const opening = { id: "hole", points: rectanglePolygon(2000, 2000).points.map((p) => ({ x: p.x + 4000, y: p.y + 1000 })) };
    const result = computeBoardLayout(polygon, [opening], { mode: "horizontal", angleDeg: 0 }, 100, 0);
    const rowsThroughHole = result.boards.filter((b) => b.start.y > 1000 && b.start.y < 3000);
    const segmentsAtSameRow = rowsThroughHole.filter((b) => Math.abs(b.start.y - rowsThroughHole[0].start.y) < 1e-6);
    expect(segmentsAtSameRow.length).toBe(2);
  });

  it("clips board rows to an L-shaped notch (no board crosses into the removed area)", () => {
    const polygon = lShapePolygon(10000, 8000, 4000, 3000); // notch removes top-right 4000x3000
    const result = computeBoardLayout(polygon, [], { mode: "horizontal", angleDeg: 0 }, 120, 5);
    for (const board of result.boards) {
      const y = board.start.y;
      const inNotchRow = y < 3000; // rows within the notch height
      if (inNotchRow) {
        // Any board segment in a notched row must stay within x in [0, 6000] (10000-4000).
        expect(Math.max(board.start.x, board.end.x)).toBeLessThanOrEqual(6000 + 1e-6);
      }
    }
  });
});
