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
}

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

export interface BomLine {
  materialId: string;
  group: BomGroup;
  materialName: string;
  dimension: string;
  lengthMm?: number;
  quantity: number;
  unit: string;
  linearMeters?: number;
  pricePerUnit: number;
  subtotal: number;
  wastePercent: number;
  purchaseQuantity: number; // quantity incl. waste, rounded up to purchasable units
  purchaseTotal: number;
  suppliedByClient?: boolean;
}

export interface CutPlanResult {
  materialId: string;
  requiredLengthMm: number;
  availableLengthsMm: number[];
  chosenLengthMm: number;
  fullBoardsNeeded: number;
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
  subtotal: number; // internal cost before margin
  marginPercent: number;
  marginAmount: number;
  priceExVat: number;
  vatPercent: number; // moms
  vatAmount: number;
  priceIncVat: number;
  rotEnabled: boolean;
  rotPercent: number;
  rotDeductibleLabourAmount: number;
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

export interface ProjectSettings {
  gridSizeMm: number; // 100 | 500 | 1000
  snapEnabled: boolean;
  currency: "SEK";
  vatPercent: number;
  rotEnabled: boolean;
  rotPercent: number;
  rotMaxDeduction: number;
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
  margin: {
    marginPercent: number;
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
