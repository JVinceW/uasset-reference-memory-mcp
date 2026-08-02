import { AlertTriangle, ChevronLeft, ChevronRight, Copy, Database, Moon, RefreshCw, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import type { CSSProperties, JSX } from "react";
import type { AssetNode, AssetType, CyEdge, CyNode, EdgeDetail, Origin, Overview } from "./data/apiTypes";
import { HttpGraphSource } from "./data/HttpGraphSource";
import { ASSET_TYPES, ORIGINS, useViewerStore, type Engine, type Theme } from "./state/viewerStore";
import { fmtBytes, fmtNumber, shortGuid } from "./utils/format";

const source = new HttpGraphSource();
const HUES: Record<AssetType, number> = {
  Scene: 250,
  Prefab: 195,
  Material: 300,
  Texture: 80,
  Script: 145,
  Shader: 340,
  AnimationClip: 160,
  AnimatorController: 175,
  ScriptableObject: 265,
  Sprite: 20,
  AudioClip: 40,
  Font: 110,
  Model: 220,
  Folder: 0,
  Other: 0,
};

export function App(): JSX.Element {
  const engine = useViewerStore((state) => state.engine);
  const setEngine = useViewerStore((state) => state.setEngine);
  const theme = useViewerStore((state) => state.theme);
  const setTheme = useViewerStore((state) => state.setTheme);
  const typeFilters = useViewerStore((state) => state.typeFilters);
  const toggleType = useViewerStore((state) => state.toggleType);
  const originFilters = useViewerStore((state) => state.originFilters);
  const toggleOrigin = useViewerStore((state) => state.toggleOrigin);
  const selectedRef = useViewerStore((state) => state.selectedRef);
  const selectRef = useViewerStore((state) => state.selectRef);
  const searchTerm = useViewerStore((state) => state.searchTerm);
  const setSearchTerm = useViewerStore((state) => state.setSearchTerm);
  const searchOpen = useViewerStore((state) => state.searchOpen);
  const setSearchOpen = useViewerStore((state) => state.setSearchOpen);
  const goHistory = useViewerStore((state) => state.goHistory);
  const historyIndex = useViewerStore((state) => state.historyIndex);
  const history = useViewerStore((state) => state.history);
  const activeOrigins = useMemo(
    () => ORIGINS.filter((origin) => originFilters[origin]),
    [originFilters],
  );

  useEffect(() => {
    const html = document.documentElement;
    if (theme === "system") {
      html.dataset.theme = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
      return;
    }
    html.dataset.theme = theme;
  }, [theme]);

  const overview = useQuery({
    queryKey: ["overview"],
    queryFn: () => source.getOverview(),
    retry: false,
  });
  const selected = useQuery({
    queryKey: ["resolve", selectedRef],
    queryFn: () => source.resolveAsset(selectedRef!),
    enabled: selectedRef !== null,
    retry: false,
  });
  const neighborhood = useQuery({
    queryKey: ["neighborhood", selectedRef, activeOrigins.join(",")],
    queryFn: () => source.getNeighborhood(selectedRef!, "deps", 1),
    enabled: selectedRef !== null,
    retry: false,
  });
  const inboundEdges = useQuery({
    queryKey: ["edges", "in", selectedRef],
    queryFn: () => source.getEdges({ to: selectedRef!, limit: 100 }),
    enabled: selectedRef !== null,
    retry: false,
  });
  const outboundEdges = useQuery({
    queryKey: ["edges", "out", selectedRef],
    queryFn: () => source.getEdges({ from: selectedRef!, limit: 100 }),
    enabled: selectedRef !== null,
    retry: false,
  });
  const search = useQuery({
    queryKey: ["search", searchTerm],
    queryFn: () => source.searchAssets({ name: searchTerm, limit: 20 }),
    enabled: searchTerm.trim().length >= 2,
    retry: false,
  });
  const unused = useQuery({
    queryKey: ["unused"],
    queryFn: () => source.getUnused({ addressableRoots: "auto" }),
    enabled: false,
    retry: false,
  });

  const totals = overview.data;
  const typeRows = ASSET_TYPES.filter((type) => (totals?.byType[type] ?? 0) > 0 || typeFilters[type]);

  return (
    <div className="viewer-shell">
      <header className="top-bar">
        <div className="brand">
          <span className="brand-mark" />
          <span>assetgraph</span>
        </div>
        <div className="project-chip">
          <Database size={14} />
          <span>local index</span>
          <span className="muted">/</span>
          <span className="muted">{overview.isError ? "no index" : "schema v3"}</span>
          <span className={overview.isError ? "status-dot status-warn" : "status-dot"} />
        </div>
        <label className="search-box">
          <Search size={14} />
          <input
            placeholder="Search assets, GUIDs, paths..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            onFocus={() => setSearchOpen(searchTerm.length > 0)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setSearchOpen(false);
              if (event.key === "Enter" && search.data?.[0]) selectRef(search.data[0].guid);
            }}
          />
          <kbd>Ctrl K</kbd>
          {searchOpen && (
            <SearchPalette
              loading={search.isFetching}
              results={search.data ?? []}
              term={searchTerm}
              onSelect={selectRef}
            />
          )}
        </label>
        <div className="segmented" aria-label="layout mode">
          <SegmentButton label="2D" selected={engine === "2d"} onClick={() => setEngine("2d")} />
          <SegmentButton label="3D" selected={engine === "3d"} onClick={() => setEngine("3d")} />
          <SegmentButton label="DAG" selected={engine === "dag"} onClick={() => setEngine("dag")} />
        </div>
        <div className="segmented" aria-label="theme">
          <SegmentButton label="LIGHT" selected={theme === "light"} onClick={() => setTheme("light")} />
          <SegmentButton
            label="DARK"
            selected={theme === "dark"}
            icon={<Moon size={13} />}
            onClick={() => setTheme("dark")}
          />
          <SegmentButton label="AUTO" selected={theme === "system"} onClick={() => setTheme("system")} />
        </div>
        <button className="primary-action" disabled title="Reindex needs a server-side route before it can run here.">
          <RefreshCw size={14} />
          Reindex
        </button>
      </header>

      <div className="workbench">
        <aside className="sidebar">
          <section>
            <h2>Index</h2>
            <div className="stat-grid">
              <Stat value={fmtNumber(totals?.totalAssets)} label="assets" />
              <Stat value={fmtNumber(totals?.edgeCount)} label="edges" />
              <Stat value={fmtNumber(totals?.unresolvedCount)} label="broken refs" tone="danger" />
              <Stat value={unused.data ? fmtNumber(unused.data.length) : "-"} label="unused" tone="warning" />
            </div>
            <p className="fine-print">
              {overview.isLoading
                ? "loading index metadata"
                : overview.isError
                  ? "open an index.db or start the server with --db"
                  : "ready for graph workbench wiring"}
            </p>
          </section>
          <section>
            <h2>Asset Types</h2>
            {typeRows.map((type) => (
              <TypeRow
                key={type}
                name={type}
                count={fmtNumber(totals?.byType[type])}
                hue={String(HUES[type])}
                active={typeFilters[type]}
                onClick={() => toggleType(type)}
              />
            ))}
          </section>
          <section>
            <h2>Origin</h2>
            <div className="pill-row">
              {ORIGINS.map((origin) => (
                <button
                  className={`pill ${originFilters[origin] ? "active" : ""}`}
                  key={origin}
                  onClick={() => toggleOrigin(origin)}
                >
                  {origin} <code>{fmtNumber(totals?.byOrigin[origin])}</code>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <main className="canvas-pane">
          <div className="canvas-chip-row">
            <span>scope: Assets/</span>
            <span>mode: {engine.toUpperCase()}</span>
            <span>{fmtNumber(neighborhood.data?.nodes.length ?? totals?.totalAssets)} shown</span>
          </div>
          <NeighborhoodCanvas
            activeOrigins={originFilters}
            activeTypes={typeFilters}
            engine={engine}
            graph={neighborhood.data}
            loading={neighborhood.isFetching}
            selectedGuid={selected.data?.guid ?? null}
            onSelect={selectRef}
          />
        </main>

        <aside className="inspector">
          {selected.data ? (
            <SelectionPanel
              asset={selected.data}
              inbound={inboundEdges.data ?? []}
              loadingEdges={inboundEdges.isFetching || outboundEdges.isFetching}
              onCopy={(text) => void navigator.clipboard?.writeText(text)}
              onSelect={selectRef}
              outbound={outboundEdges.data ?? []}
              canGoBack={historyIndex > 0}
              canGoForward={historyIndex < history.length - 1}
              onBack={() => goHistory(-1)}
              onForward={() => goHistory(1)}
            />
          ) : (
            <OverviewPanel overview={totals} onSelect={selectRef} />
          )}
          <section>
            <h2>Needs Attention</h2>
            <button className="attention-card danger" onClick={() => void unused.refetch()}>
              <AlertTriangle size={15} />
              <div>
                <strong>{fmtNumber(totals?.unresolvedCount)} broken references</strong>
                <span>Missing GUID targets from unresolved_refs.</span>
              </div>
            </button>
            <button className="attention-card warning" onClick={() => void unused.refetch()}>
              <AlertTriangle size={15} />
              <div>
                <strong>{unused.isFetching ? "Finding unused..." : `${fmtNumber(unused.data?.length)} unused candidates`}</strong>
                <span>Addressables-aware; verify vs. code loads.</span>
              </div>
            </button>
          </section>
        </aside>
      </div>

      <footer className="query-bar">
        <span>QUERY</span>
        <code>get_overview()</code>
        <span className="muted">query drawer planned after API policy decision</span>
      </footer>
    </div>
  );
}

function SegmentButton(props: {
  icon?: JSX.Element;
  label: string;
  selected: boolean;
  onClick(): void;
}): JSX.Element {
  return (
    <button className={props.selected ? "selected" : ""} onClick={props.onClick} type="button">
      {props.icon}
      {props.label}
    </button>
  );
}

function Stat(props: { value: string; label: string; tone?: "danger" | "warning" }): JSX.Element {
  return (
    <div className="stat-card">
      <strong className={props.tone}>{props.value}</strong>
      <span>{props.label}</span>
    </div>
  );
}

function TypeRow(props: {
  active: boolean;
  count: string;
  hue: string;
  name: string;
  onClick(): void;
}): JSX.Element {
  return (
    <button
      className={`type-row ${props.active ? "active" : ""}`}
      onClick={props.onClick}
      style={{ "--type-hue": props.hue } as CSSProperties}
      type="button"
    >
      <span className="type-dot" />
      <span>{props.name}</span>
      <code>{props.count}</code>
      <span className="type-bar" />
    </button>
  );
}

function SearchPalette(props: {
  loading: boolean;
  onSelect(ref: string): void;
  results: AssetNode[];
  term: string;
}): JSX.Element {
  return (
    <div className="search-palette">
      <div className="palette-title">{props.loading ? "Searching" : `${fmtNumber(props.results.length)} matches`}</div>
      {props.term.trim().length < 2 ? (
        <div className="palette-empty">Type at least two characters.</div>
      ) : props.results.length === 0 && !props.loading ? (
        <div className="palette-empty">No matches.</div>
      ) : (
        props.results.map((asset) => (
          <button className="palette-row" key={asset.guid} onMouseDown={() => props.onSelect(asset.guid)} type="button">
            <span className="type-dot" style={{ "--type-hue": HUES[asset.assetType] } as CSSProperties} />
            <span>
              <strong>{asset.name}</strong>
              <small>{asset.path}</small>
            </span>
            <code>{asset.assetType}</code>
          </button>
        ))
      )}
    </div>
  );
}

function OverviewPanel(props: {
  overview: Overview | undefined;
  onSelect(ref: string): void;
}): JSX.Element {
  return (
    <>
      <section>
        <h2>No Selection</h2>
        <p>Click a node to inspect it, or start from a hotspot below.</p>
      </section>
      <section>
        <h2>Hotspots</h2>
        <div className="hotspot-list">
          {(props.overview?.topReferenced ?? []).slice(0, 8).map((asset) => (
            <button className="hotspot-row" key={asset.path} onClick={() => props.onSelect(asset.path)} type="button">
              <span>
                <strong>{asset.name}</strong>
                <small>{asset.path}</small>
              </span>
              <code>{fmtNumber(asset.refCount)}</code>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function SelectionPanel(props: {
  asset: AssetNode;
  inbound: EdgeDetail[];
  outbound: EdgeDetail[];
  loadingEdges: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack(): void;
  onForward(): void;
  onCopy(text: string): void;
  onSelect(ref: string): void;
}): JSX.Element {
  return (
    <>
      <section className="selection-header">
        <div className="selection-nav">
          <button disabled={!props.canGoBack} onClick={props.onBack} title="Back" type="button">
            <ChevronLeft size={15} />
          </button>
          <button disabled={!props.canGoForward} onClick={props.onForward} title="Forward" type="button">
            <ChevronRight size={15} />
          </button>
        </div>
        <div className="type-kicker" style={{ "--type-hue": HUES[props.asset.assetType] } as CSSProperties}>
          <span className="type-dot" />
          {props.asset.assetType}
        </div>
        <h3>{props.asset.name}</h3>
        <p>{props.asset.path}</p>
        <button className="guid-chip" onClick={() => props.onCopy(props.asset.guid)} type="button">
          {shortGuid(props.asset.guid)}
          <Copy size={12} />
        </button>
        <div className="meta-grid">
          <Meta label="Origin" value={props.asset.origin} />
          <Meta label="Size" value={fmtBytes(props.asset.fileSize)} />
          <Meta label="In / Out" value={`${fmtNumber(props.inbound.length)} / ${fmtNumber(props.outbound.length)}`} />
          <Meta label="Modified" value={props.asset.mtime ? new Date(props.asset.mtime).toLocaleDateString() : "-"} />
        </div>
      </section>
      <section>
        <h2>Referenced By {props.loadingEdges ? "" : props.inbound.length}</h2>
        <EdgeList edges={props.inbound} empty="No inbound references." mode="in" onSelect={props.onSelect} />
      </section>
      <section>
        <h2>Depends On {props.loadingEdges ? "" : props.outbound.length}</h2>
        <EdgeList edges={props.outbound} empty="No outgoing dependencies." mode="out" onSelect={props.onSelect} />
      </section>
    </>
  );
}

function Meta(props: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function EdgeList(props: {
  edges: EdgeDetail[];
  empty: string;
  mode: "in" | "out";
  onSelect(ref: string): void;
}): JSX.Element {
  if (props.edges.length === 0) return <p className="empty-copy">{props.empty}</p>;
  return (
    <div className="edge-list">
      {props.edges.slice(0, 24).map((edge) => {
        const path = props.mode === "in" ? edge.from : edge.to;
        const name = path.slice(path.lastIndexOf("/") + 1);
        return (
          <button
            className="edge-row"
            key={`${edge.from}-${edge.to}-${edge.refKind}-${edge.context ?? ""}`}
            onClick={() => props.onSelect(path)}
            type="button"
          >
            <strong>{name}</strong>
            <small>{path}</small>
            <span>
              <code>{edge.refKind}</code>
              <code>{edge.context ?? "context -"}</code>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function NeighborhoodCanvas(props: {
  activeOrigins: Record<Origin, boolean>;
  activeTypes: Record<AssetType, boolean>;
  engine: Engine;
  graph: { nodes: CyNode[]; edges: CyEdge[]; rootId: string } | undefined;
  loading: boolean;
  selectedGuid: string | null;
  onSelect(ref: string): void;
}): JSX.Element {
  const layout = useMemo(() => buildLayout(props.graph, props.activeTypes, props.activeOrigins), [
    props.activeOrigins,
    props.activeTypes,
    props.graph,
  ]);

  if (!props.graph && props.loading) {
    return <div className="graph-empty">Loading graph...</div>;
  }

  if (!props.graph) {
    return <div className="graph-empty">Search or choose a hotspot to draw a neighborhood.</div>;
  }

  return (
    <svg aria-label={`${props.engine} asset graph`} className="graph-svg" role="img" viewBox="0 0 1000 650">
      {layout.edges.map((edge) => {
        const from = layout.nodesById.get(edge.data.source);
        const to = layout.nodesById.get(edge.data.target);
        if (!from || !to) return null;
        return (
          <line
            className="graph-edge"
            key={edge.data.id}
            x1={from.x}
            x2={to.x}
            y1={from.y}
            y2={to.y}
            style={{ "--edge-hue": HUES[from.type] } as CSSProperties}
          />
        );
      })}
      {layout.nodes.map((node) => {
        const selected = node.id === props.selectedGuid;
        const size = node.id === props.graph?.rootId ? 18 : 11;
        const common = {
          className: `graph-node-hit ${selected ? "selected" : ""}`,
          onClick: () => props.onSelect(node.id),
          onDoubleClick: () => props.onSelect(node.id),
        };
        return (
          <g key={node.id}>
            {node.type === "Scene" || node.type === "Prefab" ? (
              <rect
                {...common}
                height={size * 2}
                rx={node.type === "Scene" ? 3 : 2}
                style={{ "--type-hue": HUES[node.type] } as CSSProperties}
                width={size * 2}
                x={node.x - size}
                y={node.y - size}
              />
            ) : (
              <circle
                {...common}
                cx={node.x}
                cy={node.y}
                r={size}
                style={{ "--type-hue": HUES[node.type] } as CSSProperties}
              />
            )}
            <text className="graph-label" x={node.x + size + 7} y={node.y + 4}>
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

interface LayoutNode {
  id: string;
  label: string;
  type: AssetType;
  x: number;
  y: number;
}

function buildLayout(
  graph: { nodes: CyNode[]; edges: CyEdge[]; rootId: string } | undefined,
  activeTypes: Record<AssetType, boolean>,
  activeOrigins: Record<Origin, boolean>,
): { edges: CyEdge[]; nodes: LayoutNode[]; nodesById: Map<string, LayoutNode> } {
  if (!graph) return { edges: [], nodes: [], nodesById: new Map() };

  const visible = graph.nodes.filter((node) => activeTypes[node.data.type] && activeOrigins[node.data.origin]);
  const root = visible.find((node) => node.data.id === graph.rootId);
  const rest = visible.filter((node) => node.data.id !== graph.rootId).slice(0, 64);
  const center = { x: 500, y: 325 };
  const radius = 215;
  const nodes: LayoutNode[] = [];

  if (root) {
    nodes.push({
      id: root.data.id,
      label: root.data.label,
      type: root.data.type,
      x: center.x,
      y: center.y,
    });
  }

  rest.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, rest.length);
    nodes.push({
      id: node.data.id,
      label: node.data.label,
      type: node.data.type,
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    });
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => nodeIds.has(edge.data.source) && nodeIds.has(edge.data.target));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  return { edges, nodes, nodesById };
}
