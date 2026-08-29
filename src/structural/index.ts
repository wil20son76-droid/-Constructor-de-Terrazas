/**
 * Structural layout engine (stomme): reglar, bärlinor, plintar (footings),
 * stolpar (posts) and kortlingar (blocking).
 *
 * Conventions:
 *  - Trall (boards) run along `boardAngle`.
 *  - Reglar (joists) run perpendicular to the boards, spaced at CC
 *    (`regelSpacing`) measured along the board direction.
 *  - Bärlinor (beams) run parallel to the boards (i.e. perpendicular to
 *    the reglar), spaced at `barlinaMaxSpacing` measured perpendicular to
 *    the boards.
 *  - Plintar (footings) are distributed along each bärlina at
 *    `plintMaxSpacing`, edge-to-edge.
 *  - For material dimension strings like "45x95", `widthMm` is the
 *    horizontal cross-section and `thicknessMm` is the installed
 *    (vertical) height of the member.
 */
import type { Beam, DeckLevel, Footing, Joist, Point, Post } from "../types";
import { makeId } from "../geometry";
import { boardAngleFor } from "../deck/boardLayout";
import { computeMemberLines, computePerpendicularMemberLines, computeRowPositions } from "./memberLayout";

export function computeReglar(level: DeckLevel): Joist[] {
  const angle = boardAngleFor(level.boardDirection);
  const lines = computePerpendicularMemberLines(
    level.polygon,
    level.openings,
    angle,
    level.regelSpacing,
    "edge-to-edge",
  );
  return lines.map((line) => ({
    id: makeId("regel"),
    materialId: level.regelMaterialId,
    start: line.start,
    end: line.end,
    lengthMm: line.lengthMm,
  }));
}

export function computeBarlinor(level: DeckLevel): Beam[] {
  const angle = boardAngleFor(level.boardDirection);
  const lines = computeMemberLines(
    level.polygon,
    level.openings,
    angle,
    level.barlinaMaxSpacing,
    "edge-to-edge",
  );
  return lines.map((line) => ({
    id: makeId("barlina"),
    materialId: level.barlinaMaterialId,
    start: line.start,
    end: line.end,
    lengthMm: line.lengthMm,
  }));
}

/** Distribute footings (plintar) along each bärlina, numbered P1, P2, ... */
export function computeFootings(barlinor: Beam[], plintTypeId: string, maxSpacingMm: number): Footing[] {
  const footings: Footing[] = [];
  let counter = 1;
  for (const beam of barlinor) {
    const positions = computeRowPositions(0, beam.lengthMm, maxSpacingMm, "edge-to-edge");
    const dx = beam.end.x - beam.start.x;
    const dy = beam.end.y - beam.start.y;
    const len = beam.lengthMm || 1;
    for (const t of positions) {
      const position: Point = {
        x: beam.start.x + (dx * t) / len,
        y: beam.start.y + (dy * t) / len,
      };
      footings.push({ id: makeId("plint"), typeId: plintTypeId, position, label: `P${counter}` });
      counter++;
    }
  }
  return footings;
}

/**
 * Height of each post (stolpe), in mm, from the top of the footing to the
 * underside of the deck boards, accounting for board thickness, joist
 * height and beam height. Returns 0 (no posts needed) when the deck sits
 * low enough that bärlinor rest directly on the footings.
 */
export function computePostHeight(
  heightAboveGroundMm: number,
  trallThicknessMm: number,
  regelHeightMm: number,
  barlinaHeightMm: number,
): number {
  const buildUp = trallThicknessMm + regelHeightMm + barlinaHeightMm;
  return Math.max(0, heightAboveGroundMm - buildUp);
}

export function computePosts(footings: Footing[], postMaterialId: string, heightMm: number): Post[] {
  if (heightMm <= 0) return [];
  return footings.map((f) => ({
    id: makeId("stolpe"),
    materialId: postMaterialId,
    position: f.position,
    heightMm,
  }));
}

/**
 * Approximate count of kortlingar (blocking pieces between adjacent
 * reglar), placed at roughly `spacingMm` intervals along the run of the
 * reglar, one row of blocking per bay between two consecutive reglar.
 *
 * This is a simplified estimate: it does not model openings or irregular
 * polygons precisely. Always shown alongside the standard structural
 * disclaimer.
 */
export function estimateKortlingCount(reglar: Joist[], spacingMm: number): number {
  if (reglar.length < 2 || spacingMm <= 0) return 0;
  const bays = reglar.length - 1;
  const avgLength = reglar.reduce((s, r) => s + r.lengthMm, 0) / reglar.length;
  const rowsPerBay = Math.max(0, Math.floor(avgLength / spacingMm));
  return bays * rowsPerBay;
}
