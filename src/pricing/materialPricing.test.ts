/**
 * Migration (legacy flat price -> priceModel) and VAT normalisation.
 * Hand-derived expected values throughout.
 */
import { describe, expect, it } from "vitest";
import type { Material, Project } from "../types";
import {
  CURRENT_SCHEMA_VERSION,
  migrateMaterial,
  migrateProject,
  normalizeExklMoms,
  recordPriceChange,
  resolveEffectivePriceModel,
} from "./materialPricing";

function makeLegacyMaterial(overrides: Partial<Material> = {}): Material {
  return {
    id: "mat1",
    category: "regel",
    name: "Regel",
    nameSv: "Regel 45x120",
    wastePercent: 10,
    ...overrides,
  };
}

describe("migrateMaterial", () => {
  it("converts a pricePerMeter material to priceModel kr/m, exkl moms", () => {
    const m = migrateMaterial(makeLegacyMaterial({ pricePerMeter: 26 }));
    expect(m.priceModel).toEqual({ price: 26, priceUnit: "kr/m", vatMode: "exkl", active: true });
  });

  it("converts a pricePerUnit 'st' material to priceModel kr/st", () => {
    const m = migrateMaterial(makeLegacyMaterial({ category: "plint", unit: "st", pricePerUnit: 89 }));
    expect(m.priceModel).toEqual({ price: 89, priceUnit: "kr/st", vatMode: "exkl", active: true });
  });

  it("converts a 'förp' material to priceModel kr/förpackning with packageSize", () => {
    const m = migrateMaterial(makeLegacyMaterial({ category: "skruv", unit: "förp", pricePerUnit: 249, unitsPerPackage: 200 }));
    expect(m.priceModel).toEqual({ price: 249, priceUnit: "kr/förpackning", vatMode: "exkl", packageSize: 200, supplier: undefined, active: true });
  });

  it("is idempotent — a material that already has a priceModel is returned unchanged", () => {
    const withModel = makeLegacyMaterial({ priceModel: { price: 99, priceUnit: "kr/st", vatMode: "exkl", active: true } });
    expect(migrateMaterial(withModel)).toBe(withModel);
  });
});

describe("migrateProject", () => {
  function makeProject(): Project {
    return {
      id: "p1",
      name: "Test",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      settings: {
        gridSizeMm: 500,
        snapEnabled: true,
        currency: "SEK",
        vatPercent: 25,
        rotEnabled: false,
        rotPercent: 0,
        rotMaxDeduction: 0,
        rotEligibility: { materialEligible: false, labourEligible: true, machinesEligible: false, transportEligible: false },
      },
      levels: [],
      activeLevelId: "",
      library: { materials: [makeLegacyMaterial({ pricePerMeter: 26 })], suppliers: [], fastenerSystems: [], plintTypes: [] },
      labourRates: { stommeHoursPerM2: 0, trallHoursPerM2: 0, plintHoursPerUnit: 0, stairHoursPerUnit: 0, kantbradaHoursPerMeter: 0, hourlyRate: 0, workerCount: 1 },
      otherCosts: [],
      markup: { markupPercent: 20, machineCost: 0, transportCost: 0, excavationCost: 0, wasteRemovalCost: 0 },
      clientSuppliedMaterialIds: [],
      quotationInfo: { offertNumber: "", date: "", clientName: "", clientAddress: "", projectAddress: "", workDescription: "" },
    };
  }

  it("stamps schemaVersion and gives every material a priceModel, without touching an old project's other fields", () => {
    const migrated = migrateProject(makeProject());
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.materialOverrides).toEqual([]);
    expect(migrated.library.materials[0].priceModel).toEqual({ price: 26, priceUnit: "kr/m", vatMode: "exkl", active: true });
    // Nothing else about the project changed.
    expect(migrated.id).toBe("p1");
    expect(migrated.levels).toEqual([]);
  });

  it("is a no-op on an already-migrated project", () => {
    const once = migrateProject(makeProject());
    const twice = migrateProject(once);
    expect(twice).toBe(once);
  });
});

describe("normalizeExklMoms", () => {
  it("leaves an exkl.-moms price unchanged", () => {
    expect(normalizeExklMoms(100, "exkl", 25)).toBe(100);
  });

  it("converts an inkl.-moms price to exkl. at 25% moms: 125 inkl -> 100 exkl", () => {
    expect(normalizeExklMoms(125, "inkl", 25)).toBeCloseTo(100, 6);
  });

  it("converts at a different moms rate: 112 inkl at 12% -> 100 exkl", () => {
    expect(normalizeExklMoms(112, "inkl", 12)).toBeCloseTo(100, 6);
  });
});

describe("resolveEffectivePriceModel", () => {
  it("returns the material's own priceModel when there is no override", () => {
    const m = migrateMaterial(makeLegacyMaterial({ pricePerMeter: 26 }));
    expect(resolveEffectivePriceModel(m, undefined)).toEqual(m.priceModel);
  });

  it("an override's price/unit/vatMode win over the material's own priceModel", () => {
    const m = migrateMaterial(makeLegacyMaterial({ pricePerMeter: 26 }));
    const resolved = resolveEffectivePriceModel(m, { materialId: "mat1", price: 30, priceUnit: "kr/m", vatMode: "inkl", locked: true });
    expect(resolved.price).toBe(30);
    expect(resolved.vatMode).toBe("inkl");
  });
});

describe("recordPriceChange", () => {
  it("appends the OLD price to priceHistory when the price actually changes", () => {
    const model = { price: 100, priceUnit: "kr/st" as const, vatMode: "exkl" as const, active: true, lastUpdated: "2026-07-15" };
    const updated = recordPriceChange(model, 109);
    expect(updated.price).toBe(109);
    expect(updated.priceHistory).toEqual([{ date: expect.any(String), price: 100 }]);
  });

  it("does not add a history entry when the price is unchanged", () => {
    const model = { price: 100, priceUnit: "kr/st" as const, vatMode: "exkl" as const, active: true };
    const updated = recordPriceChange(model, 100);
    expect(updated.priceHistory).toBeUndefined();
  });
});
