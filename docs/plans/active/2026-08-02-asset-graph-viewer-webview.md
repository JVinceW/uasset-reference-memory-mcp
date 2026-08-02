# Asset Graph Viewer Webview Implementation Plan

Date: 2026-08-02

## Status

Active

## Outcome

Replace the current basic Cytoscape web viewer with a high-fidelity local asset
graph workbench based on the design handoff in
`docs/claude-webview-design/design_handoff_asset_graph_viewer/`, while keeping
both shipped viewer flavors:

- server: `unity-asset-reference-mcp-web --db <index.db>`
- static: `viewer.html` plus an in-browser picked SQLite database

The implementation should ship a usable 2D workbench first. DAG, query drawer,
and 3D mode are planned follow-up layers unless explicitly pulled into the first
release.

## Context

- Design handoff:
  `docs/claude-webview-design/design_handoff_asset_graph_viewer/README.md`
- Tech stack recommendation:
  `docs/claude-webview-design/design_handoff_asset_graph_viewer/TECH_STACK.md`
- Prototype reference only:
  `docs/claude-webview-design/design_handoff_asset_graph_viewer/Asset Graph Viewer.dc.html`
- Current web server:
  `src/web/server.ts`
- Current pure web API router:
  `src/web/api.ts`
- Current static frontend:
  `src/web/public/index.html`,
  `src/web/public/viewer.html`,
  `src/web/public/app.js`,
  `src/web/public/wasm-app.js`,
  `src/web/public/style.css`
- Shared query layer:
  `src/query/`
- SQLite schema contract:
  `docs/product/asset-graph-model.md`
- MCP/query tool contract:
  `docs/product/mcp-tools.md`
- Reindex behavior:
  `docs/product/reindexing-workflow.md`
- Packaging script:
  `scripts/copy-public.mjs`

## Scope

In scope:

- Use the handoff's `1a` workbench as the default information architecture.
- Implement `1b` selected and trace states for the 2D workbench.
- Implement first-run, no-index, indexing, broken-reference, and query-error
  states without blanking the previous graph.
- Preserve server and static viewer entry points.
- Keep all data access behind one frontend `GraphSource` contract with HTTP and
  WASM adapters.
- Surface `edges.context` in reference rows, edge hover, trace/query output, and
  CSV export.
- Add focused API parity tests and browser-level visual/interaction checks.

Out of scope for the first implementation pass:

- 3D galaxy mode as a required shipping feature.
- Full DAG mode as a required shipping feature.
- A raw unrestricted SQL MCP tool.
- Backend authentication, cloud hosting, telemetry, or external services.
- Copying prototype inline styles or prototype runtime code into production.

## Authority And Pause Points

- The SQLite schema in `docs/product/asset-graph-model.md` is the source of
  truth for node and edge fields. Do not invent viewer-only persisted fields.
- The MCP tool contract in `docs/product/mcp-tools.md` currently excludes raw
  SQL from MCP. Pause before exposing arbitrary SQL beyond the local web viewer.
- The reindex workflow is explicit and not a watcher. The web UI may trigger
  explicit reindexing only through a documented API path that preserves the
  previous good index until success.
- `Reveal in Unity` is a visible command. Pause before shipping it unless a
  concrete local protocol, command, or Unity integration point is approved.
- Shipping 3D mode requires Playwright plus canvas-pixel verification that the
  scene is nonblank and correctly framed on desktop and mobile.

## Approach

Build the new viewer in layers. First add a frontend build harness that can
coexist with the current Node build, then lock a shared data contract, then ship
the 2D workbench with real data. Leave expensive secondary surfaces, especially
3D, until the core workbench is useful and verified.

## Functional Wiring Plan

Current state on `viewer-next`: the React shell renders real overview counts,
but the visible controls are mostly static. The only live behavior is
`HttpGraphSource.getOverview()` calling `/api/overview`. Search input, layout
buttons, theme buttons, reindex, type rows, origin pills, canvas placeholder,
inspector rows, attention cards, and query bar do not yet mutate state or call
APIs.

Wire the UI in this order:

1. **State foundation**
   - Add `src/web/viewer/state/viewerStore.ts` with:
     `theme`, `engine`, `filters`, `selectedGuid`, `hoverGuid`, `trace`,
     `search`, `query`, and `indexing`.
   - Connect top-bar segmented controls and sidebar filter controls to this
     store before adding graph rendering.
   - Acceptance: clicking `LIGHT`, `DARK`, `AUTO`, `2D`, `3D`, `DAG`, type
     rows, and origin pills visibly changes selected state without a page
     reload.

2. **Shared source contract**
   - Extend `src/web/viewer/data/GraphSource.ts` beyond `getOverview()`:
     `searchAssets`, `resolveAsset`, `getNeighborhood`, `getEdges`,
     `getUnused`, and `tracePath`.
   - Align `src/web/viewer/data/apiTypes.ts` with the actual API response
     fields: `byType`, `byOrigin`, `topReferenced`, `brokenRefGuids`, not
     `typeCounts` / `originCounts`.
   - Acceptance: a focused unit test can mock a `GraphSource` and drive the
     store/actions without a browser.

3. **Low-risk clickable controls**
   - Make type rows toggle filters.
   - Make origin pills toggle filters.
   - Make attention cards run `/api/unused` or filter unresolved references
     once the backend route exists.
   - Make top referenced rows selectable once overview hotspots are rendered.
   - Keep `Reindex` disabled or explicit "not wired yet" until a server route
     exists; do not imply live indexing progress from the current API.
   - Acceptance: every button either performs a real state/API action or is
     visibly disabled with no silent no-op.

4. **Search to selection**
   - Convert the top search input into a command/search palette backed by
     `/api/search`.
   - Debounce input by 120 ms.
   - Selecting a result sets `selectedGuid`, loads detail, and pushes history.
   - Acceptance: searching `Button.cs` or a GUID prefix in the Cricket index
     shows matching rows; Enter selects one and updates the inspector.

5. **Graph data before graph rendering**
   - Use existing `/api/neighborhood` as the first graph data source so the
     canvas becomes interactive quickly.
   - Add a later `/api/graph` endpoint for node-budget-ranked project overview
     only after the search/selection path works.
   - Acceptance: selecting a search result renders a neighborhood graph around
     that asset with clickable nodes.

6. **Canvas interaction**
   - Add graphology plus Sigma in `src/web/viewer/graph/SigmaGraphCanvas.tsx`.
   - Node click sets selection, node double-click expands one hop, hover updates
     highlight state, and fit controls manipulate the Sigma camera.
   - Selection, hover, trace, and theme updates must not rerun layout.
   - Acceptance: clicking a graph node updates the inspector; double-clicking
     adds neighbors; theme changes keep node positions stable.

7. **Inspector and edge context**
   - Load selected asset detail using `/api/resolve`, `/api/edges?to=...`, and
     `/api/edges?from=...`.
   - Reference rows must show `refKind`, `context`, `fileId`, and count.
   - Row click selects the referenced asset and updates history.
   - Acceptance: selecting a material/shader/script shows inbound/outbound rows
     with YAML context; row click navigates to that asset.

8. **Trace mode**
   - Use existing `/api/neighborhood?dir=refs|deps&depth=5` for inbound and
     outbound root traces.
   - Reserve existing `/api/trace?from=...&to=...` for two-node shortest path.
   - Dim off-path nodes through Sigma reducers; never remove nodes just to show
     trace state.
   - Acceptance: clicking "referenced by" on a selected asset highlights the
     inbound closure and shows blast-radius counts.

9. **Server/static parity**
   - Do not wire browser-only behavior directly to `fetch` except through
     `GraphSource`.
   - Add `WasmGraphSource` only after `GraphSource` covers the first
     interactive workflow.
   - Acceptance: every added API route has `src/web/api.test.ts` coverage and
     `src/web/wasm-parity.test.ts` coverage before it becomes a static viewer
     requirement.

## File Structure

Expected created or modified files:

```text
package.json
package-lock.json
scripts/copy-public.mjs
src/web/api.ts
src/web/api.test.ts
src/web/wasm-parity.test.ts
src/web/public/viewer.html
src/web/server.ts
src/web/viewer/
  index.html
  main.tsx
  App.tsx
  styles/tokens.css
  styles/layout.css
  data/GraphSource.ts
  data/HttpGraphSource.ts
  data/WasmGraphSource.ts
  data/apiTypes.ts
  state/viewerStore.ts
  graph/buildGraph.ts
  graph/layoutWorker.ts
  graph/SigmaGraphCanvas.tsx
  graph/graphStyles.ts
  components/TopBar.tsx
  components/Sidebar.tsx
  components/Inspector.tsx
  components/SearchPalette.tsx
  components/QueryBar.tsx
  components/LoadingStates.tsx
  components/ContextMenu.tsx
  utils/format.ts
tests/web/
  viewer-source.test.ts
  graph-build.test.ts
  trace-state.test.ts
  viewer.spec.ts
```

Responsibilities:

- `src/web/api.ts`: stable JSON API used by the server and the static WASM
  adapter.
- `src/web/viewer/data/*`: frontend-only adapter contract and implementations.
- `src/web/viewer/state/viewerStore.ts`: view, filters, selection, trace,
  search, query, and indexing state.
- `src/web/viewer/graph/*`: graphology/Sigma graph construction, reducers,
  layout worker, color/shape rules, and canvas interaction glue.
- `src/web/viewer/components/*`: dense workbench chrome matching the handoff.
- `tests/web/*`: focused unit and browser validation for the new viewer.

## Risks And Recovery

- Risk: Vite output breaks the existing package layout. Mitigation: keep
  `dist/web/server.js` from `tsc` and emit/copy static assets under
  `dist/web/public/`. Recovery: revert the Vite/package/script commit.
- Risk: server and static viewer behavior diverge. Mitigation: keep `handleApi`
  pure and extend the existing WASM parity test for every new read route.
- Risk: graph rendering becomes slow on real projects. Mitigation: use
  graphology plus Sigma for 2D, enforce node budget, and keep hit testing inside
  the renderer rather than React node components.
- Risk: selection or trace destroys spatial memory. Mitigation: reducers dim or
  highlight existing graph attributes; selection, hover, theme, and trace must
  not run layout again.
- Risk: query drawer implies unsupported product policy. Mitigation: ship
  curated graph-query presets or local-only SQL only after a documented decision.
- Risk: reindex progress cannot be represented exactly from the current indexer.
  Mitigation: ship explicit pending/running/succeeded/failed states first, then
  add granular progress only if the indexer exposes events.
- Recovery: each phase should be a small commit. The current viewer can be kept
  under a temporary legacy route or restored by reverting the frontend build and
  public asset commits.

## Progress

- [x] Phase 0: Verify current readiness and lock implementation decisions.
- [x] Phase 1: Add the frontend build harness without changing behavior.
- [ ] Phase 2: Extend and test the shared web API contract.
- [ ] Phase 3: Implement design tokens, shell, and loading states.
- [ ] Phase 4: Implement the real 2D graph workbench.
- [ ] Phase 5: Implement selection, inspector, and reference-site details.
- [ ] Phase 6: Implement trace mode and search palette.
- [ ] Phase 7: Implement query drawer as an approved local viewer feature.
- [ ] Phase 8: Add responsive states and browser visual validation.
- [ ] Phase 9: Update docs, package proof, and complete this plan.

## Detailed Steps

### Phase 0: Verify Readiness And Decisions

- [x] Run `git status --short` and preserve unrelated user changes.
- [x] Confirm the handoff files are present:
  `README.md`, `TECH_STACK.md`, `Asset Graph Viewer.dc.html`, and `support.js`.
- [x] Confirm `npm run typecheck` and `npm test` pass before implementation.
- [x] Record decisions for first shipment:
  2D workbench required, trace required, search required, query drawer optional
  until product policy is settled, DAG optional, 3D optional.
- [x] Decide whether the old Cytoscape viewer remains available temporarily as
  `/legacy.html` during migration.

### Phase 1: Add The Frontend Build Harness

- [x] Add dependencies consistent with the handoff:
  `vite`, `@vitejs/plugin-react`, `react`, `react-dom`, `@types/react`,
  `@types/react-dom`, `zustand`, `@tanstack/react-query`,
  `@tanstack/react-table`, `@tanstack/react-virtual`, `graphology`, `sigma`,
  `graphology-layout-forceatlas2`, `lucide-react`,
  `@fontsource/ibm-plex-sans`, and `@fontsource/ibm-plex-mono`.
- [x] Add Playwright only when the first browser validation spec is introduced.
- [x] Add `src/web/viewer/index.html` and `src/web/viewer/main.tsx`.
- [x] Change build scripts so `npm run build` runs TypeScript and Vite, then
  copies required static compatibility files and WASM assets into
  `dist/web/public/`.
- [x] Preserve `unity-asset-reference-mcp-web` as the server bin.
- [x] Validate with `npm run typecheck` and `npm run build`.

### Phase 2: Extend The Shared Web API Contract

- [ ] Add API types for assets, edges, overview, search results, subgraphs,
  traces, unused assets, and index status.
- [ ] Extend `/api/overview` or add `/api/index-status` so the UI can render
  project root, schema version, indexed time, asset count, edge count,
  unresolved count, and package metadata where available.
- [ ] Add a graph-data endpoint for the initial node budget:
  filters by types, origins, path prefix, hide-builtin, and node budget ranked
  by degree.
- [ ] Add an asset-detail endpoint that returns the resolved asset plus inbound
  and outbound edge rows, preserving `ref_kind`, `context`, `file_id`, and
  `count`.
- [ ] Add root trace endpoints for inbound and outbound traversal. Do not
  replace the existing shortest-path `trace_path(from, to)` behavior unless
  product docs are updated.
- [ ] Keep every route backed by `QueryDb` so both better-sqlite3 and sql.js can
  execute it.
- [ ] Extend `src/web/api.test.ts` and `src/web/wasm-parity.test.ts` for each
  new route.

### Phase 3: Implement Tokens, Shell, And Loading States

- [ ] Add `tokens.css` with dark, light, and system theme variables matching the
  handoff values.
- [ ] Self-host IBM Plex Sans and IBM Plex Mono through `@fontsource`.
- [ ] Build the full-bleed workbench shell:
  top bar, 248px sidebar, flexible canvas, 320px inspector, and 36px query bar.
- [ ] Use Lucide icons for actions and controls instead of prototype glyphs.
- [ ] Implement no-index, indexing, broken-reference, and query-error states.
- [ ] Ensure the old graph remains visible while a reindex request is running or
  fails.
- [ ] Validate dark and light shell screenshots at 1440x900, 1180px, and 900px
  breakpoints.

### Phase 4: Implement The Real 2D Graph Workbench

- [ ] Build a graphology graph from API results with typed node and edge
  attributes.
- [ ] Use Sigma for the main canvas and a second read-only Sigma instance for
  the minimap.
- [ ] Implement node color by asset type hue, size by degree, and square shapes
  for Scene and Prefab.
- [ ] Implement edge color from source node hue and width from `edges.count`.
- [ ] Run ForceAtlas2 in a worker until settled, then stop.
- [ ] Persist positions per project/index fingerprint if the implementation can
  do so without adding a backend.
- [ ] Implement node budget from 50 to 5000, ranked by degree.
- [ ] Implement type toggles, origin filters, `hide builtin`, and `collapse
  folders`. Folder aggregation can be simplified in the first pass only if the
  UI labels the behavior honestly.
- [ ] Verify graph canvas is nonblank and stable after selection/theme/filter
  updates.

### Phase 5: Implement Selection And Inspector

- [ ] Click node to select and pan the camera to center it without relayout.
- [ ] Add selection history with back and forward navigation.
- [ ] Render asset detail: type, name, path, GUID, origin, size, in/out counts,
  and modified time.
- [ ] Render `Referenced by`, `Depends on`, and `Source` tabs.
- [ ] Show reference rows with asset name, path, `ref_kind`, `context`,
  `file_id`, and count.
- [ ] Add copy GUID and copy path actions.
- [ ] Keep `Reveal in Unity` disabled or hidden until an approved integration
  exists.
- [ ] Add a source snippet only if the API can return real local YAML context;
  otherwise show the known edge context and leave source extraction for a later
  documented task.

### Phase 6: Implement Trace Mode And Search

- [ ] Add inbound and outbound trace mode from a selected root with default
  depth 5 and a node cap.
- [ ] Dim off-path nodes and edges through Sigma reducers; do not remove them.
- [ ] Keep graph positions unchanged while entering or exiting trace mode.
- [ ] Render blast-radius counts by hop and asset type.
- [ ] Implement command/search palette with 120ms debounce.
- [ ] Search by name, path, and GUID prefix, grouped by asset type.
- [ ] Support keyboard actions for focus, trace upstream, isolate closure, and
  escape close.
- [ ] Add focused tests for trace state and search result normalization.

### Phase 7: Implement Query Drawer

- [ ] Before implementation, record a decision for local viewer query policy:
  curated graph queries, local SQL, or both.
- [ ] Add CodeMirror 6 only when the drawer is actively implemented.
- [ ] Implement collapsed and expanded drawer states with row count and elapsed
  milliseconds.
- [ ] Preserve previous result rows on query errors and show inline error text.
- [ ] Virtualize table rows with TanStack Virtual.
- [ ] Add CSV export for the current result set.
- [ ] Keep any raw SQL local to the viewer and do not expose it as an MCP tool
  without a separate product decision.

### Phase 8: Responsive And Browser Validation

- [ ] Add Playwright tests for first-run, default workbench, selected asset,
  trace mode, search palette, query drawer, and broken-reference state.
- [ ] Capture dark and light screenshots at 1440x900.
- [ ] Validate inspector overlay below 1180px.
- [ ] Validate sidebar collapse or rail behavior below 900px.
- [ ] Check that the canvas remains at least 560px wide.
- [ ] Run canvas-pixel checks so graph renders are nonblank.
- [ ] Run `npm run typecheck`, `npm test`, and `npm run build`.

### Phase 9: Docs, Package Proof, And Plan Completion

- [ ] Update README web-viewer instructions if commands or static file paths
  change.
- [ ] Update product docs if new API behavior, query policy, or reindex behavior
  becomes externally observable.
- [ ] Run `npm pack --dry-run` and confirm the expected web assets are included.
- [ ] Record validation results in this plan.
- [ ] Move this plan to `docs/plans/completed/` only after the implementation is
  validated.

## Decisions

- 2026-08-02: Disable the Superpowers plugin at repository scope through
  `.codex/config.toml`; keep planning under the repo-native Harness plan
  directory.
- 2026-08-02: Treat design handoff `1a` plus `1b` as first-release scope.
- 2026-08-02: Keep server and static viewer flavors as hard requirements.
- 2026-08-02: Use the existing SQLite schema and shared query layer as the data
  authority.
- 2026-08-02: Defer 3D mode unless core 2D workbench behavior is already
  validated.
- 2026-08-02: Keep the current Cytoscape viewer as the default shipped web
  entry during the first build-harness slice; emit the new React workbench to
  `dist/web/public/viewer-next/` until graph parity is ready.

## Validation

- Focused proof:
  - API route unit tests in `src/web/api.test.ts`.
  - better-sqlite3/sql.js parity tests in `src/web/wasm-parity.test.ts`.
  - frontend state and graph construction tests under `tests/web/`.
  - Playwright screenshots and interaction tests for the key webview states.
- Repository-required checks:
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
  - `npm pack --dry-run`
  - `git diff --check`

## Result

2026-08-02 implementation start:

- Created branch/worktree `feature/asset-graph-viewer-webview` at
  `.worktrees/asset-graph-viewer-webview`.
- Baseline validation before implementation: `npm run typecheck` passed and
  `npm test` passed with 39 test files and 298 tests.
- Phase 1 added the Vite/React browser build harness, design-token shell,
  initial HTTP `GraphSource`, and self-hosted IBM Plex font imports.
- Phase 1 validation: `npm run typecheck` passed; `npm run build` passed and
  emitted the new viewer to `dist/web/public/viewer-next/`.

2026-08-03 functional wiring slice:

- Extended the viewer `GraphSource` contract and HTTP adapter for overview,
  search, resolve, neighborhood, edges, and unused-asset routes already exposed
  by `src/web/api.ts`.
- Added `viewerStore` state for theme, layout mode, filters, selection history,
  search, node budget, and hover target.
- Wired visible controls so theme/layout buttons, type rows, origin pills,
  search results, hotspot rows, attention cards, edge rows, graph nodes, and
  history buttons perform a real state or API action.
- Kept `Reindex` visibly disabled because there is no server-side reindex API
  route yet.
- Added a deterministic SVG neighborhood renderer as the first clickable graph
  surface. Sigma/graphology remains open for the full Phase 4 implementation.
- Added focused viewer-store tests.
- Validation: `npm run typecheck` passed; `npm test` passed with 40 test files
  and 302 tests; `npm run build` passed and emitted `viewer-next`.
- Browser smoke test against
  `http://localhost:7777/viewer-next/index.html` using the Cricket slot-4
  index passed: controls changed selected state, search for `prefab` selected
  `P_CricketCommonUI.prefab`, the graph rendered nodes/edges, an edge row
  navigated to `00_BootstrapScene.unity`, history back returned to the prefab,
  and there were no app-origin console errors.

2026-08-03 API contract and graph wiring slice:

- Broadened `searchAssets` so the existing `name` filter searches asset name,
  path, and GUID prefix.
- Added read-only viewer query helpers for stored index status, selected asset
  detail, budgeted graph data, and root trace closures.
- Added `/api/index-status`, `/api/asset-detail`, `/api/graph`, and
  `/api/root-trace` to the pure `handleApi` router used by both server and
  static WASM paths.
- Extended API and WASM parity tests for the new routes.
- Wired `viewer-next` to use real index status metadata, a real node budget,
  budgeted graph data before selection, asset-detail after selection, and
  inbound/outbound root trace direction controls.
- Validation: `npm run typecheck` passed; `npm test` passed with 40 test files
  and 308 tests; `npm run build` passed and emitted `viewer-next`.
- Browser smoke test against
  `http://localhost:7777/viewer-next/index.html` using the Cricket slot-4
  index passed: schema status showed `schema 3`, node budget `50` rendered 50
  graph nodes with 31,926 total candidates, GUID-prefix search selected
  `P_CricketCommonUI.prefab`, `REFS` trace rendered, edge metadata was visible,
  and there were no app-origin console errors.

Complete after the full implementation and validation.
