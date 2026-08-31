/**
 * The manual material price library: the user's own prices, persisted
 * independently of any single project (LocalStorage today — see the
 * module doc in pricing/materialPricing.ts) so they never have to
 * re-enter a price when starting a new project. A project's own
 * `library.materials` is a per-project COPY that `syncProjectMaterialsFromLibrary`
 * refreshes from here — except for a material pinned via
 * `ProjectMaterialOverride.locked`, which keeps its frozen price
 * regardless of later library edits (see resolveEffectivePriceModel).
 */
import type { Material, Project, ProjectMaterialOverride } from "../types";
import { defaultMaterials } from "../data/materials";
import { migrateMaterial } from "../pricing/materialPricing";

const STORAGE_KEY = "terrass_material_price_library";

export function loadPriceLibrary(): Material[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return (JSON.parse(raw) as Material[]).map(migrateMaterial);
  } catch {
    // fall through to the seeded default below
  }
  const seeded = defaultMaterials.map(migrateMaterial);
  savePriceLibrary(seeded);
  return seeded;
}

export function savePriceLibrary(materials: Material[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(materials));
}

/** Insert, or replace by id. */
export function upsertMaterial(library: Material[], material: Material): Material[] {
  const idx = library.findIndex((m) => m.id === material.id);
  if (idx === -1) return [...library, material];
  return library.map((m, i) => (i === idx ? material : m));
}

export function removeMaterialFromLibrary(library: Material[], materialId: string): Material[] {
  return library.filter((m) => m.id !== materialId);
}

export function duplicateMaterial(material: Material, newId: string): Material {
  return { ...material, id: newId, name: `${material.name} (kopia)`, nameSv: `${material.nameSv} (kopia)` };
}

/**
 * Refresh every material a project references from the CURRENT global
 * library (by id), except one with an active `ProjectMaterialOverride`
 * (locked or not — an unlocked override is still a deliberate per-project
 * tweak that a background sync must not silently discard). A material the
 * project has that the library no longer lists (removed, or a one-off
 * custom material never added to the shared library) is left as-is.
 */
export function syncProjectMaterialsFromLibrary(project: Project, priceLibrary: Material[]): Project {
  const overriddenIds = new Set((project.materialOverrides ?? []).map((o) => o.materialId));
  const libraryById = new Map(priceLibrary.map((m) => [m.id, m]));
  const materials = project.library.materials.map((m) => {
    if (overriddenIds.has(m.id)) return m;
    const fresh = libraryById.get(m.id);
    return fresh ?? m;
  });
  return { ...project, library: { ...project.library, materials } };
}

export function findOverride(project: Project, materialId: string): ProjectMaterialOverride | undefined {
  return project.materialOverrides?.find((o) => o.materialId === materialId);
}
