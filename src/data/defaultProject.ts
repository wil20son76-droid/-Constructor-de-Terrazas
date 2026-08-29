import type { DeckLevel, MaterialLibrary, Project } from "../types";
import { makeId, rectanglePolygon } from "../geometry";
import { defaultMaterials } from "./materials";
import { defaultSuppliers } from "./suppliers";
import { defaultFastenerSystems } from "./fastenerSystems";
import { defaultPlintTypes } from "./plintTypes";

export function buildDefaultLibrary(): MaterialLibrary {
  return {
    materials: defaultMaterials,
    suppliers: defaultSuppliers,
    fastenerSystems: defaultFastenerSystems,
    plintTypes: defaultPlintTypes,
  };
}

/** MVP default level: a 14 m x 7 m rectangular deck, per the spec's example. */
export function buildDefaultLevel(): DeckLevel {
  return {
    id: makeId("level"),
    name: "Nivå 1",
    heightAboveGround: 400,
    polygon: rectanglePolygon(14000, 7000),
    openings: [],
    boardDirection: { mode: "horizontal", angleDeg: 0 },
    boardGap: 5,
    trallMaterialId: "mat_trall_tryck_28x120",
    regelMaterialId: "mat_regel_45x95",
    regelSpacing: 600,
    barlinaMaterialId: "mat_barlina_45x195",
    barlinaMaxSpacing: 2000,
    plintTypeId: "plinttype_betong",
    plintMaxSpacing: 1500,
    postMaterialId: "mat_stolpe_95x95",
    fastenerSystemId: "fsys_visible",
    kortlingSpacing: 1800,
    stairs: [],
    edgeBoards: [],
  };
}

export function buildDefaultProject(name = "Ny terrass"): Project {
  const level = buildDefaultLevel();
  const now = new Date().toISOString();
  return {
    id: makeId("project"),
    name,
    createdAt: now,
    updatedAt: now,
    settings: {
      gridSizeMm: 500,
      snapEnabled: true,
      currency: "SEK",
      vatPercent: 25,
      rotEnabled: false,
      rotPercent: 50,
      rotMaxDeduction: 50000,
    },
    levels: [level],
    activeLevelId: level.id,
    library: buildDefaultLibrary(),
    labourRates: {
      stommeHoursPerM2: 0.6,
      trallHoursPerM2: 0.5,
      plintHoursPerUnit: 0.5,
      stairHoursPerUnit: 3,
      kantbradaHoursPerMeter: 0.2,
      hourlyRate: 450,
      workerCount: 2,
    },
    otherCosts: [],
    margin: {
      marginPercent: 20,
      machineCost: 0,
      transportCost: 0,
      excavationCost: 0,
      wasteRemovalCost: 0,
    },
    clientSuppliedMaterialIds: [],
    quotationInfo: {
      offertNumber: "OFF-0001",
      date: now.slice(0, 10),
      clientName: "",
      clientAddress: "",
      projectAddress: "",
      workDescription: "Nybyggnation av trätterrass",
    },
  };
}
