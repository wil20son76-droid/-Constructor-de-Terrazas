/**
 * Fastener (infästning) calculation.
 *
 * All counts are deterministic functions of the computed geometry
 * (board/joist intersections, member counts) and user-configurable
 * multipliers — never hard-coded "correct" values.
 */
import type { DeckBoard, FastenerSystem, Joist, Point } from "../types";

function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return false; // parallel
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom;
  const eps = 1e-6;
  return t > eps && t < 1 - eps && u > eps && u < 1 - eps;
}

/** Number of points where deck boards cross joists (trall/regel intersections). */
export function countBoardJoistIntersections(boards: DeckBoard[], joists: Joist[]): number {
  let count = 0;
  for (const board of boards) {
    for (const joist of joists) {
      if (segmentsIntersect(board.start, board.end, joist.start, joist.end)) count++;
    }
  }
  return count;
}

export interface FastenerCounts {
  trallFasteners: number; // screws or clips fixing boards to joists
  trallFastenerLabel: string;
  vinkelbeslagCount: number; // joist-to-beam angle brackets, 2 per joist
  konstruktionsskruvCount: number; // general framing screws for blocking
  plintskruvCount: number; // fastenings at each footing/post base
}

export function computeFastenerCounts(
  boards: DeckBoard[],
  joists: Joist[],
  kortlingCount: number,
  footingOrPostCount: number,
  system: FastenerSystem,
): FastenerCounts {
  const intersections = countBoardJoistIntersections(boards, joists);
  const perIntersection =
    system.type === "step_clip" || system.type === "t_clips"
      ? system.clipsPerIntersection ?? 1
      : system.screwsPerIntersection;
  const trallFasteners = intersections * perIntersection;
  const trallFastenerLabel =
    system.type === "step_clip" || system.type === "t_clips" ? "clips" : "skruv";

  const vinkelbeslagCount = joists.length * 2;
  const konstruktionsskruvCount = kortlingCount * 4;
  const plintskruvCount = footingOrPostCount * 4;

  return { trallFasteners, trallFastenerLabel, vinkelbeslagCount, konstruktionsskruvCount, plintskruvCount };
}
