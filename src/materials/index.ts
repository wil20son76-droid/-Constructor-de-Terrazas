/**
 * Material calculation engine: turns a DeckLevel's geometry + structural
 * configuration into a full bill of materials (BOM), grouped the way the
 * spec requests (TRALL / STOMME / PLINTAR / INFÄSTNING / TRAPPA / ÖVRIGT).
 *
 * This module only orchestrates the geometry/structural/cut-optimisation
 * primitives defined elsewhere; it does not contain UI or React code.
 */
import type {
  Beam,
  BomGroup,
  BomLine,
  CutPlanResult,
  DeckBoard,
  DeckLevel,
  Footing,
  Joist,
  MaterialLibrary,
  Post,
} from "../types";
import { computeAreaSummary } from "../geometry";
import { computeBoardLayout } from "../deck/boardLayout";
import {
  computeBarlinor,
  computeFootings,
  computePostHeight,
  computePosts,
  computeReglar,
  estimateKortlingCount,
} from "../structural";
import { computeStair, type StairCalculationResult } from "../structural/stairs";
import { computeFastenerCounts } from "./fasteners";
import { computeCutPlan, splitRunsToMaxLength } from "./cutOptimization";

export interface LevelGeometryResult {
  boards: DeckBoard[];
  joists: Joist[];
  beams: Beam[];
  footings: Footing[];
  posts: Post[];
  kortlingCount: number;
  postHeightMm: number;
  stairs: { stair: DeckLevel["stairs"][number]; result: StairCalculationResult }[];
}

function findMaterial(library: MaterialLibrary, id: string) {
  return library.materials.find((m) => m.id === id);
}

export function computeLevelGeometry(level: DeckLevel, library: MaterialLibrary): LevelGeometryResult {
  const trallMaterial = findMaterial(library, level.trallMaterialId);
  const boardWidthMm = trallMaterial?.widthMm ?? 120;
  const layout = computeBoardLayout(level.polygon, level.openings, level.boardDirection, boardWidthMm, level.boardGap);

  const joists = computeReglar(level);
  const beams = computeBarlinor(level);
  const footings = computeFootings(beams, level.plintTypeId, level.plintMaxSpacing);

  const trallThicknessMm = trallMaterial?.thicknessMm ?? 28;
  const regelMaterial = findMaterial(library, level.regelMaterialId);
  const barlinaMaterial = findMaterial(library, level.barlinaMaterialId);
  const postHeightMm = computePostHeight(
    level.heightAboveGround,
    trallThicknessMm,
    regelMaterial?.thicknessMm ?? 95,
    barlinaMaterial?.thicknessMm ?? 195,
  );
  const posts = level.postMaterialId ? computePosts(footings, level.postMaterialId, postHeightMm) : [];

  const kortlingCount = level.kortlingSpacing ? estimateKortlingCount(joists, level.kortlingSpacing) : 0;

  const stairs = level.stairs.map((stair) => ({
    stair,
    result: computeStair(stair, boardWidthMm, level.boardGap),
  }));

  return { boards: layout.boards, joists, beams, footings, posts, kortlingCount, postHeightMm, stairs };
}

function purchaseUnitCount(quantity: number, unitsPerPackage?: number): number {
  if (!unitsPerPackage || unitsPerPackage <= 1) return Math.ceil(quantity);
  return Math.ceil(quantity / unitsPerPackage);
}

function makeLumberBomLine(
  library: MaterialLibrary,
  materialId: string,
  group: BomGroup,
  pieces: number[],
  suppliedByClient: boolean,
): { line: BomLine; cutPlan: CutPlanResult } | null {
  const material = findMaterial(library, materialId);
  if (!material || pieces.length === 0) return null;
  const availableLengths = material.availableLengthsMm ?? [Math.max(...pieces)];
  // A run longer than the longest available stock length has to be built
  // from multiple spliced boards (e.g. a 14 m board row with 5.4 m stock);
  // split it into physical segments before cutting, otherwise it would be
  // priced as one impossibly long, unbuyable "board".
  const buildablePieces = splitRunsToMaxLength(pieces, Math.max(...availableLengths));
  const cutPlan = computeCutPlan(materialId, buildablePieces, availableLengths);
  const pricePerMeter = material.pricePerMeter ?? 0;
  const requiredMeters = cutPlan.requiredLengthMm / 1000;
  const purchaseMeters = (cutPlan.fullBoardsNeeded * cutPlan.chosenLengthMm) / 1000;
  const subtotal = requiredMeters * pricePerMeter;
  const purchaseTotal = purchaseMeters * pricePerMeter;

  const line: BomLine = {
    materialId,
    group,
    materialName: material.nameSv,
    dimension: material.widthMm && material.thicknessMm ? `${material.widthMm}x${material.thicknessMm}` : "",
    lengthMm: cutPlan.chosenLengthMm,
    quantity: pieces.length,
    unit: "st",
    linearMeters: requiredMeters,
    pricePerUnit: pricePerMeter,
    subtotal,
    wastePercent: cutPlan.wastePercent,
    purchaseQuantity: cutPlan.fullBoardsNeeded,
    purchaseTotal,
    suppliedByClient,
  };
  return { line, cutPlan };
}

function makeUnitBomLine(
  library: MaterialLibrary,
  materialId: string,
  group: BomGroup,
  quantity: number,
  suppliedByClient: boolean,
  reason?: string,
): BomLine | null {
  const material = findMaterial(library, materialId);
  if (!material || quantity <= 0) return null;
  const isPackaged = material.unit === "förp";
  const purchaseQuantity = isPackaged ? purchaseUnitCount(quantity, material.unitsPerPackage) : Math.ceil(quantity);
  const pricePerUnit = material.pricePerUnit ?? 0;
  return {
    materialId,
    group,
    materialName: reason ? `${material.nameSv} (${reason})` : material.nameSv,
    dimension: material.widthMm && material.thicknessMm ? `${material.widthMm}x${material.thicknessMm}` : "",
    quantity,
    unit: material.unit ?? "st",
    pricePerUnit,
    subtotal: quantity * pricePerUnit,
    wastePercent: material.wastePercent,
    purchaseQuantity,
    purchaseTotal: purchaseQuantity * pricePerUnit,
    suppliedByClient,
  };
}

export interface LevelBomResult {
  geometry: LevelGeometryResult;
  bomLines: BomLine[];
  cutPlans: CutPlanResult[];
}

export function computeLevelBom(
  level: DeckLevel,
  library: MaterialLibrary,
  clientSuppliedMaterialIds: string[],
): LevelBomResult {
  const geometry = computeLevelGeometry(level, library);
  const bomLines: BomLine[] = [];
  const cutPlans: CutPlanResult[] = [];
  const suppliedBy = (id: string) => clientSuppliedMaterialIds.includes(id);

  const trall = makeLumberBomLine(
    library,
    level.trallMaterialId,
    "TRALL",
    geometry.boards.map((b) => b.lengthMm),
    suppliedBy(level.trallMaterialId),
  );
  if (trall) {
    bomLines.push(trall.line);
    cutPlans.push(trall.cutPlan);
  }

  const regel = makeLumberBomLine(
    library,
    level.regelMaterialId,
    "STOMME",
    geometry.joists.map((j) => j.lengthMm),
    suppliedBy(level.regelMaterialId),
  );
  if (regel) {
    bomLines.push(regel.line);
    cutPlans.push(regel.cutPlan);
  }

  const barlina = makeLumberBomLine(
    library,
    level.barlinaMaterialId,
    "STOMME",
    geometry.beams.map((b) => b.lengthMm),
    suppliedBy(level.barlinaMaterialId),
  );
  if (barlina) {
    bomLines.push(barlina.line);
    cutPlans.push(barlina.cutPlan);
  }

  if (level.postMaterialId && geometry.posts.length > 0) {
    const posts = makeLumberBomLine(
      library,
      level.postMaterialId,
      "STOMME",
      geometry.posts.map((p) => p.heightMm),
      suppliedBy(level.postMaterialId),
    );
    if (posts) {
      bomLines.push(posts.line);
      cutPlans.push(posts.cutPlan);
    }
  }

  // Plintar
  const plintType = library.plintTypes.find((p) => p.id === level.plintTypeId);
  if (plintType?.materialId) {
    const plintLine = makeUnitBomLine(
      library,
      plintType.materialId,
      "PLINTAR",
      geometry.footings.length,
      suppliedBy(plintType.materialId),
    );
    if (plintLine) bomLines.push(plintLine);
  }

  // Fasteners
  const fastenerSystem = library.fastenerSystems.find((f) => f.id === level.fastenerSystemId);
  if (fastenerSystem) {
    const counts = computeFastenerCounts(
      geometry.boards,
      geometry.joists,
      geometry.kortlingCount,
      geometry.posts.length > 0 ? geometry.posts.length : geometry.footings.length,
      fastenerSystem,
    );

    if (fastenerSystem.clipMaterialId) {
      const clipLine = makeUnitBomLine(
        library,
        fastenerSystem.clipMaterialId,
        "INFASTNING",
        counts.trallFasteners,
        suppliedBy(fastenerSystem.clipMaterialId),
        "trall/regel",
      );
      if (clipLine) bomLines.push(clipLine);
    } else if (fastenerSystem.screwMaterialId) {
      const screwLine = makeUnitBomLine(
        library,
        fastenerSystem.screwMaterialId,
        "INFASTNING",
        counts.trallFasteners,
        suppliedBy(fastenerSystem.screwMaterialId),
        "trall/regel",
      );
      if (screwLine) bomLines.push(screwLine);
    }

    const vinkelLine = makeUnitBomLine(
      library,
      "mat_beslag_vinkel",
      "INFASTNING",
      counts.vinkelbeslagCount,
      suppliedBy("mat_beslag_vinkel"),
      "regel/bärlina",
    );
    if (vinkelLine) bomLines.push(vinkelLine);

    if (counts.konstruktionsskruvCount > 0) {
      const konsLine = makeUnitBomLine(
        library,
        "mat_skruv_konstruktion",
        "INFASTNING",
        counts.konstruktionsskruvCount,
        suppliedBy("mat_skruv_konstruktion"),
        "kortling",
      );
      if (konsLine) bomLines.push(konsLine);
    }

    const plintSkruvLine = makeUnitBomLine(
      library,
      "mat_skruv_plint",
      "INFASTNING",
      counts.plintskruvCount,
      suppliedBy("mat_skruv_plint"),
      "plint/stolpe",
    );
    if (plintSkruvLine) bomLines.push(plintSkruvLine);
  }

  // Edge boards (kantbräda / sargbräda / ventilationsprofil)
  for (const run of level.edgeBoards) {
    const lengthMm = run.edgeIndices.reduce((sum, idx) => {
      const a = level.polygon.points[idx];
      const b = level.polygon.points[(idx + 1) % level.polygon.points.length];
      if (!a || !b) return sum;
      return sum + Math.hypot(b.x - a.x, b.y - a.y);
    }, 0);
    const edgeLine = makeLumberBomLine(library, run.materialId, "OVRIGT", [lengthMm], suppliedBy(run.materialId));
    if (edgeLine) {
      bomLines.push(edgeLine.line);
      cutPlans.push(edgeLine.cutPlan);
    }
  }

  // Stairs
  for (const { stair, result } of geometry.stairs) {
    const stringers = makeLumberBomLine(
      library,
      stair.regelMaterialId,
      "TRAPPA",
      Array(result.stringerCount).fill(result.stringerLengthMm),
      suppliedBy(stair.regelMaterialId),
    );
    if (stringers) {
      bomLines.push(stringers.line);
      cutPlans.push(stringers.cutPlan);
    }
    const treads = makeLumberBomLine(
      library,
      stair.trallMaterialId,
      "TRAPPA",
      Array(result.treadBoardCount).fill(stair.widthMm),
      suppliedBy(stair.trallMaterialId),
    );
    if (treads) {
      bomLines.push(treads.line);
      cutPlans.push(treads.cutPlan);
    }
    const stairScrews = makeUnitBomLine(
      library,
      "mat_skruv_konstruktion",
      "TRAPPA",
      result.screwCount,
      suppliedBy("mat_skruv_konstruktion"),
      "trappa",
    );
    if (stairScrews) bomLines.push(stairScrews);
  }

  return { geometry, bomLines, cutPlans };
}

export function summarizeLevel(level: DeckLevel) {
  return computeAreaSummary(level.polygon, level.openings);
}
