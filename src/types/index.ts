/**
 * Core domain model for the deck (terrass) designer.
 *
 * IMPORTANT: All geometric quantities in this model are stored in
 * millimetres (mm), as integers or floats, never in screen pixels.
 * The SVG/canvas rendering layer converts mm -> px only at draw time.
 */

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** A 2D point expressed in millimetres, in world/plan coordinates. */
export interface Point {
  x: number;
  y: number;
}

/** A closed polygon describing the outer boundary of a deck area, in mm. */
export interface DeckPolygon {
  id: string;
  /** Ordered list of vertices, not repeating the first point at the end. */
  points: Point[];
}

/** A polygonal hole inside a DeckPolygon (e.g. around a tree or chimney). */
export interface DeckOpening {
  id: string;
  points: Point[];
}

export type TrallOrientation = "horizontal" | "vertical" | "diagonal45" | "custom";

/** Board direction; angleDeg is measured from the local X axis, 0-180. */
export interface BoardDirection {
  mode: TrallOrientation;
  angleDeg: number;
}

/** A single physical deck level (terraces can have several). */
export interface DeckLevel {
  id: string;
  name: string;
  /** Height of the top of decking above ground/terrain, in mm. */
  heightAboveGround: number;
  polygon: DeckPolygon;
  openings: DeckOpening[];
  boardDirection: BoardDirection;
  /** Gap between boards (trallspalt), in mm. */
  boardGap: number;
  trallMaterialId: string;
  regelMaterialId: string;
  regelSpacing: number; // CC-avstånd, mm
  joistDirectionOffsetDeg?: number; // relative to board direction, default 90
  barlinaMaterialId: string;
  barlinaMaxSpacing: number; // max span between bärlinor, mm
  barlinaCount?: number; // optional override; else auto
  plintTypeId: string;
  plintMaxSpacing: number; // mm
  postMaterialId?: string;
  fastenerSystemId: string;
  kortlingSpacing?: number; // mm, undefined = no blocking
  stairs: Stair[];
  edgeBoards: EdgeBoardRun[];
  /**
   * Polygon edge indices that sit against a house wall (no kantbräda /
   * fascia needed there — the wall itself closes off that side). Edges
   * carrying a Stair (matched by `Stair.edgeIndex`) are classified as
   * "stair" edges automatically; every other edge is "external" unless
   * listed in `openEdgeIndices`. See `deck/edgeClassification.ts`.
   */
  wallEdgeIndices: number[];
  /** Edges deliberately left without any edge board (e.g. butts against another deck/zone). */
  openEdgeIndices: number[];
}

export type EdgeType = "external" | "wall" | "stair" | "open";

/** A single computed/placed deck board (result of the layout engine). */
export interface DeckBoard {
  id: string;
  /** Centreline start/end points in mm, plan coordinates. */
  start: Point;
  end: Point;
  lengthMm: number;
  widthMm: number;
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

export type MaterialCategory =
  | "trall"
  | "regel"
  | "barlina"
  | "stolpe"
  | "plint"
  | "skruv"
  | "beslag"
  | "kantbrada"
  | "ventilationsprofil"
  | "ovrigt";

export interface Supplier {
  id: string;
  name: string;
  website?: string;
  notes?: string;
}

/** Generic priced, purchasable material/product. */
export interface Material {
  id: string;
  category: MaterialCategory;
  /** Name shown to the user; Swedish by default. */
  name: string;
  nameSv: string;
  /** Actual cross-section, e.g. "28x120" for boards, "45x95" for regel. */
  widthMm?: number;
  thicknessMm?: number;
  /** Commercially available lengths, mm (e.g. [3000, 4200, 4800, 5400]). */
  availableLengthsMm?: number[];
  pricePerMeter?: number; // SEK
  pricePerUnit?: number; // SEK, e.g. per board/post/footing/screw package
  unit?: "st" | "m" | "m2" | "förp"; // styck/meter/kvadratmeter/förpackning
  /** For "förp" units (e.g. a box of 200 screws): pieces per package. */
  unitsPerPackage?: number;
  supplierId?: string;
  sku?: string;
  wastePercent: number; // default waste allowance for this material
  /** For trall: recommended max joist CC spacing, mm. */
  recommendedRegelSpacingMm?: number;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Structural members (computed output, not input)
// ---------------------------------------------------------------------------

export interface StructuralMember {
  id: string;
  materialId: string;
  start: Point;
  end: Point;
  lengthMm: number;
  /** e.g. "45x120" — the material's cross-section, for the debug/inspect view. */
  dimension?: string;
}

export type Joist = StructuralMember; // Regel
export type Beam = StructuralMember; // Bärlina

export interface Post {
  id: string;
  materialId: string;
  position: Point;
  heightMm: number;
}

export interface Footing {
  id: string;
  typeId: string;
  position: Point;
  label: string; // P1, P2, ...
  /** The bärlina (Beam.id) this footing supports. */
  beamId: string;
}

// ---------------------------------------------------------------------------
// Stairs
// ---------------------------------------------------------------------------

export interface Stair {
  id: string;
  /** Index of the polygon edge the stair attaches to. */
  edgeIndex: number;
  widthMm: number;
  totalHeightMm: number;
  stepCount: number;
  stepDepthMm: number;
  trallMaterialId: string;
  regelMaterialId: string;
}

// ---------------------------------------------------------------------------
// Edges / fascia
// ---------------------------------------------------------------------------

export type EdgeBoardType = "sargbrada" | "kantbrada" | "ventilationsprofil";

export interface EdgeBoardRun {
  id: string;
  type: EdgeBoardType;
  materialId: string;
  edgeIndices: number[]; // which polygon edges this run covers
}

// ---------------------------------------------------------------------------
// Fasteners
// ---------------------------------------------------------------------------

export type FastenerSystemType =
  | "visible_skruv"
  | "dold_infastning"
  | "step_clip"
  | "t_clips"
  | "custom";

export interface FastenerSystem {
  id: string;
  type: FastenerSystemType;
  name: string;
  /** Screws per board/joist intersection for visible screw systems. */
  screwsPerIntersection: number;
  /** Clips per board-joist intersection for clip-based systems. */
  clipsPerIntersection?: number;
  clipMaterialId?: string;
  screwMaterialId?: string;
}

export interface Fastener {
  id: string;
  materialId: string;
  quantity: number;
  reason: string; // e.g. "Trallskruv - trall/regel", "Balkskor - regel/bärlina"
}

// ---------------------------------------------------------------------------
// Bill of materials
// ---------------------------------------------------------------------------

export type BomGroup = "TRALL" | "STOMME" | "PLINTAR" | "INFASTNING" | "TRAPPA" | "OVRIGT";

/**
 * A bill-of-materials line. Two distinct quantities are tracked and must
 * never be conflated (see CALCULATION_AUDIT.md):
 *
 *  - TECHNICAL quantity (`technicalQuantity` / `technicalLinearMeters`):
 *    what the design actually needs — e.g. 73.4 linear metres of trall.
 *    This is what the plan/drawing and the "material needed" figures show.
 *  - PURCHASE quantity (`purchaseQuantity` / `purchaseLinearMeters` /
 *    `purchaseBreakdown`): what must actually be bought given commercial
 *    stock lengths and cut optimisation — e.g. 18 boards x 4.8 m = 86.4 m.
 *    This is what cost calculations use (`purchaseTotal`).
 */
export interface BomLine {
  materialId: string;
  group: BomGroup;
  materialName: string;
  dimension: string;
  unit: string;
  /** Technical quantity: pieces/units the design needs (e.g. 25 joists, 220 screws). */
  technicalQuantity: number;
  /** Technical quantity in linear metres, for lumber items (sum of required piece lengths). */
  technicalLinearMeters?: number;
  pricePerUnit: number;
  /** Cost at the technical quantity — informational only (what the plan needs), never billed. */
  technicalCost: number;
  wastePercent: number;
  /** Purchase quantity: stock boards/packages/units actually bought (>= technical, rounded to buyable units). */
  purchaseQuantity: number;
  /** Purchase quantity in linear metres actually bought, for lumber items. */
  purchaseLinearMeters?: number;
  /** Stock purchases grouped by commercial length, for lumber items (e.g. "18 x 4.8 m"). */
  purchaseBreakdown?: PurchasedBoardGroup[];
  /** Cost at the purchase quantity — this is what is billed and feeds the cost summary. */
  purchaseTotal: number;
  suppliedByClient?: boolean;
}

/** One physical stock board purchased, and which piece-segments it was cut into. */
export interface CutBin {
  index: number;
  stockLengthMm: number;
  items: CutBinItem[];
  usedMm: number;
  offcutMm: number;
}

export interface CutBinItem {
  /** Index of the original (pre-split) required piece/row this segment belongs to. */
  sourceIndex: number;
  /** 0-based index of this segment within its source piece's segments. */
  segmentIndex: number;
  /** How many segments the source piece was split into (1 = no splice needed). */
  totalSegments: number;
  lengthMm: number;
}

export interface PurchasedBoardGroup {
  lengthMm: number;
  count: number;
}

export interface CutPlanResult {
  materialId: string;
  /** Sum of the ORIGINAL (pre-split) required piece lengths — the technical quantity, mm. */
  requiredLengthMm: number;
  availableLengthsMm: number[];
  /** Number of original pieces/rows requested (before any splicing). */
  piecesCount: number;
  /** Number of physical segments actually cut, after splicing runs longer than any single stock length. */
  segmentsCount: number;
  /** Number of original pieces that needed more than one physical segment (spliced). */
  spliceCount: number;
  bins: CutBin[];
  /** Stock purchases grouped by length, for display ("18 x 4.8 m"). */
  purchasedBreakdown: PurchasedBoardGroup[];
  totalPurchasedLengthMm: number;
  totalPurchasedCount: number;
  offcutsReusable: number;
  wasteMm: number;
  wastePercent: number;
}

// ---------------------------------------------------------------------------
// Labour
// ---------------------------------------------------------------------------

export interface LabourRates {
  stommeHoursPerM2: number;
  trallHoursPerM2: number;
  plintHoursPerUnit: number;
  stairHoursPerUnit: number;
  kantbradaHoursPerMeter: number;
  hourlyRate: number; // SEK/h
  workerCount: number;
}

export interface LabourItem {
  id: string;
  description: string;
  hours: number;
  hourlyRate: number;
  cost: number;
}

// ---------------------------------------------------------------------------
// Costs / pricing
// ---------------------------------------------------------------------------

export interface CostItem {
  id: string;
  description: string;
  amount: number;
}

export interface CostSummary {
  materialCost: number;
  labourCost: number;
  machineCost: number;
  transportCost: number;
  excavationCost: number;
  wasteRemovalCost: number;
  otherCost: number;
  subtotal: number; // internal cost, before påslag (markup)
  /**
   * Påslag (markup on cost), NOT margin: sellingPrice = cost * (1 + markupPercent / 100).
   * E.g. cost 100, markup 20% -> 120. This is mathematically different from
   * a margin ("sellingPrice such that markup/sellingPrice = X%"), which is
   * why the UI must always label this "Påslag %", never "Marginal".
   */
  markupPercent: number;
  markupAmount: number;
  priceExVat: number;
  vatPercent: number; // moms
  vatAmount: number;
  priceIncVat: number;
  rotEnabled: boolean;
  rotPercent: number;
  /** Sum of the cost categories the user has marked ROT-eligible (see RotEligibility). */
  rotEligibleAmount: number;
  rotDeductionAmount: number;
  priceAfterRot: number;
}

// ---------------------------------------------------------------------------
// Quotation / offert
// ---------------------------------------------------------------------------

export interface QuotationInfo {
  offertNumber: string;
  date: string; // ISO date
  clientName: string;
  clientAddress: string;
  projectAddress: string;
  workDescription: string;
}

export interface Quotation {
  info: QuotationInfo;
  bom: BomLine[];
  labour: LabourItem[];
  costs: CostSummary;
}

// ---------------------------------------------------------------------------
// Project (root aggregate, persisted)
// ---------------------------------------------------------------------------

/**
 * Which cost categories count toward the ROT-avdrag base. Swedish tax
 * rules change over time and are never hard-coded here — only labour is
 * eligible by default (materials, transport and machines are not, per
 * current practice), but every flag is user-configurable so the app
 * keeps working when the rules change.
 */
export interface RotEligibility {
  materialEligible: boolean;
  labourEligible: boolean;
  machinesEligible: boolean;
  transportEligible: boolean;
}

export interface ProjectSettings {
  gridSizeMm: number; // 100 | 500 | 1000
  snapEnabled: boolean;
  currency: "SEK";
  vatPercent: number;
  rotEnabled: boolean;
  rotPercent: number;
  rotMaxDeduction: number;
  rotEligibility: RotEligibility;
}

export interface MaterialLibrary {
  materials: Material[];
  suppliers: Supplier[];
  fastenerSystems: FastenerSystem[];
  plintTypes: PlintType[];
}

export interface PlintType {
  id: string;
  name: string;
  nameSv: string;
  materialId?: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  settings: ProjectSettings;
  levels: DeckLevel[];
  activeLevelId: string;
  library: MaterialLibrary;
  labourRates: LabourRates;
  otherCosts: CostItem[];
  markup: {
    /** Påslag %: sellingPrice = cost * (1 + markupPercent / 100). Not a margin. */
    markupPercent: number;
    machineCost: number;
    transportCost: number;
    excavationCost: number;
    wasteRemovalCost: number;
  };
  clientSuppliedMaterialIds: string[]; // materials marked "kund tillhandahåller"
  quotationInfo: QuotationInfo;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ValidationSeverity = "info" | "warning" | "error";

export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  message: string;
}
