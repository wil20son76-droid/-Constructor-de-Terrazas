import type { Material } from "../types";

/**
 * Seed material library. All prices are indicative starting points —
 * every field is editable by the user in the Material library screen.
 * `widthMm` = horizontal cross-section, `thicknessMm` = installed
 * (vertical) height, matching how the structural engine consumes them.
 */

const trall: Material[] = [
  {
    id: "mat_trall_tryck_28x120",
    category: "trall",
    name: "Pressure-treated decking 28x120",
    nameSv: "Tryckimpregnerad trall 28x120 mm",
    widthMm: 120,
    thicknessMm: 28,
    availableLengthsMm: [3300, 3600, 4200, 4800, 5400],
    pricePerMeter: 32,
    unit: "m",
    supplierId: "sup_beijer",
    sku: "TI-28120",
    wastePercent: 10,
    recommendedRegelSpacingMm: 600,
  },
  {
    id: "mat_trall_tryck_28x95",
    category: "trall",
    name: "Pressure-treated decking 28x95",
    nameSv: "Tryckimpregnerad trall 28x95 mm",
    widthMm: 95,
    thicknessMm: 28,
    availableLengthsMm: [3300, 3600, 4200, 4800, 5400],
    pricePerMeter: 26,
    unit: "m",
    supplierId: "sup_beijer",
    sku: "TI-2895",
    wastePercent: 10,
    recommendedRegelSpacingMm: 600,
  },
  {
    id: "mat_trall_kebony_character_28x120",
    category: "trall",
    name: "Kebony Character 28x120",
    nameSv: "Kebony Character 28x120 mm",
    widthMm: 120,
    thicknessMm: 28,
    availableLengthsMm: [3600, 4800, 5400],
    pricePerMeter: 95,
    unit: "m",
    supplierId: "sup_kebony",
    sku: "KEB-CHAR-28120",
    wastePercent: 8,
    recommendedRegelSpacingMm: 600,
  },
  {
    id: "mat_trall_kebony_clear_28x120",
    category: "trall",
    name: "Kebony Clear 28x120",
    nameSv: "Kebony Clear 28x120 mm",
    widthMm: 120,
    thicknessMm: 28,
    availableLengthsMm: [3600, 4800, 5400],
    pricePerMeter: 125,
    unit: "m",
    supplierId: "sup_kebony",
    sku: "KEB-CLEAR-28120",
    wastePercent: 8,
    recommendedRegelSpacingMm: 600,
  },
  {
    id: "mat_trall_komposit_25x140",
    category: "trall",
    name: "Composite decking 25x140",
    nameSv: "Komposittrall 25x140 mm",
    widthMm: 140,
    thicknessMm: 25,
    availableLengthsMm: [3600, 4800],
    pricePerMeter: 110,
    unit: "m",
    supplierId: "sup_byggmax",
    sku: "KOMP-25140",
    wastePercent: 8,
    recommendedRegelSpacingMm: 300,
  },
];

interface DimSpec {
  dim: string;
  price: number;
  widthMm: number;
  thicknessMm: number;
  name?: string;
}

function buildDimSpecs(dims: string[], prices: number[]): DimSpec[] {
  return dims.map((dim, i) => {
    const [w, t] = dim.split("x").map(Number);
    return { dim, price: prices[i], widthMm: w, thicknessMm: t };
  });
}

const regel: Material[] = buildDimSpecs(
  ["45x95", "45x120", "45x145", "45x170", "45x195", "45x220"],
  [20, 26, 32, 38, 44, 50],
).map(({ dim, price, widthMm, thicknessMm }) => ({
  id: `mat_regel_${dim}`,
  category: "regel",
  name: `Joist ${dim}`,
  nameSv: `Regel ${dim} mm`,
  widthMm,
  thicknessMm,
  availableLengthsMm: [3000, 3600, 4200, 4800, 5400, 6000],
  pricePerMeter: price,
  unit: "m",
  supplierId: "sup_optimera",
  sku: `REG-${dim}`,
  wastePercent: 10,
}));

const barlinaSpecs: DimSpec[] = [
  { dim: "45x145", price: 32, widthMm: 45, thicknessMm: 145, name: "Bärlina 45x145 mm" },
  { dim: "45x170", price: 38, widthMm: 45, thicknessMm: 170, name: "Bärlina 45x170 mm" },
  { dim: "45x195", price: 44, widthMm: 45, thicknessMm: 195, name: "Bärlina 45x195 mm" },
  { dim: "45x220", price: 50, widthMm: 45, thicknessMm: 220, name: "Bärlina 45x220 mm" },
  { dim: "dobbel-45x170", price: 76, widthMm: 90, thicknessMm: 170, name: "Dubbel bärlina 2x45x170 mm" },
  { dim: "dobbel-45x195", price: 88, widthMm: 90, thicknessMm: 195, name: "Dubbel bärlina 2x45x195 mm" },
];

const barlina: Material[] = barlinaSpecs.map(({ dim, price, widthMm, thicknessMm, name }) => ({
  id: `mat_barlina_${dim}`,
  category: "barlina",
  name: name as string,
  nameSv: name as string,
  widthMm,
  thicknessMm,
  availableLengthsMm: [3600, 4200, 4800, 5400, 6000],
  pricePerMeter: price,
  unit: "m",
  supplierId: "sup_optimera",
  sku: `BAR-${dim}`,
  wastePercent: 10,
}));

const stolpar: Material[] = [
  {
    id: "mat_stolpe_95x95",
    category: "stolpe",
    name: "Post 95x95",
    nameSv: "Stolpe 95x95 mm",
    widthMm: 95,
    thicknessMm: 95,
    availableLengthsMm: [2400, 3000, 3600, 4200],
    pricePerMeter: 65,
    unit: "m",
    supplierId: "sup_optimera",
    sku: "STO-9595",
    wastePercent: 5,
  },
  {
    id: "mat_stolpe_120x120",
    category: "stolpe",
    name: "Post 120x120",
    nameSv: "Stolpe 120x120 mm",
    widthMm: 120,
    thicknessMm: 120,
    availableLengthsMm: [2400, 3000, 3600, 4200],
    pricePerMeter: 95,
    unit: "m",
    supplierId: "sup_optimera",
    sku: "STO-120120",
    wastePercent: 5,
  },
];

const plint: Material[] = [
  {
    id: "mat_plint_betong",
    category: "plint",
    name: "Concrete footing block",
    nameSv: "Betongplint",
    pricePerUnit: 89,
    unit: "st",
    supplierId: "sup_bauhaus",
    sku: "PLI-BETONG",
    wastePercent: 0,
  },
  {
    id: "mat_plint_markskruv",
    category: "plint",
    name: "Ground screw",
    nameSv: "Markskruv",
    pricePerUnit: 349,
    unit: "st",
    supplierId: "sup_krauta",
    sku: "PLI-MARKSKRUV",
    wastePercent: 0,
  },
  {
    id: "mat_plint_betongplatta",
    category: "plint",
    name: "Footing on concrete slab",
    nameSv: "Plint på betongplatta",
    pricePerUnit: 59,
    unit: "st",
    supplierId: "sup_bauhaus",
    sku: "PLI-PLATTA",
    wastePercent: 0,
  },
  {
    id: "mat_plint_justerbar",
    category: "plint",
    name: "Adjustable deck foot",
    nameSv: "Justerbar terrassfot",
    pricePerUnit: 149,
    unit: "st",
    supplierId: "sup_hornbach",
    sku: "PLI-JUSTERBAR",
    wastePercent: 0,
  },
];

const skruvOchBeslag: Material[] = [
  {
    id: "mat_skruv_trallskruv",
    category: "skruv",
    name: "Decking screw 4.2x50",
    nameSv: "Trallskruv 4,2x50 mm",
    pricePerUnit: 249,
    unit: "förp",
    unitsPerPackage: 200,
    supplierId: "sup_beijer",
    sku: "SKR-TRALL-4250",
    wastePercent: 5,
  },
  {
    id: "mat_skruv_konstruktion",
    category: "skruv",
    name: "Construction screw 5x90",
    nameSv: "Konstruktionsskruv 5x90 mm",
    pricePerUnit: 329,
    unit: "förp",
    unitsPerPackage: 100,
    supplierId: "sup_beijer",
    sku: "SKR-KONS-590",
    wastePercent: 5,
  },
  {
    id: "mat_beslag_vinkel",
    category: "beslag",
    name: "Angle bracket",
    nameSv: "Vinkelbeslag 45x45x35 mm",
    pricePerUnit: 8.5,
    unit: "st",
    supplierId: "sup_beijer",
    sku: "BES-VINKEL",
    wastePercent: 0,
  },
  {
    id: "mat_beslag_balksko",
    category: "beslag",
    name: "Joist hanger",
    nameSv: "Balksko",
    pricePerUnit: 22,
    unit: "st",
    supplierId: "sup_beijer",
    sku: "BES-BALKSKO",
    wastePercent: 0,
  },
  {
    id: "mat_skruv_plint",
    category: "skruv",
    name: "Footing screw set",
    nameSv: "Plintskruv/infästningssats",
    pricePerUnit: 12,
    unit: "st",
    supplierId: "sup_beijer",
    sku: "SKR-PLINT",
    wastePercent: 0,
  },
  {
    id: "mat_beslag_stepclip",
    category: "beslag",
    name: "Step-Clip fastener",
    nameSv: "Step-Clip",
    pricePerUnit: 3.9,
    unit: "st",
    supplierId: "sup_kebony",
    sku: "BES-STEPCLIP",
    wastePercent: 5,
  },
  {
    id: "mat_beslag_tclip",
    category: "beslag",
    name: "T-Clip fastener",
    nameSv: "T-clips",
    pricePerUnit: 3.2,
    unit: "st",
    supplierId: "sup_kebony",
    sku: "BES-TCLIP",
    wastePercent: 5,
  },
];

const kantOchVentilation: Material[] = [
  {
    id: "mat_kant_sargbrada",
    category: "kantbrada",
    name: "Fascia board",
    nameSv: "Sargbräda 22x120 mm",
    widthMm: 120,
    thicknessMm: 22,
    availableLengthsMm: [3600, 4200, 4800],
    pricePerMeter: 45,
    unit: "m",
    supplierId: "sup_beijer",
    sku: "KANT-SARG",
    wastePercent: 10,
  },
  {
    id: "mat_kant_kantbrada",
    category: "kantbrada",
    name: "Edge board",
    nameSv: "Kantbräda 22x95 mm",
    widthMm: 95,
    thicknessMm: 22,
    availableLengthsMm: [3600, 4200, 4800],
    pricePerMeter: 38,
    unit: "m",
    supplierId: "sup_beijer",
    sku: "KANT-KANT",
    wastePercent: 10,
  },
  {
    id: "mat_vent_kebony",
    category: "ventilationsprofil",
    name: "Kebony ventilation profile",
    nameSv: "Kebony ventilationsprofil",
    widthMm: 120,
    thicknessMm: 20,
    availableLengthsMm: [3600, 4800],
    pricePerMeter: 55,
    unit: "m",
    supplierId: "sup_kebony",
    sku: "VENT-KEBONY",
    wastePercent: 8,
  },
];

const ovrigt: Material[] = [
  {
    id: "mat_ovrigt_markduk",
    category: "ovrigt",
    name: "Ground cover fabric",
    nameSv: "Markduk",
    pricePerUnit: 399,
    unit: "förp",
    unitsPerPackage: 1,
    supplierId: "sup_bauhaus",
    sku: "OVR-MARKDUK",
    wastePercent: 5,
    notes: "10 m x 1,1 m rulle",
  },
];

export const defaultMaterials: Material[] = [
  ...trall,
  ...regel,
  ...barlina,
  ...stolpar,
  ...plint,
  ...skruvOchBeslag,
  ...kantOchVentilation,
  ...ovrigt,
];
