# Graph Viewer (Local Web)

A local browser page to **visually explore** the asset reference graph from
`index.db` — for verification ("does the graph look right?") and for
understanding dependency neighborhoods. Initiative recorded as intake #3.

## Why a neighborhood explorer (not a full-graph render)

A real project is ~23k nodes / ~13k edges (measured on `pudgy-unity`). Rendering
the whole graph is an unreadable hairball and slow. The viewer instead starts
from a chosen asset (search or pick) and renders its **dependency / dependent
neighborhood** out to N hops, with click-to-expand. This matches the actual
questions: "what does this prefab pull in?", "what references this texture?".

## Two flavors, one UI

Both consume the same shared query layer and the same viewer frontend; only the
data source differs.

```
        shared query layer (find_references, get_dependencies, trace_path,
                             find_unused_assets, search_assets, get_overview)
                 │ shared SQL query definitions
        ┌────────┴───────────────┐
        ▼                        ▼
  Node web server          sql.js (WASM, in-browser)
  (better-sqlite3)         runs the same SQL client-side
        │ HttpProvider           │ WasmProvider
        └────────► one viewer frontend ◄────────┘
                (graph render + search + expand)
```

- **Server flavor** — `node dist/web/server.js --db <index.db>` serves the viewer
  and subgraph JSON on demand at `localhost:<port>`. Scales to large indexes;
  reuses the exact query code the MCP server uses.
- **Static flavor** — a self-contained `viewer.html`: open it, choose a `.db`
  file, it runs the same SQL via WASM SQLite in-browser. No server; loads the
  whole DB (fine at project size).

## Rendering

- Graph library: Cytoscape.js (or vis-network) — pan/zoom, expand-on-click.
- Nodes colored by `asset_type`; shape/badge by `origin`
  (project / package / builtin); dangling refs shown as distinct "missing" nodes.
- Node click → expand its neighbors (one more hop) via the same query API.
- Search box → resolve an asset by path/name/guid and center the view on it.

## Relationship to the MCP server

The **shared query layer** (E02a) is built first and consumed by both the viewer
(E04) and the MCP server (E02b). No query logic is duplicated between them.

## Scope notes

- Path scoping matters: `origin=project` means "under Assets/" and includes
  vendored third-party (Plugins, TextMesh Pro, NuGet under Assets/Packages). The
  viewer's search/scope lets you focus on your own modules (e.g. `Assets/lobby.*`,
  `Assets/pengu.*`).
- The viewer is read-only over `index.db`; it never writes the index.
