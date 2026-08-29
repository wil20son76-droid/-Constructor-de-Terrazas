/**
 * Deck board (trall) layout engine.
 *
 * Given a polygon (+ openings) and a board direction, this computes the
 * set of physical board segments that fill the deck area. Delegates the
 * scanline clipping to the shared structural member-layout primitive.
 * Everything is in millimetres.
 */
import type { BoardDirection, DeckBoard, DeckOpening, DeckPolygon } from "../types";
import { makeId } from "../geometry";
import { computeMemberLines } from "../structural/memberLayout";

export interface BoardLayoutResult {
  boards: DeckBoard[];
  rowCount: number;
  totalLinearMm: number;
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

export function computeBoardLayout(
  polygon: DeckPolygon,
  openings: DeckOpening[],
  direction: BoardDirection,
  boardWidthMm: number,
  boardGapMm: number,
): BoardLayoutResult {
  const angle = boardAngleFor(direction);
  const pitch = boardWidthMm + boardGapMm;
  if (pitch <= 0) return { boards: [], rowCount: 0, totalLinearMm: 0 };

  const lines = computeMemberLines(polygon, openings, angle, pitch, "centered");

  const boards: DeckBoard[] = lines.map((line) => ({
    id: makeId("board"),
    start: line.start,
    end: line.end,
    lengthMm: line.lengthMm,
    widthMm: boardWidthMm,
  }));

  const rowPositions = new Set(lines.map((l) => l.rowPosition));
  const totalLinearMm = lines.reduce((sum, l) => sum + l.lengthMm, 0);

  return { boards, rowCount: rowPositions.size, totalLinearMm };
}
