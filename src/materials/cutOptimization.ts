/**
 * Cut-length optimisation (kapoptimering).
 *
 * Given a list of required piece lengths (mm) and a set of commercially
 * available stock lengths (mm), decides how many stock boards of each
 * length are needed, which piece goes into which board, and how much
 * offcut/waste results. Deterministic and reproducible for a given input.
 *
 * Algorithm (best-fit-decreasing over a MIXED set of stock lengths, with
 * one-step lookahead when opening a new board):
 *
 *  1. Sort pieces largest-first.
 *  2. For each piece, first try to reuse an already-opened board: the one
 *     with the smallest remaining capacity that can still fit the piece
 *     (best-fit) — this is what lets a later, smaller piece land in an
 *     earlier piece's offcut.
 *  3. If no open board fits, a new one must be bought. Naively always
 *     buying the SHORTEST stock length that fits the current piece is
 *     wrong: e.g. two 2.1 m pieces should share one 4.2 m board, but
 *     "shortest that fits the first 2.1 m piece" would buy a 3.6 m board
 *     with only 1.5 m left over — too little for the second 2.1 m piece.
 *     So instead, for each candidate stock length >= the piece, we
 *     simulate greedily packing the next not-yet-placed pieces into the
 *     leftover space, and pick the length that leaves the least waste
 *     once nothing more will fit — i.e. the length that best "sees ahead"
 *     to what else needs cutting. Ties go to the shortest length.
 *
 * This is a heuristic, not a guaranteed-optimal cutting-stock solver, but
 * it is deterministic, reproducible, and correctly prices mixed-length
 * scenarios instead of forcing one uniform stock length for an entire job
 * (which can silently under-price pieces longer than that one length —
 * see CALCULATION_AUDIT.md).
 */
import type { CutBin, CutBinItem, CutPlanResult, PurchasedBoardGroup } from "../types";

export const REUSABLE_OFFCUT_MIN_MM = 300;

/** How many not-yet-placed pieces to look ahead when sizing a new board. Bounded for performance on large BOMs. */
const LOOKAHEAD_WINDOW = 200;

export interface PieceSegment {
  /** Index of the original (pre-split) required piece/row. */
  sourceIndex: number;
  segmentIndex: number;
  totalSegments: number;
  lengthMm: number;
}

/**
 * Split each continuous run in `pieces` into physical board-length
 * segments no longer than `maxLengthMm`, so a run longer than the longest
 * available stock length (e.g. a 14 m deck-board row with only 5.4 m
 * boards on hand) is priced as the multiple spliced boards it actually
 * takes to build, not as one impossibly long "piece". Splits are even
 * (each segment gets the same share of the run) rather than always
 * maximising segment length, matching the common practice of staggering
 * butt joints roughly evenly across a run instead of using one long piece
 * plus a short leftover.
 */
export function buildPieceSegments(pieces: number[], maxLengthMm: number): PieceSegment[] {
  const segments: PieceSegment[] = [];
  pieces.forEach((length, sourceIndex) => {
    if (length <= 0) return;
    const totalSegments = maxLengthMm > 0 ? Math.max(1, Math.ceil(length / maxLengthMm)) : 1;
    const segmentLength = length / totalSegments;
    for (let segmentIndex = 0; segmentIndex < totalSegments; segmentIndex++) {
      segments.push({ sourceIndex, segmentIndex, totalSegments, lengthMm: segmentLength });
    }
  });
  return segments;
}

/** Backward-compatible plain-number wrapper around `buildPieceSegments`. */
export function splitRunsToMaxLength(lengthsMm: number[], maxLengthMm: number): number[] {
  if (maxLengthMm <= 0) return lengthsMm;
  return buildPieceSegments(lengthsMm, maxLengthMm).map((s) => s.lengthMm);
}

/** Simulates first-fit packing of `segments` (in order) into `startingRemaining` mm; returns leftover space. */
function simulateGreedyFill(startingRemainingMm: number, segments: PieceSegment[]): number {
  let remaining = startingRemainingMm;
  for (const seg of segments) {
    if (seg.lengthMm <= remaining + 1e-9) remaining -= seg.lengthMm;
  }
  return Math.max(0, remaining);
}

export function packSegments(segments: PieceSegment[], availableLengthsMm: number[]): CutBin[] {
  if (availableLengthsMm.length === 0) return [];
  const sortedLengths = [...availableLengthsMm].sort((a, b) => a - b);
  const sorted = [...segments].sort((a, b) => b.lengthMm - a.lengthMm);
  const bins: CutBin[] = [];

  sorted.forEach((seg, i) => {
    // 1. Best-fit into an already-open bin (smallest remaining capacity that still fits).
    let bestBin: CutBin | null = null;
    for (const bin of bins) {
      const remaining = bin.stockLengthMm - bin.usedMm;
      if (remaining + 1e-9 >= seg.lengthMm) {
        if (!bestBin || remaining < bestBin.stockLengthMm - bestBin.usedMm) bestBin = bin;
      }
    }
    if (bestBin) {
      bestBin.items.push({
        sourceIndex: seg.sourceIndex,
        segmentIndex: seg.segmentIndex,
        totalSegments: seg.totalSegments,
        lengthMm: seg.lengthMm,
      });
      bestBin.usedMm += seg.lengthMm;
      bestBin.offcutMm = bestBin.stockLengthMm - bestBin.usedMm;
      return;
    }

    // 2. Open a new bin. Pick the stock length that, after greedily fitting
    // as many of the next not-yet-placed pieces as possible, leaves the
    // least waste — not just the shortest length that fits THIS piece.
    const lookahead = sorted.slice(i + 1, i + 1 + LOOKAHEAD_WINDOW);
    let chosenLength: number | null = null;
    let bestWaste = Infinity;
    for (const length of sortedLengths) {
      if (length + 1e-9 < seg.lengthMm) continue; // doesn't even fit this piece
      const waste = simulateGreedyFill(length - seg.lengthMm, lookahead);
      if (waste < bestWaste - 1e-9) {
        bestWaste = waste;
        chosenLength = length;
      }
    }
    // No available stock is long enough for this single piece: it must be
    // reported as its own oversized "bin" so callers can flag it — this
    // should not normally happen once `buildPieceSegments` has split runs
    // to the longest available length first.
    const stockLengthMm = chosenLength ?? seg.lengthMm;
    const bin: CutBin = {
      index: bins.length,
      stockLengthMm,
      items: [{ sourceIndex: seg.sourceIndex, segmentIndex: seg.segmentIndex, totalSegments: seg.totalSegments, lengthMm: seg.lengthMm }],
      usedMm: seg.lengthMm,
      offcutMm: stockLengthMm - seg.lengthMm,
    };
    bins.push(bin);
  });

  return bins;
}

export function computeCutPlan(materialId: string, pieces: number[], availableLengthsMm: number[]): CutPlanResult {
  const requiredLengthMm = pieces.reduce((s, p) => s + Math.max(0, p), 0);
  const piecesCount = pieces.filter((p) => p > 0).length;

  if (piecesCount === 0 || availableLengthsMm.length === 0) {
    return {
      materialId,
      requiredLengthMm,
      availableLengthsMm,
      piecesCount,
      segmentsCount: 0,
      spliceCount: 0,
      bins: [],
      purchasedBreakdown: [],
      totalPurchasedLengthMm: 0,
      totalPurchasedCount: 0,
      offcutsReusable: 0,
      wasteMm: 0,
      wastePercent: 0,
    };
  }

  const maxAvailable = Math.max(...availableLengthsMm);
  const segments = buildPieceSegments(pieces, maxAvailable);
  const bins = packSegments(segments, availableLengthsMm);

  const totalPurchasedLengthMm = bins.reduce((s, b) => s + b.stockLengthMm, 0);
  const wasteMm = bins.reduce((s, b) => s + b.offcutMm, 0);
  const wastePercent = totalPurchasedLengthMm > 0 ? (wasteMm / totalPurchasedLengthMm) * 100 : 0;
  const offcutsReusable = bins.filter((b) => b.offcutMm >= REUSABLE_OFFCUT_MIN_MM).length;

  const breakdownMap = new Map<number, number>();
  for (const bin of bins) breakdownMap.set(bin.stockLengthMm, (breakdownMap.get(bin.stockLengthMm) ?? 0) + 1);
  const purchasedBreakdown: PurchasedBoardGroup[] = [...breakdownMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([lengthMm, count]) => ({ lengthMm, count }));

  const segmentsPerSource = new Map<number, number>();
  for (const seg of segments) segmentsPerSource.set(seg.sourceIndex, (segmentsPerSource.get(seg.sourceIndex) ?? 0) + 1);
  const spliceCount = [...segmentsPerSource.values()].filter((n) => n > 1).length;

  return {
    materialId,
    requiredLengthMm,
    availableLengthsMm,
    piecesCount,
    segmentsCount: segments.length,
    spliceCount,
    bins,
    purchasedBreakdown,
    totalPurchasedLengthMm,
    totalPurchasedCount: bins.length,
    offcutsReusable,
    wasteMm,
    wastePercent,
  };
}

export type { CutBin, CutBinItem };
