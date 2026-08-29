/**
 * Project state store (Zustand) with undo/redo history and LocalStorage
 * persistence. Persistence is factored behind a small interface
 * (`ProjectRepository`) so it can be swapped for a real backend later
 * without touching the store's public API.
 */
import { create } from "zustand";
import type { DeckLevel, Project } from "../types";
import { buildDefaultProject } from "../data/defaultProject";

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
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  project: buildDefaultProject(),
  past: [],
  future: [],
  viewMode: "terrass",
  selectedLevelId: "",

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

  newProject: (name) => set({ project: buildDefaultProject(name), past: [], future: [] }),

  save: () => saveProjectToStorage(get().project),

  open: (id) => {
    const loaded = loadProjectFromStorage(id);
    if (loaded) set({ project: loaded, past: [], future: [] });
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
}));

export function activeLevel(project: Project): DeckLevel {
  return project.levels.find((l) => l.id === project.activeLevelId) ?? project.levels[0];
}
