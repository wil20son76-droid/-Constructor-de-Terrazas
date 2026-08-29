/**
 * Cut-length optimisation (kapoptimering).
 *
 * Given a list of required piece lengths (mm) and a set of commercially
 * available stock lengths (mm), decides how many stock boards are needed
 * and how much offcut/waste results, using a deterministic
 * first-fit-decreasing bin-packing heuristic. This is a heuristic, not a
 * guaranteed-optimal cutting-stock solver, but it is deterministic and
 * reproducible for a given input.
 */
import type { CutPlanResult } from "../types";

export const REUSABLE_OFFCUT_MIN_MM = 300;

/**
 * Split each continuous run in `lengthsMm` into physical board-length
 * segments no longer than `maxLengthMm`, so a run longer than the longest
 * available stock length (e.g. a 14 m deck-board row with only 5.4 m
 * boards on hand) is priced as the multiple spliced boards it actually
 * takes to build, not as one impossibly long "piece". Splits are even
 * (each segment gets the same share of the run) rather than always
 * maximising segment length, matching the common practice of staggering
 * butt joints roughly evenly across a run instead of using one long piece
 * plus a short leftover.
 */
export function splitRunsToMaxLength(lengthsMm: number[], maxLengthMm: number): number[] {
  if (maxLengthMm <= 0) return lengthsMm;
  const result: number[] = [];
  for (const length of lengthsMm) {
    if (length <= maxLengthMm) {
      result.push(length);
      continue;
    }
    const segments = Math.ceil(length / maxLengthMm);
    const segmentLength = length / segments;
    for (let i = 0; i < segments; i++) result.push(segmentLength);
  }
  return result;
}

export interface BinPackingResult {
  stockLengthMm: number;
  binCount: number;
  bins: number[][]; // pieces assigned to each bin
  offcutsMm: number[]; // leftover length per bin
  totalWasteMm: number;
}

/** First-fit-decreasing bin packing of `pieces` into bins of `binLength`. */
export function packPieces(pieces: number[], binLength: number): BinPackingResult {
  const sorted = [...pieces].filter((p) => p > 0).sort((a, b) => b - a);
  const bins: number[][] = [];
  const remaining: number[] = [];

  for (const piece of sorted) {
    if (piece > binLength) {
      // Piece longer than any single stock board: still needs its own
      // bin (will show as over-length in validation); track as its own
      // oversized bin with zero offcut.
      bins.push([piece]);
      remaining.push(0);
      continue;
    }
    let placed = false;
    for (let i = 0; i < bins.length; i++) {
      if (remaining[i] >= piece) {
        bins[i].push(piece);
        remaining[i] -= piece;
        placed = true;
        break;
      }
    }
    if (!placed) {
      bins.push([piece]);
      remaining.push(binLength - piece);
    }
  }

  const totalWasteMm = remaining.reduce((s, r) => s + r, 0);
  return { stockLengthMm: binLength, binCount: bins.length, bins, offcutsMm: remaining, totalWasteMm };
}

/**
 * Try every available stock length and pick the one that minimises total
 * purchased length (bins * stockLength) — a proxy for material cost —
 * breaking ties by lowest waste.
 */
export function chooseBestStockLength(pieces: number[], availableLengthsMm: number[]): BinPackingResult {
  if (availableLengthsMm.length === 0) {
    throw new Error("No available stock lengths provided");
  }
  let best: BinPackingResult | null = null;
  for (const length of availableLengthsMm) {
    const result = packPieces(pieces, length);
    const totalPurchased = result.binCount * length;
    const bestPurchased = best ? best.binCount * best.stockLengthMm : Infinity;
    if (
      !best ||
      totalPurchased < bestPurchased ||
      (totalPurchased === bestPurchased && result.totalWasteMm < best.totalWasteMm)
    ) {
      best = result;
    }
  }
  return best as BinPackingResult;
}

export function computeCutPlan(materialId: string, pieces: number[], availableLengthsMm: number[]): CutPlanResult {
  const requiredLengthMm = pieces.reduce((s, p) => s + p, 0);
  if (pieces.length === 0 || availableLengthsMm.length === 0) {
    return {
      materialId,
      requiredLengthMm,
      availableLengthsMm,
      chosenLengthMm: availableLengthsMm[0] ?? 0,
      fullBoardsNeeded: 0,
      offcutsReusable: 0,
      wasteMm: 0,
      wastePercent: 0,
    };
  }
  const packing = chooseBestStockLength(pieces, availableLengthsMm);
  const offcutsReusable = packing.offcutsMm.filter((o) => o >= REUSABLE_OFFCUT_MIN_MM).length;
  const totalPurchasedMm = packing.binCount * packing.stockLengthMm;
  const wastePercent = totalPurchasedMm > 0 ? (packing.totalWasteMm / totalPurchasedMm) * 100 : 0;

  return {
    materialId,
    requiredLengthMm,
    availableLengthsMm,
    chosenLengthMm: packing.stockLengthMm,
    fullBoardsNeeded: packing.binCount,
    offcutsReusable,
    wasteMm: packing.totalWasteMm,
    wastePercent,
  };
}
