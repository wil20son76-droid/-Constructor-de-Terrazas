/**
 * Project state store (Zustand) with undo/redo history and LocalStorage
 * persistence. Persistence is factored behind a small interface
 * (`ProjectRepository`) so it can be swapped for a real backend later
 * without touching the store's public API.
 */
import { create } from "zustand";
import type { DeckLevel, Material, MaterialPriceModel, Project } from "../types";
import { buildDefaultProject } from "../data/defaultProject";
import { migrateProject } from "../pricing/materialPricing";
import {
  duplicateMaterial as duplicateMaterialData,
  loadPriceLibrary,
  removeMaterialFromLibrary,
  savePriceLibrary,
  syncProjectMaterialsFromLibrary,
  upsertMaterial,
} from "./materialPriceLibrary";
import { makeId } from "../geometry";

/** Migrate + sync a freshly built or loaded project against the current global price library, in one step. */
function prepareProject(project: Project, priceLibrary: Material[]): Project {
  return syncProjectMaterialsFromLibrary(migrateProject(project), priceLibrary);
}

const STORAGE_INDEX_KEY = "terrass_projects_index";
const STORAGE_PROJECT_PREFIX = "terrass_project_";
const MAX_HISTORY = 50;

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
}

function loadIndex(): ProjectSummary[] {
  try {
    const raw = localStorage.getItem(STORAGE_INDEX_KEY);
    return raw ? (JSON.parse(raw) as ProjectSummary[]) : [];
  } catch {
    return [];
  }
}

function saveIndex(index: ProjectSummary[]): void {
  localStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(index));
}

export function saveProjectToStorage(project: Project): void {
  localStorage.setItem(`${STORAGE_PROJECT_PREFIX}${project.id}`, JSON.stringify(project));
  const index = loadIndex().filter((p) => p.id !== project.id);
  index.unshift({ id: project.id, name: project.name, updatedAt: project.updatedAt });
  saveIndex(index);
}

export function loadProjectFromStorage(id: string): Project | null {
  const raw = localStorage.getItem(`${STORAGE_PROJECT_PREFIX}${id}`);
  return raw ? (JSON.parse(raw) as Project) : null;
}

export function listSavedProjects(): ProjectSummary[] {
  return loadIndex();
}

export function deleteProjectFromStorage(id: string): void {
  localStorage.removeItem(`${STORAGE_PROJECT_PREFIX}${id}`);
  saveIndex(loadIndex().filter((p) => p.id !== id));
}

export type ViewMode = "terrass" | "struktur" | "material" | "kostnad";

interface ProjectStoreState {
  project: Project;
  past: Project[];
  future: Project[];
  viewMode: ViewMode;
  selectedLevelId: string;
  /** The shared, cross-project material price library — see store/materialPriceLibrary.ts. */
  priceLibrary: Material[];

  update: (fn: (draft: Project) => Project) => void;
  updateActiveLevel: (fn: (level: DeckLevel) => DeckLevel) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  setViewMode: (mode: ViewMode) => void;
  newProject: (name?: string) => void;
  save: () => void;
  open: (id: string) => void;
  setActiveLevel: (id: string) => void;
  addLevel: () => void;
  removeLevel: (id: string) => void;

  /** Add (new id) or edit (existing id) a material in the shared library, then refresh the current project's copy unless it's overridden. */
  upsertLibraryMaterial: (material: Material) => void;
  duplicateLibraryMaterial: (materialId: string) => void;
  removeLibraryMaterial: (materialId: string) => void;
  setLibraryMaterialActive: (materialId: string, active: boolean) => void;
  /** "Endast detta projekt" (locked=false) or "Lås pris i projekt" (locked=true) — a project-local price pin that resolveEffectivePriceModel prefers over the library. */
  setProjectMaterialOverride: (materialId: string, price: Pick<MaterialPriceModel, "price" | "priceUnit" | "vatMode" | "supplier">, locked: boolean) => void;
  clearProjectMaterialOverride: (materialId: string) => void;
}

const initialPriceLibrary = loadPriceLibrary();

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  project: prepareProject(buildDefaultProject(), initialPriceLibrary),
  past: [],
  future: [],
  viewMode: "terrass",
  selectedLevelId: "",
  priceLibrary: initialPriceLibrary,

  update: (fn) =>
    set((state) => {
      const next = fn(state.project);
      const updated = { ...next, updatedAt: new Date().toISOString() };
      const past = [...state.past, state.project].slice(-MAX_HISTORY);
      return { project: updated, past, future: [] };
    }),

  updateActiveLevel: (fn) =>
    get().update((project) => ({
      ...project,
      levels: project.levels.map((lvl) => (lvl.id === project.activeLevelId ? fn(lvl) : lvl)),
    })),

  undo: () =>
    set((state) => {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      const past = state.past.slice(0, -1);
      const future = [state.project, ...state.future].slice(0, MAX_HISTORY);
      return { project: previous, past, future };
    }),

  redo: () =>
    set((state) => {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      const future = state.future.slice(1);
      const past = [...state.past, state.project].slice(-MAX_HISTORY);
      return { project: next, past, future };
    }),

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  setViewMode: (mode) => set({ viewMode: mode }),

  newProject: (name) => set({ project: prepareProject(buildDefaultProject(name), get().priceLibrary), past: [], future: [] }),

  save: () => saveProjectToStorage(get().project),

  open: (id) => {
    const loaded = loadProjectFromStorage(id);
    if (loaded) set({ project: prepareProject(loaded, get().priceLibrary), past: [], future: [] });
  },

  setActiveLevel: (id) => get().update((project) => ({ ...project, activeLevelId: id })),

  addLevel: () =>
    get().update((project) => {
      const newLevel: DeckLevel = {
        ...project.levels[0],
        id: `level_${Math.random().toString(36).slice(2, 10)}`,
        name: `Nivå ${project.levels.length + 1}`,
      };
      return { ...project, levels: [...project.levels, newLevel], activeLevelId: newLevel.id };
    }),

  removeLevel: (id) =>
    get().update((project) => {
      if (project.levels.length <= 1) return project;
      const levels = project.levels.filter((l) => l.id !== id);
      const activeLevelId = project.activeLevelId === id ? levels[0].id : project.activeLevelId;
      return { ...project, levels, activeLevelId };
    }),

  upsertLibraryMaterial: (material) => {
    const nextLibrary = upsertMaterial(get().priceLibrary, material);
    savePriceLibrary(nextLibrary);
    set({ priceLibrary: nextLibrary });
    get().update((project) => syncProjectMaterialsFromLibrary(project, nextLibrary));
  },

  duplicateLibraryMaterial: (materialId) => {
    const source = get().priceLibrary.find((m) => m.id === materialId);
    if (!source) return;
    const copy = duplicateMaterialData(source, makeId("mat"));
    const nextLibrary = upsertMaterial(get().priceLibrary, copy);
    savePriceLibrary(nextLibrary);
    set({ priceLibrary: nextLibrary });
  },

  removeLibraryMaterial: (materialId) => {
    const nextLibrary = removeMaterialFromLibrary(get().priceLibrary, materialId);
    savePriceLibrary(nextLibrary);
    set({ priceLibrary: nextLibrary });
  },

  setLibraryMaterialActive: (materialId, active) => {
    const material = get().priceLibrary.find((m) => m.id === materialId);
    if (!material?.priceModel) return;
    const updated: Material = { ...material, priceModel: { ...material.priceModel, active } };
    const nextLibrary = upsertMaterial(get().priceLibrary, updated);
    savePriceLibrary(nextLibrary);
    set({ priceLibrary: nextLibrary });
    get().update((project) => syncProjectMaterialsFromLibrary(project, nextLibrary));
  },

  setProjectMaterialOverride: (materialId, price, locked) =>
    get().update((project) => {
      const existing = project.materialOverrides ?? [];
      const override = { materialId, ...price, locked };
      const materialOverrides = existing.some((o) => o.materialId === materialId)
        ? existing.map((o) => (o.materialId === materialId ? override : o))
        : [...existing, override];
      return { ...project, materialOverrides };
    }),

  clearProjectMaterialOverride: (materialId) =>
    get().update((project) => {
      const withoutOverride = {
        ...project,
        materialOverrides: (project.materialOverrides ?? []).filter((o) => o.materialId !== materialId),
      };
      // The material's own library.materials copy was left stale while the
      // override shadowed it (see syncProjectMaterialsFromLibrary) — refresh
      // it now so the project immediately shows the current library price.
      return syncProjectMaterialsFromLibrary(withoutOverride, get().priceLibrary);
    }),
}));

export function activeLevel(project: Project): DeckLevel {
  return project.levels.find((l) => l.id === project.activeLevelId) ?? project.levels[0];
}
