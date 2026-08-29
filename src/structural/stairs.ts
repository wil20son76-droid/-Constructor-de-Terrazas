/**
 * Stair (trappa) calculation engine.
 *
 * Produces a deterministic material take-off for a straight staircase
 * attached to one edge of the deck. Formulas are simplified, standard
 * carpentry rules of thumb — always shown next to the general structural
 * disclaimer, never presented as a building-code guarantee.
 */
import type { Stair } from "../types";

export interface StairCalculationResult {
  riserHeightMm: number;
  stringerCount: number; // vangstycken
  stringerLengthMm: number;
  treadBoardLinearMm: number; // total linear meters of trall for all treads
  treadBoardCount: number;
  regelLinearMm: number; // support noggings under each tread
  screwCount: number;
}

const MAX_STRINGER_SPACING_MM = 900; // extra vangstycke every ~900mm of width
const SCREWS_PER_TREAD_PER_STRINGER = 3;

export function computeStair(stair: Stair, trallBoardWidthMm: number, trallBoardGapMm: number): StairCalculationResult {
  const riserHeightMm = stair.stepCount > 0 ? stair.totalHeightMm / stair.stepCount : 0;

  const stringerCount = Math.max(2, Math.ceil(stair.widthMm / MAX_STRINGER_SPACING_MM) + 1);

  // Stringer length via Pythagoras over the full run (steps * depth) and rise.
  const totalRunMm = stair.stepCount * stair.stepDepthMm;
  const stringerLengthMm = Math.sqrt(totalRunMm * totalRunMm + stair.totalHeightMm * stair.totalHeightMm);

  // Each tread is covered with boards across the stair width.
  const pitch = trallBoardWidthMm + trallBoardGapMm;
  const boardsPerTread = pitch > 0 ? Math.ceil(stair.stepDepthMm / pitch) : 0;
  const treadBoardCount = boardsPerTread * stair.stepCount;
  const treadBoardLinearMm = treadBoardCount * stair.widthMm;

  // One regel nogging under the front and back of each tread.
  const regelLinearMm = stair.stepCount * 2 * stair.widthMm;

  const screwCount = stair.stepCount * stringerCount * SCREWS_PER_TREAD_PER_STRINGER;

  return {
    riserHeightMm,
    stringerCount,
    stringerLengthMm,
    treadBoardLinearMm,
    treadBoardCount,
    regelLinearMm,
    screwCount,
  };
}
