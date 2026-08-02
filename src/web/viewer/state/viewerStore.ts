import { create } from "zustand";
import type { AssetType, Origin } from "../data/apiTypes";

export type Engine = "2d" | "3d" | "dag";
export type Theme = "light" | "dark" | "system";
export type TraceDir = "deps" | "refs";

export const ASSET_TYPES: AssetType[] = [
  "Scene",
  "Prefab",
  "Material",
  "Texture",
  "Script",
  "Shader",
  "AnimationClip",
  "AnimatorController",
  "ScriptableObject",
  "Sprite",
  "AudioClip",
  "Font",
  "Model",
  "Folder",
  "Other",
];

export const ORIGINS: Origin[] = ["project", "package", "builtin"];

const activeTypes = Object.fromEntries(ASSET_TYPES.map((type) => [type, true])) as Record<AssetType, boolean>;
const activeOrigins = Object.fromEntries(ORIGINS.map((origin) => [origin, true])) as Record<Origin, boolean>;

export interface ViewerState {
  engine: Engine;
  theme: Theme;
  typeFilters: Record<AssetType, boolean>;
  originFilters: Record<Origin, boolean>;
  nodeBudget: number;
  traceDir: TraceDir;
  selectedRef: string | null;
  hoverGuid: string | null;
  searchTerm: string;
  searchOpen: boolean;
  history: string[];
  historyIndex: number;
  setEngine(engine: Engine): void;
  setTheme(theme: Theme): void;
  toggleType(type: AssetType): void;
  toggleOrigin(origin: Origin): void;
  setNodeBudget(nodeBudget: number): void;
  setTraceDir(traceDir: TraceDir): void;
  setHoverGuid(guid: string | null): void;
  setSearchTerm(term: string): void;
  setSearchOpen(open: boolean): void;
  selectRef(ref: string): void;
  goHistory(delta: -1 | 1): void;
}

export const useViewerStore = create<ViewerState>((set, get) => ({
  engine: "2d",
  theme: "dark",
  typeFilters: activeTypes,
  originFilters: activeOrigins,
  nodeBudget: 320,
  traceDir: "deps",
  selectedRef: null,
  hoverGuid: null,
  searchTerm: "",
  searchOpen: false,
  history: [],
  historyIndex: -1,
  setEngine: (engine) => set({ engine }),
  setTheme: (theme) => set({ theme }),
  toggleType: (type) =>
    set((state) => ({
      typeFilters: { ...state.typeFilters, [type]: !state.typeFilters[type] },
    })),
  toggleOrigin: (origin) =>
    set((state) => ({
      originFilters: { ...state.originFilters, [origin]: !state.originFilters[origin] },
    })),
  setNodeBudget: (nodeBudget) =>
    set({ nodeBudget: Number.isFinite(nodeBudget) ? Math.max(50, Math.min(5000, Math.trunc(nodeBudget))) : 320 }),
  setTraceDir: (traceDir) => set({ traceDir }),
  setHoverGuid: (hoverGuid) => set({ hoverGuid }),
  setSearchTerm: (searchTerm) => set({ searchTerm, searchOpen: searchTerm.trim().length > 0 }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  selectRef: (ref) => {
    const state = get();
    const trimmed = ref.trim();
    if (!trimmed) return;
    if (state.selectedRef === trimmed) {
      set({ searchOpen: false, searchTerm: "" });
      return;
    }

    const prefix = state.history.slice(0, state.historyIndex + 1);
    set({
      selectedRef: trimmed,
      history: [...prefix, trimmed],
      historyIndex: prefix.length,
      searchOpen: false,
      searchTerm: "",
    });
  },
  goHistory: (delta) => {
    const state = get();
    const next = state.historyIndex + delta;
    if (next < 0 || next >= state.history.length) return;
    set({ historyIndex: next, selectedRef: state.history[next] ?? null });
  },
}));
