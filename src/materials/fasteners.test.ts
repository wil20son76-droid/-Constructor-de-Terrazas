import { describe, expect, it } from "vitest";
import type { DeckBoard, FastenerSystem, Joist } from "../types";
import { computeFastenerCounts, countBoardJoistIntersections } from "./fasteners";

function board(id: string, x1: number, y: number, x2: number): DeckBoard {
  return { id, start: { x: x1, y }, end: { x: x2, y }, lengthMm: x2 - x1, widthMm: 120 };
}

function joist(id: string, x: number, y1: number, y2: number): Joist {
  return { id, materialId: "regel", start: { x, y: y1 }, end: { x, y: y2 }, lengthMm: y2 - y1 };
}

describe("countBoardJoistIntersections", () => {
  it("counts one crossing per board/joist pair that actually crosses", () => {
    const boards = [board("b1", 0, 100, 1000), board("b2", 0, 300, 1000)];
    const joists = [joist("j1", 200, 0, 500), joist("j2", 800, 0, 500)];
    // 2 boards x 2 joists, all crossing within bounds -> 4 intersections.
    expect(countBoardJoistIntersections(boards, joists)).toBe(4);
  });

  it("does not count a joist that never reaches the board's row", () => {
    const boards = [board("b1", 0, 100, 1000)];
    const joists = [joist("j1", 200, 200, 500)]; // starts below the board's y=100 row
    expect(countBoardJoistIntersections(boards, joists)).toBe(0);
  });
});

describe("computeFastenerCounts", () => {
  const boards = [board("b1", 0, 100, 1000)];
  const joists = [joist("j1", 200, 0, 500), joist("j2", 800, 0, 500)];

  it("multiplies intersections by screwsPerIntersection for a visible-screw system", () => {
    const system: FastenerSystem = { id: "s1", type: "visible_skruv", name: "Synlig", screwsPerIntersection: 2 };
    const counts = computeFastenerCounts(boards, joists, 0, 4, system);
    expect(counts.trallFasteners).toBe(4); // 2 intersections * 2 screws
    expect(counts.vinkelbeslagCount).toBe(joists.length * 2);
    expect(counts.plintskruvCount).toBe(4 * 4);
  });

  it("uses clipsPerIntersection instead for a clip-based system", () => {
    const system: FastenerSystem = {
      id: "s2",
      type: "step_clip",
      name: "Step-Clip",
      screwsPerIntersection: 0,
      clipsPerIntersection: 2,
    };
    const counts = computeFastenerCounts(boards, joists, 0, 4, system);
    expect(counts.trallFasteners).toBe(4);
    expect(counts.trallFastenerLabel).toBe("clips");
  });
});
