import { AlertTriangle, Database, GitBranch, Moon, RefreshCw, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { CSSProperties, JSX } from "react";
import { HttpGraphSource } from "./data/HttpGraphSource";

const source = new HttpGraphSource();

export function App(): JSX.Element {
  const overview = useQuery({
    queryKey: ["overview"],
    queryFn: () => source.getOverview(),
    retry: false,
  });

  const totals = overview.data;

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
          <input placeholder="Search assets, GUIDs, paths..." />
          <kbd>Ctrl K</kbd>
        </label>
        <div className="segmented" aria-label="layout mode">
          <button className="selected">2D</button>
          <button>3D</button>
          <button>DAG</button>
        </div>
        <div className="segmented" aria-label="theme">
          <button>LIGHT</button>
          <button className="selected">
            <Moon size={13} />
            DARK
          </button>
          <button>AUTO</button>
        </div>
        <button className="primary-action">
          <RefreshCw size={14} />
          Reindex
        </button>
      </header>

      <div className="workbench">
        <aside className="sidebar">
          <section>
            <h2>Index</h2>
            <div className="stat-grid">
              <Stat value={fmt(totals?.totalAssets)} label="assets" />
              <Stat value={fmt(totals?.edgeCount)} label="edges" />
              <Stat value={fmt(totals?.unresolvedCount)} label="broken refs" tone="danger" />
              <Stat value="-" label="unused" tone="warning" />
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
            <TypeRow name="Scene" count="-" hue="250" />
            <TypeRow name="Prefab" count="-" hue="195" />
            <TypeRow name="Material" count="-" hue="300" />
            <TypeRow name="Texture" count="-" hue="80" />
            <TypeRow name="Script" count="-" hue="145" />
          </section>
          <section>
            <h2>Origin</h2>
            <div className="pill-row">
              <button className="pill active">project</button>
              <button className="pill active">package</button>
              <button className="pill">builtin</button>
            </div>
          </section>
        </aside>

        <main className="canvas-pane">
          <div className="canvas-chip-row">
            <span>scope: Assets/</span>
            <span>depth inf</span>
            <span>{fmt(totals?.totalAssets)} indexed</span>
          </div>
          <div className="graph-placeholder">
            <GitBranch size={28} />
            <div>
              <strong>2D graph workbench scaffold</strong>
              <span>Next slice wires graphology, Sigma, filters, and stable layout.</span>
            </div>
          </div>
        </main>

        <aside className="inspector">
          <section>
            <h2>No Selection</h2>
            <p>Click a node to inspect it, or start from a hotspot below.</p>
          </section>
          <section>
            <h2>Needs Attention</h2>
            <div className="attention-card danger">
              <AlertTriangle size={15} />
              <div>
                <strong>{fmt(totals?.unresolvedCount)} broken references</strong>
                <span>Missing GUID targets from unresolved_refs.</span>
              </div>
            </div>
            <div className="attention-card warning">
              <AlertTriangle size={15} />
              <div>
                <strong>Unused candidates pending</strong>
                <span>Addressables-aware; verify vs. code loads.</span>
              </div>
            </div>
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

function Stat(props: { value: string; label: string; tone?: "danger" | "warning" }): JSX.Element {
  return (
    <div className="stat-card">
      <strong className={props.tone}>{props.value}</strong>
      <span>{props.label}</span>
    </div>
  );
}

function TypeRow(props: { name: string; count: string; hue: string }): JSX.Element {
  return (
    <div className="type-row" style={{ "--type-hue": props.hue } as CSSProperties}>
      <span className="type-dot" />
      <span>{props.name}</span>
      <code>{props.count}</code>
      <span className="type-bar" />
    </div>
  );
}

function fmt(value: number | undefined): string {
  return value === undefined ? "-" : new Intl.NumberFormat("en-US").format(value);
}
