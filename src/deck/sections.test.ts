/**
 * Section-aware trall layout: independent DeckSections, each with its own
 * polygon and board direction, that must meet cleanly at a shared
 * boundary (e.g. one section at 0° meeting another at 45° around a
 * corner) — the geometric core of "DELA SEKTION" and per-section board
 * direction.
 */
import { describe, expect, it } from "vitest";
import { insertPointOnEdge, rectanglePolygon, splitPolygon } from "../geometry";
import type { DeckSection } from "../types";
import { computeAllSectionsBoardLayout, computeSectionBoardLayout } from "./boardLayout";

function buildTwoHalves() {
  const rect = rectanglePolygon(10000, 6000);
  // Insert a point at the midpoint of the top edge (5000,0) and the
  // midpoint of the bottom edge (5000,6000), then split along that
  // vertical chord into a left half [0,5000] and a right half [5000,10000].
  const withTop = insertPointOnEdge(rect.points, 0, 0.5); // (5000,0) at index 1
  const withBoth = insertPointOnEdge(withTop, 3, 0.5); // (5000,6000) at index 4
  const [right, left] = splitPolygon(withBoth, 1, 4);
  return { left, right };
}

function makeSection(id: string, points: { x: number; y: number }[], angleDeg: number): DeckSection {
  return {
    id,
    name: id,
    polygon: { id: `poly_${id}`, points },
    boardDirection: { mode: "custom", angleDeg },
    boardWidthMm: 120,
    boardThicknessMm: 28,
    boardGap: 5,
    materialId: "trall1",
    fastenerSystemId: "fsys1",
  };
}

describe("computeSectionBoardLayout", () => {
  it("tags every board with the section's id and material", () => {
    const { left } = buildTwoHalves();
    const section = makeSection("sec-left", left, 0);
    const { boards } = computeSectionBoardLayout(section);
    expect(boards.length).toBeGreaterThan(0);
    for (const b of boards) {
      expect(b.sectionId).toBe("sec-left");
      expect(b.materialId).toBe("trall1");
    }
  });

  it("clips boards to the section's own polygon (left half stays within x<=5000)", () => {
    const { left } = buildTwoHalves();
    const section = makeSection("sec-left", left, 0); // horizontal boards
    const { boards } = computeSectionBoardLayout(section);
    for (const b of boards) {
      expect(Math.max(b.start.x, b.end.x)).toBeLessThanOrEqual(5000 + 1e-6);
    }
  });
});

describe("two sections meeting at a shared boundary with different angles (0° / 45°)", () => {
  it("each section's boards stay within its own half, meeting cleanly at x=5000", () => {
    const { left, right } = buildTwoHalves();
    const sectionLeft = makeSection("sec-left", left, 0); // 0°
    const sectionRight = makeSection("sec-right", right, 45); // 45°

    const { boards, bySection } = computeAllSectionsBoardLayout([sectionLeft, sectionRight]);
    expect(bySection).toHaveLength(2);

    const leftBoards = boards.filter((b) => b.sectionId === "sec-left");
    const rightBoards = boards.filter((b) => b.sectionId === "sec-right");
    expect(leftBoards.length).toBeGreaterThan(0);
    expect(rightBoards.length).toBeGreaterThan(0);

    // Left section (0°) never crosses past the dividing line into the right half.
    for (const b of leftBoards) {
      expect(Math.max(b.start.x, b.end.x)).toBeLessThanOrEqual(5000 + 1e-6);
    }
    // Right section (45°) never crosses past the dividing line into the left half.
    for (const b of rightBoards) {
      expect(Math.min(b.start.x, b.end.x)).toBeGreaterThanOrEqual(5000 - 1e-6);
    }

    // The two sections' technical quantities are independent and additive.
    const totalLinear = bySection.reduce((s, x) => s + x.layout.totalLinearMm, 0);
    const flatTotal = boards.reduce((s, b) => s + b.lengthMm, 0);
    expect(flatTotal).toBeCloseTo(totalLinear, 6);
  });

  it("the 45° section's boards are genuinely diagonal (not axis-aligned)", () => {
    const { right } = buildTwoHalves();
    const sectionRight = makeSection("sec-right", right, 45);
    const { boards } = computeSectionBoardLayout(sectionRight);
    const diagonalBoards = boards.filter((b) => Math.abs(b.start.x - b.end.x) > 1 && Math.abs(b.start.y - b.end.y) > 1);
    // At 45°, every board's start/end must differ in BOTH x and y (a true diagonal run).
    expect(diagonalBoards.length).toBe(boards.length);
  });
});
