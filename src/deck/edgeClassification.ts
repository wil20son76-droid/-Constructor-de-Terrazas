/**
 * Classifies each polygon edge of a deck level so edge-board (kantbräda /
 * sargbräda / ventilationsprofil) quantities are only computed for edges
 * that should actually get one — never a wall edge (the house wall closes
 * that side off) or a stair edge (covered by the stair's own trim), and
 * only when the user hasn't explicitly marked the edge "open" (no trim
 * planned, e.g. it butts against another deck/zone).
 */
import type { DeckLevel, EdgeType } from "../types";

export function classifyEdges(level: DeckLevel): EdgeType[] {
  const edgeCount = level.polygon.points.length;
  const stairEdges = new Set(level.stairs.map((s) => s.edgeIndex));
  const wallEdges = new Set(level.wallEdgeIndices ?? []);
  const openEdges = new Set(level.openEdgeIndices ?? []);

  return Array.from({ length: edgeCount }, (_, i) => {
    if (stairEdges.has(i)) return "stair";
    if (wallEdges.has(i)) return "wall";
    if (openEdges.has(i)) return "open";
    return "external";
  });
}

/** Filters `edgeIndices` down to the ones eligible for an edge board (external edges only). */
export function filterEdgeBoardEligible(edgeIndices: number[], classification: EdgeType[]): number[] {
  return edgeIndices.filter((i) => classification[i] === "external");
}
