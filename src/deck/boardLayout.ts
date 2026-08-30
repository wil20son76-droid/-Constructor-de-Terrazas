/**
 * Deck board (trall) layout engine.
 *
 * Given a polygon (+ openings) and a board direction, this computes the
 * physical row plan (how many full-width rows fit, whether a final
 * narrower/cut row is needed) and then the actual board segments per row,
 * clipped to the polygon. Everything is in millimetres.
 */
import type { BoardDirection, DeckBoard, DeckOpening, DeckPolygon, DeckSection } from "../types";
import { makeId } from "../geometry";
import { clipRowsToPolygon, rotatedBoundingBox } from "../structural/memberLayout";

export interface BoardLayoutResult {
  boards: DeckBoard[];
  rowCount: number;
  totalLinearMm: number;
  /** Total width actually covered by boards (full rows + any cut last row), mm. */
  effectiveWidthMm: number;
  /** Width of the final row; equals `boardWidthMm` when no cut row was needed. */
  lastRowWidthMm: number;
  /** True when the final row is narrower than a full board and must be ripped to fit. */
  lastRowNeedsCut: boolean;
}

export function boardAngleFor(direction: BoardDirection): number {
  if (direction.mode === "custom") return direction.angleDeg;
  switch (direction.mode) {
    case "horizontal":
      return 0;
    case "vertical":
      return 90;
    case "diagonal45":
      return 45;
    default:
      return 0;
  }
}

interface RowPlanEntry {
  /** Row centreline position along the perpendicular axis, local frame, mm. */
  centerY: number;
  widthMm: number;
  /** True for a final row ripped narrower than a full board to fit the remaining span. */
  isCut: boolean;
}

/**
 * Plan the rows of a board layout across a span of `spanMm`, starting
 * flush against one edge (centre of the first row at `boardWidthMm / 2`
 * from that edge). As many full-width rows are placed as fit at
 * `boardWidthMm + gapMm` pitch; if there is meaningful space left over
 * (`> gapMm`) a final row is added, ripped narrower to exactly fill the
 * remaining span (`lastRowNeedsCut = true`). A small leftover
 * (`<= gapMm`) is left as extra margin at the far edge rather than
 * forcing a sliver board, matching how a crew would actually lay it out.
 */
export function planBoardRows(spanMm: number, boardWidthMm: number, gapMm: number): RowPlanEntry[] {
  const pitch = boardWidthMm + gapMm;
  if (spanMm <= 0 || pitch <= 0) return [];

  const fullRowCount = Math.max(0, Math.floor((spanMm + gapMm) / pitch));
  const rows: RowPlanEntry[] = [];
  for (let i = 0; i < fullRowCount; i++) {
    rows.push({ centerY: i * pitch + boardWidthMm / 2, widthMm: boardWidthMm, isCut: false });
  }

  const usedWidth = fullRowCount > 0 ? fullRowCount * pitch - gapMm : 0;
  const remaining = spanMm - usedWidth;
  if (remaining > gapMm + 1e-6) {
    const lastRowWidth = remaining - gapMm;
    rows.push({ centerY: usedWidth + gapMm + lastRowWidth / 2, widthMm: lastRowWidth, isCut: true });
  }
  return rows;
}

export function computeBoardLayout(
  polygon: DeckPolygon,
  openings: DeckOpening[],
  direction: BoardDirection,
  boardWidthMm: number,
  boardGapMm: number,
): BoardLayoutResult {
  const angle = boardAngleFor(direction);
  if (boardWidthMm <= 0) {
    return { boards: [], rowCount: 0, totalLinearMm: 0, effectiveWidthMm: 0, lastRowWidthMm: 0, lastRowNeedsCut: false };
  }

  const bbox = rotatedBoundingBox(polygon.points, angle);
  const span = bbox.maxY - bbox.minY;
  const rowPlan = planBoardRows(span, boardWidthMm, boardGapMm);
  if (rowPlan.length === 0) {
    return { boards: [], rowCount: 0, totalLinearMm: 0, effectiveWidthMm: 0, lastRowWidthMm: 0, lastRowNeedsCut: false };
  }

  const rowYs = rowPlan.map((r) => bbox.minY + r.centerY);
  const clipped = clipRowsToPolygon(polygon, openings, angle, rowYs);

  const boards: DeckBoard[] = clipped.map((line) => ({
    id: makeId("board"),
    start: line.start,
    end: line.end,
    lengthMm: line.lengthMm,
    widthMm: rowPlan[line.rowIndex].widthMm,
  }));

  const rowIndicesUsed = new Set(clipped.map((l) => l.rowIndex));
  const totalLinearMm = boards.reduce((sum, b) => sum + b.lengthMm, 0);
  const lastEntry = rowPlan[rowPlan.length - 1];
  const effectiveWidthMm = lastEntry.centerY + lastEntry.widthMm / 2;

  return {
    boards,
    rowCount: rowIndicesUsed.size,
    totalLinearMm,
    effectiveWidthMm,
    lastRowWidthMm: lastEntry.widthMm,
    lastRowNeedsCut: lastEntry.isCut,
  };
}

/**
 * Compute the real, clipped board layout for ONE trall section — each
 * section is an independent polygon with its own board direction and
 * material, e.g. a 45° section meeting a 0° section around a corner.
 * Boards are tagged with `sectionId`/`materialId` so the BOM can group
 * them correctly even when different sections use different materials.
 *
 * Sections currently don't carry their own openings (holes) — a section
 * is assumed to be a solid subpolygon of the level, per `DELA SEKTION`.
 */
export function computeSectionBoardLayout(section: DeckSection): BoardLayoutResult & { boards: DeckBoard[] } {
  const openings: DeckOpening[] = [];
  const result = computeBoardLayout(section.polygon, openings, section.boardDirection, section.boardWidthMm, section.boardGap);
  const boards: DeckBoard[] = result.boards.map((b) => ({ ...b, sectionId: section.id, materialId: section.materialId }));
  return { ...result, boards };
}

/**
 * Compute board layouts for every section of a level and combine them
 * into one flat board array (each board still tagged with its
 * `sectionId`/`materialId`) plus the per-section breakdown, for the BOM
 * and the plan view.
 */
export function computeAllSectionsBoardLayout(sections: DeckSection[]): {
  boards: DeckBoard[];
  bySection: { section: DeckSection; layout: BoardLayoutResult }[];
} {
  const bySection = sections.map((section) => ({ section, layout: computeSectionBoardLayout(section) }));
  const boards = bySection.flatMap((s) => s.layout.boards);
  return { boards, bySection };
}
