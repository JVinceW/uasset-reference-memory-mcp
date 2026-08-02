import { beforeEach, describe, expect, test } from "vitest";
import { ASSET_TYPES, ORIGINS, useViewerStore } from "./viewerStore";
import type { AssetType, Origin } from "../data/apiTypes";

function allEnabled<T extends string>(values: readonly T[]): Record<T, boolean> {
  return Object.fromEntries(values.map((value) => [value, true])) as Record<T, boolean>;
}

function resetStore(): void {
  useViewerStore.setState({
    engine: "2d",
    theme: "dark",
    typeFilters: allEnabled<AssetType>(ASSET_TYPES),
    originFilters: allEnabled<Origin>(ORIGINS),
    nodeBudget: 320,
    traceDir: "deps",
    selectedRef: null,
    hoverGuid: null,
    searchTerm: "",
    searchOpen: false,
    history: [],
    historyIndex: -1,
  });
}

describe("viewerStore", () => {
  beforeEach(() => resetStore());

  test("toggles type and origin filters independently", () => {
    useViewerStore.getState().toggleType("Prefab");
    useViewerStore.getState().toggleOrigin("package");

    const state = useViewerStore.getState();
    expect(state.typeFilters.Prefab).toBe(false);
    expect(state.typeFilters.Scene).toBe(true);
    expect(state.originFilters.package).toBe(false);
    expect(state.originFilters.project).toBe(true);
  });

  test("selectRef records back and forward history", () => {
    const store = useViewerStore.getState();

    store.selectRef("Assets/A.prefab");
    useViewerStore.getState().selectRef("Assets/B.mat");
    useViewerStore.getState().goHistory(-1);

    expect(useViewerStore.getState()).toMatchObject({
      selectedRef: "Assets/A.prefab",
      history: ["Assets/A.prefab", "Assets/B.mat"],
      historyIndex: 0,
    });

    useViewerStore.getState().goHistory(1);
    expect(useViewerStore.getState().selectedRef).toBe("Assets/B.mat");
  });

  test("new selection after history rewind truncates forward history", () => {
    useViewerStore.getState().selectRef("Assets/A.prefab");
    useViewerStore.getState().selectRef("Assets/B.mat");
    useViewerStore.getState().goHistory(-1);
    useViewerStore.getState().selectRef("Assets/C.png");

    expect(useViewerStore.getState()).toMatchObject({
      selectedRef: "Assets/C.png",
      history: ["Assets/A.prefab", "Assets/C.png"],
      historyIndex: 1,
    });
  });

  test("search term opens and clears with selection", () => {
    useViewerStore.getState().setSearchTerm("mat");
    expect(useViewerStore.getState().searchOpen).toBe(true);

    useViewerStore.getState().selectRef("Assets/B.mat");
    expect(useViewerStore.getState()).toMatchObject({
      searchTerm: "",
      searchOpen: false,
    });
  });

  test("node budget is clamped for viewer requests", () => {
    useViewerStore.getState().setNodeBudget(12);
    expect(useViewerStore.getState().nodeBudget).toBe(50);

    useViewerStore.getState().setNodeBudget(9999);
    expect(useViewerStore.getState().nodeBudget).toBe(5000);
  });
});
