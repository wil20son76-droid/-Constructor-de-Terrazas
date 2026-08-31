/**
 * Material calculation engine: turns a DeckLevel's geometry + structural
 * configuration into a full bill of materials (BOM), grouped the way the
 * spec requests (TRALL / STOMME / PLINTAR / INFÄSTNING / TRAPPA / ÖVRIGT).
 *
 * This module only orchestrates the geometry/structural/cut-optimisation
 * primitives defined elsewhere; it does not contain UI or React code. See
 * CALCULATION_AUDIT.md for the manual derivations behind these formulas.
 */
import type {
  Beam,
  BomGroup,
  BomLine,
  CutOptimizationMode,
  CutPlanResult,
  DeckBoard,
  DeckLevel,
  DeckSection,
  Footing,
  Joist,
  MaterialLibrary,
  Post,
  ProjectMaterialOverride,
} from "../types";
import { computeAreaSummary } from "../geometry";
import { computeAllSectionsBoardLayout, computeBoardLayout, type BoardLayoutResult } from "../deck/boardLayout";
import { classifyEdges, filterEdgeBoardEligible } from "../deck/edgeClassification";
import {
  computeBarlinor,
  computeFootings,
  computePostHeight,
  computePosts,
  computeReglar,
  computeUniformSpacing,
  estimateKortlingCount,
  type UniformSpacingResult,
} from "../structural";
import { computeStair, type StairCalculationResult } from "../structural/stairs";
import { computeFastenerCounts } from "./fasteners";
import { computeCutPlan } from "./cutOptimization";
import {
  makeCostPerLengthFn,
  normalizeExklMoms,
  resolveEffectivePriceModel,
  resolveLumberPurchaseCost,
  resolveUnitPurchaseCost,
} from "../pricing/materialPricing";

const DEFAULT_CUT_OPTIMIZATION_MODE: CutOptimizationMode = "minCost";

export interface LevelGeometryResult {
  boards: DeckBoard[];
  /**
   * Legacy single-polygon board layout. When `level.sections` is empty this
   * is the real, only layout. When sections are active, `rowCount` and
   * `totalLinearMm` are the sums across all sections (still meaningful, e.g.
   * for a total-linear-metres display), but `effectiveWidthMm`/
   * `lastRowWidthMm`/`lastRowNeedsCut` don't have a single-polygon meaning
   * across independently-angled sections, so they are reported as
   * 0/0/false; use `sectionLayouts` for the real per-section breakdown.
   */
  boardLayout: BoardLayoutResult;
  /** Per-section board layout, populated only when `level.sections` is non-empty. */
  sectionLayouts?: { section: DeckSection; layout: BoardLayoutResult }[];
  joists: Joist[];
  regelCcInfo: UniformSpacingResult;
  beams: Beam[];
  barlinaSpacingInfo: UniformSpacingResult;
  footings: Footing[];
  plintSpacingInfoByBeam: UniformSpacingResult[];
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

  const hasSections = !!level.sections && level.sections.length > 0;
  let boards: DeckBoard[];
  let boardLayout: BoardLayoutResult;
  let sectionLayouts: { section: DeckSection; layout: BoardLayoutResult }[] | undefined;

  if (hasSections) {
    const { boards: sectionBoards, bySection } = computeAllSectionsBoardLayout(level.sections!);
    boards = sectionBoards;
    sectionLayouts = bySection;
    boardLayout = {
      boards: sectionBoards,
      rowCount: bySection.reduce((sum, s) => sum + s.layout.rowCount, 0),
      totalLinearMm: bySection.reduce((sum, s) => sum + s.layout.totalLinearMm, 0),
      effectiveWidthMm: 0,
      lastRowWidthMm: 0,
      lastRowNeedsCut: false,
    };
  } else {
    boardLayout = computeBoardLayout(level.polygon, level.openings, level.boardDirection, boardWidthMm, level.boardGap);
    boards = boardLayout.boards;
  }

  const { joists, ccInfo: regelCcInfo } = computeReglar(level, library);
  const { beams, spacingInfo: barlinaSpacingInfo } = computeBarlinor(level, library);
  const { footings, spacingInfoByBeam: plintSpacingInfoByBeam } = computeFootings(beams, level.plintTypeId, level.plintMaxSpacing);

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

  return {
    boards,
    boardLayout,
    sectionLayouts,
    joists,
    regelCcInfo,
    beams,
    barlinaSpacingInfo,
    footings,
    plintSpacingInfoByBeam,
    posts,
    kortlingCount,
    postHeightMm,
    stairs,
  };
}

/**
 * Group boards by their own `materialId` (set per-section by
 * `computeSectionBoardLayout`), falling back to the level's single
 * `trallMaterialId` for boards with no tag — i.e. every board in the legacy
 * (no-sections) path, which always produces exactly one group and therefore
 * the exact same single TRALL BOM line as before this feature existed.
 */
function groupTrallBoardsByMaterial(boards: DeckBoard[], fallbackMaterialId: string): Map<string, DeckBoard[]> {
  const map = new Map<string, DeckBoard[]>();
  for (const board of boards) {
    const materialId = board.materialId ?? fallbackMaterialId;
    const list = map.get(materialId);
    if (list) {
      list.push(board);
    } else {
      map.set(materialId, [board]);
    }
  }
  return map;
}

/** Everything the pricing/optimisation engines need that isn't already carried on the DeckLevel/MaterialLibrary. */
export interface PricingContext {
  vatPercent: number;
  materialOverrides: ProjectMaterialOverride[];
  cutOptimizationMode: CutOptimizationMode;
}

export function defaultPricingContext(): PricingContext {
  return { vatPercent: 25, materialOverrides: [], cutOptimizationMode: DEFAULT_CUT_OPTIMIZATION_MODE };
}

function findOverrideFor(overrides: ProjectMaterialOverride[], materialId: string): ProjectMaterialOverride | undefined {
  return overrides.find((o) => o.materialId === materialId);
}

/** A representative "per purchased unit" price for display/CSV (BomLine.pricePerUnit) — an average when per-length stock variants make the real price non-uniform, exact otherwise. */
function effectivePricePerUnit(cost: number, denominator: number, fallback: number): number {
  return denominator > 0 ? cost / denominator : fallback;
}

function makeLumberBomLine(
  library: MaterialLibrary,
  materialId: string,
  group: BomGroup,
  pieces: number[],
  suppliedByClient: boolean,
  pricing: PricingContext,
): { line: BomLine; cutPlan: CutPlanResult } | null {
  const material = findMaterial(library, materialId);
  if (!material || pieces.length === 0) return null;
  const availableLengths = material.availableLengthsMm ?? [Math.max(...pieces)];

  const override = findOverrideFor(pricing.materialOverrides, materialId);
  const priceModel = resolveEffectivePriceModel(material, override);
  const costPerLengthMm = makeCostPerLengthFn(priceModel, pricing.vatPercent);
  const cutPlan = computeCutPlan(materialId, pieces, availableLengths, { mode: pricing.cutOptimizationMode, costPerLengthMm });

  const purchase = resolveLumberPurchaseCost({
    priceModel,
    byLength: cutPlan.purchasedBreakdown,
    vatPercent: pricing.vatPercent,
    widthMm: material.widthMm,
  });

  const technicalLinearMeters = cutPlan.requiredLengthMm / 1000;
  const purchaseLinearMeters = cutPlan.totalPurchasedLengthMm / 1000;
  // Technical cost is informational only (what the design needs, not what's bought) — technical pieces
  // aren't tied to a specific purchased stock length, so this always uses the base rate, never a per-length variant.
  const baseExklPrice = normalizeExklMoms(priceModel.price, priceModel.vatMode, pricing.vatPercent);
  const technicalCost = priceModel.priceUnit === "kr/m" || priceModel.priceUnit === "kr/lm" ? technicalLinearMeters * baseExklPrice : cutPlan.piecesCount * baseExklPrice;

  const denominator =
    purchase.priceUnit === "kr/m2" ? (purchase.purchaseAreaM2 ?? 0) : purchase.priceUnit === "kr/m" || purchase.priceUnit === "kr/lm" ? purchaseLinearMeters : cutPlan.totalPurchasedCount;

  const line: BomLine = {
    materialId,
    group,
    materialName: material.nameSv,
    dimension: material.widthMm && material.thicknessMm ? `${material.widthMm}x${material.thicknessMm}` : "",
    technicalQuantity: cutPlan.piecesCount,
    technicalLinearMeters,
    unit: purchase.priceUnit === "kr/m2" ? "m2" : "st",
    pricePerUnit: effectivePricePerUnit(purchase.cost, denominator, baseExklPrice),
    technicalCost,
    wastePercent: cutPlan.wastePercent,
    purchaseQuantity: purchase.priceUnit === "kr/m2" ? Math.round((purchase.purchaseAreaM2 ?? 0) * 100) / 100 : cutPlan.totalPurchasedCount,
    purchaseLinearMeters,
    purchaseBreakdown: cutPlan.purchasedBreakdown,
    purchaseTotal: purchase.cost,
    suppliedByClient,
    priceUnit: purchase.priceUnit,
    supplier: purchase.supplier,
    priceMissing: !suppliedByClient && purchase.missing,
    priceIsOverride: !!override,
  };
  return { line, cutPlan };
}

function makeUnitBomLine(
  library: MaterialLibrary,
  materialId: string,
  group: BomGroup,
  quantity: number,
  suppliedByClient: boolean,
  pricing: PricingContext,
  reason?: string,
): BomLine | null {
  const material = findMaterial(library, materialId);
  if (!material || quantity <= 0) return null;

  const override = findOverrideFor(pricing.materialOverrides, materialId);
  const priceModel = resolveEffectivePriceModel(material, override);
  // Quantities/rounding are unchanged from before: only ceil to whole units unless the priceModel says
  // "kr/förpackning" (packages), in which case resolveUnitPurchaseCost does the ceil-to-packages itself.
  const roughPurchaseQuantity = Math.ceil(quantity);
  const purchase = resolveUnitPurchaseCost(priceModel, quantity, roughPurchaseQuantity, pricing.vatPercent);

  return {
    materialId,
    group,
    materialName: reason ? `${material.nameSv} (${reason})` : material.nameSv,
    dimension: material.widthMm && material.thicknessMm ? `${material.widthMm}x${material.thicknessMm}` : "",
    technicalQuantity: quantity,
    unit: material.unit ?? "st",
    pricePerUnit: effectivePricePerUnit(purchase.cost, purchase.purchaseQuantity, priceModel.price),
    technicalCost: quantity * effectivePricePerUnit(purchase.cost, purchase.purchaseQuantity, priceModel.price),
    wastePercent: material.wastePercent,
    purchaseQuantity: purchase.purchaseQuantity,
    purchaseTotal: purchase.cost,
    suppliedByClient,
    priceUnit: purchase.priceUnit,
    supplier: purchase.supplier,
    priceMissing: !suppliedByClient && purchase.missing,
    priceIsOverride: !!override,
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
  pricing: PricingContext = defaultPricingContext(),
): LevelBomResult {
  const geometry = computeLevelGeometry(level, library);
  const bomLines: BomLine[] = [];
  const cutPlans: CutPlanResult[] = [];
  const suppliedBy = (id: string) => clientSuppliedMaterialIds.includes(id);

  const trallGroups = groupTrallBoardsByMaterial(geometry.boards, level.trallMaterialId);
  for (const [materialId, boards] of trallGroups) {
    const trall = makeLumberBomLine(library, materialId, "TRALL", boards.map((b) => b.lengthMm), suppliedBy(materialId), pricing);
    if (trall) {
      bomLines.push(trall.line);
      cutPlans.push(trall.cutPlan);
    }
  }

  const regel = makeLumberBomLine(
    library,
    level.regelMaterialId,
    "STOMME",
    geometry.joists.map((j) => j.lengthMm),
    suppliedBy(level.regelMaterialId),
    pricing,
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
    pricing,
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
      pricing,
    );
    if (posts) {
      bomLines.push(posts.line);
      cutPlans.push(posts.cutPlan);
    }
  }

  // Plintar
  const plintType = library.plintTypes.find((p) => p.id === level.plintTypeId);
  if (plintType?.materialId) {
    const plintLine = makeUnitBomLine(library, plintType.materialId, "PLINTAR", geometry.footings.length, suppliedBy(plintType.materialId), pricing);
    if (plintLine) bomLines.push(plintLine);
  }

  // Fasteners — screw/clip count comes from REAL board/joist segment
  // intersections (see materials/fasteners.ts), which is also correct for
  // L/U-shaped decks where a row is split into multiple segments; it is
  // never a naive boards.length * joists.length * 2.
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
        pricing,
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
        pricing,
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
      pricing,
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
        pricing,
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
      pricing,
      "plint/stolpe",
    );
    if (plintSkruvLine) bomLines.push(plintSkruvLine);
  }

  // Edge boards (kantbräda / sargbräda / ventilationsprofil) — only on
  // edges classified "external" (never a wall edge, a stair edge, or an
  // edge the user explicitly marked "open"/untrimmed).
  const edgeClassification = classifyEdges(level);
  for (const run of level.edgeBoards) {
    const eligibleEdges = filterEdgeBoardEligible(run.edgeIndices, edgeClassification);
    const lengthMm = eligibleEdges.reduce((sum, idx) => {
      const a = level.polygon.points[idx];
      const b = level.polygon.points[(idx + 1) % level.polygon.points.length];
      if (!a || !b) return sum;
      return sum + Math.hypot(b.x - a.x, b.y - a.y);
    }, 0);
    if (lengthMm <= 0) continue;
    const edgeLine = makeLumberBomLine(library, run.materialId, "OVRIGT", [lengthMm], suppliedBy(run.materialId), pricing);
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
      pricing,
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
      pricing,
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
      pricing,
      "trappa",
    );
    if (stairScrews) bomLines.push(stairScrews);
  }

  return { geometry, bomLines, cutPlans };
}

export function summarizeLevel(level: DeckLevel) {
  return computeAreaSummary(level.polygon, level.openings);
}

export { computeUniformSpacing };
