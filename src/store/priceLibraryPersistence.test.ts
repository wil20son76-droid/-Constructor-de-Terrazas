/**
 * The shared material price library persists independently of any
 * project (LocalStorage today), and a project's own material copies are
 * refreshed from it unless overridden. vitest runs in a plain Node
 * environment (no jsdom/localStorage), so this file installs a minimal
 * in-memory localStorage polyfill itself rather than pulling in jsdom.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Material, Project } from "../types";

function makeMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", makeMemoryStorage());
  vi.resetModules();
});

function makeMaterial(id: string, price: number): Material {
  return {
    id,
    category: "regel",
    name: id,
    nameSv: id,
    wastePercent: 10,
    priceModel: { price, priceUnit: "kr/m", vatMode: "exkl", active: true },
  };
}

describe("loadPriceLibrary / savePriceLibrary", () => {
  it("seeds from defaultMaterials (migrated) on first run and persists it", async () => {
    const { loadPriceLibrary } = await import("./materialPriceLibrary");
    const library = loadPriceLibrary();
    expect(library.length).toBeGreaterThan(0);
    expect(library.every((m) => m.priceModel)).toBe(true);
    expect(localStorage.getItem("terrass_material_price_library")).not.toBeNull();
  });

  it("round-trips an edited price through localStorage", async () => {
    const { loadPriceLibrary, savePriceLibrary, upsertMaterial } = await import("./materialPriceLibrary");
    const library = loadPriceLibrary();
    const edited = upsertMaterial(library, { ...library[0], priceModel: { ...library[0].priceModel!, price: 12345 } });
    savePriceLibrary(edited);

    const { loadPriceLibrary: reload } = await import("./materialPriceLibrary");
    const reloaded = reload();
    expect(reloaded.find((m) => m.id === library[0].id)?.priceModel?.price).toBe(12345);
  });
});

describe("upsertMaterial / removeMaterialFromLibrary / duplicateMaterial", () => {
  it("upsert adds a new material and replaces an existing one by id", async () => {
    const { upsertMaterial } = await import("./materialPriceLibrary");
    const lib = [makeMaterial("a", 10)];
    const withNew = upsertMaterial(lib, makeMaterial("b", 20));
    expect(withNew.map((m) => m.id)).toEqual(["a", "b"]);
    const replaced = upsertMaterial(withNew, makeMaterial("a", 999));
    expect(replaced.find((m) => m.id === "a")?.priceModel?.price).toBe(999);
    expect(replaced).toHaveLength(2);
  });

  it("removeMaterialFromLibrary removes only the targeted id", async () => {
    const { removeMaterialFromLibrary } = await import("./materialPriceLibrary");
    const lib = [makeMaterial("a", 10), makeMaterial("b", 20)];
    expect(removeMaterialFromLibrary(lib, "a").map((m) => m.id)).toEqual(["b"]);
  });

  it("duplicateMaterial copies with a new id and a '(kopia)' name suffix", async () => {
    const { duplicateMaterial } = await import("./materialPriceLibrary");
    const original = makeMaterial("a", 10);
    const copy = duplicateMaterial(original, "a-copy");
    expect(copy.id).toBe("a-copy");
    expect(copy.nameSv).toBe("a (kopia)");
    expect(copy.priceModel?.price).toBe(10);
  });
});

describe("syncProjectMaterialsFromLibrary", () => {
  function makeProject(materials: Material[], overrides: Project["materialOverrides"] = []): Project {
    return {
      id: "p1",
      name: "Test",
      createdAt: "",
      updatedAt: "",
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
      library: { materials, suppliers: [], fastenerSystems: [], plintTypes: [] },
      labourRates: { stommeHoursPerM2: 0, trallHoursPerM2: 0, plintHoursPerUnit: 0, stairHoursPerUnit: 0, kantbradaHoursPerMeter: 0, hourlyRate: 0, workerCount: 1 },
      otherCosts: [],
      markup: { markupPercent: 20, machineCost: 0, transportCost: 0, excavationCost: 0, wasteRemovalCost: 0 },
      clientSuppliedMaterialIds: [],
      quotationInfo: { offertNumber: "", date: "", clientName: "", clientAddress: "", projectAddress: "", workDescription: "" },
      materialOverrides: overrides,
    };
  }

  it("refreshes a project material's price from the current library price", async () => {
    const { syncProjectMaterialsFromLibrary } = await import("./materialPriceLibrary");
    const project = makeProject([makeMaterial("a", 10)]);
    const library = [makeMaterial("a", 999)];
    const synced = syncProjectMaterialsFromLibrary(project, library);
    expect(synced.library.materials[0].priceModel?.price).toBe(999);
  });

  it("does NOT refresh a material that has an active project override (locked or not)", async () => {
    const { syncProjectMaterialsFromLibrary } = await import("./materialPriceLibrary");
    const project = makeProject([makeMaterial("a", 10)], [{ materialId: "a", price: 55, priceUnit: "kr/m", vatMode: "exkl", locked: true }]);
    const library = [makeMaterial("a", 999)];
    const synced = syncProjectMaterialsFromLibrary(project, library);
    // The project's own library.materials copy is left alone; resolveEffectivePriceModel uses the override (55) regardless.
    expect(synced.library.materials[0].priceModel?.price).toBe(10);
  });

  it("leaves a project-only custom material (not in the shared library) untouched", async () => {
    const { syncProjectMaterialsFromLibrary } = await import("./materialPriceLibrary");
    const project = makeProject([makeMaterial("custom", 42)]);
    const synced = syncProjectMaterialsFromLibrary(project, []);
    expect(synced.library.materials[0].priceModel?.price).toBe(42);
  });
});
