# Recommended Tech Stack

Written for `JVinceW/uasset-reference-memory-mcp` — a TypeScript monorepo whose viewer already ships in
two flavors (a Node server over `index.db`, and a static page running WASM SQLite in-browser). The stack
below keeps both flavors and adds nothing that needs a build server, a backend service, or a key.

## Constraints this stack must respect

1. **Two runtimes, one query layer.** Server flavor (`unity-asset-reference-mcp-web --db …`) and static
   flavor (`viewer.html` + a picked `.db`) must share query code. Everything below is client-side, so
   the static flavor stays fully functional.
2. **No new native deps.** `better-sqlite3` already costs a native build on install; don't add another.
3. **Ships inside an npm package.** Output must be a small set of static files copied to `dist/web/`.
4. **Graphs are big.** 4 800 nodes is a small project; 50 000+ is realistic. Canvas/WebGL only — SVG and
   DOM nodes will not survive it. (The prototype uses DOM nodes purely because it's a mockup.)

## Core

| Concern | Recommendation | Why |
|---|---|---|
| Language | **TypeScript**, strict | Matches the repo. |
| Build | **Vite** | Fast, zero-config static output into `dist/web/`; the static flavor is just the built folder. |
| UI | **React 18** | Largest ecosystem for the graph libs below; the chrome is panel-heavy, which React handles well. Preact via alias is fine if bundle size matters. |
| State | **Zustand** | The state shape in the README is a handful of flat slices with cross-cutting reads (trace + filters + selection). Redux is overkill; context would re-render the canvas. |
| Async/query cache | **TanStack Query** | Dedupes and caches `find_references` / `get_dependencies` per GUID; gives you loading and error states for free. |
| Styling | **CSS custom properties + CSS Modules** (or Tailwind v4 with the tokens as `@theme`) | Theming is the hard requirement — every token in the README becomes a `--var` on `:root` / `[data-theme]`, so light/dark/system is one attribute flip with no re-render. Do **not** hardcode colors in components. |
| Icons | **Lucide** (`lucide-react`) | Consistent 24px grid, `stroke-width` control, tree-shakes. Replaces every placeholder glyph. |
| Fonts | **IBM Plex Sans + IBM Plex Mono**, self-hosted (`@fontsource/ibm-plex-sans`, `-mono`) | Must work offline — the viewer runs on `localhost` with no network. Ship woff2 subsets, not a Google Fonts link. |

## Graph rendering

| View | Recommendation | Notes |
|---|---|---|
| Graph model | **graphology** | One in-memory graph instance shared by all three views; typed node/edge attributes; has the traversal + metrics helpers you need. |
| 2D (`1a`, `1b`) | **Sigma.js v3** (WebGL) | Renders 100k+ nodes; native graphology integration; custom node/edge programs let you match the dot-shape-by-type and hue-from-source-node rules. Alternative: Cosmograph (GPU force, faster still, less control over chrome). |
| Force layout | **graphology-layout-forceatlas2 in a Web Worker** | Run to settle, then **stop**. A permanently jittering graph makes nodes unclickable. Cache positions per project so reopening is instant. |
| 3D (`1c`) | **three.js** + **3d-force-graph** | Gives orbit controls, picking, and instanced points out of the box. Implement the depth cues yourself: size × `0.7 + k·0.55`, fog for the blur (use `THREE.Fog`, not a CSS blur), label scale with `k`. |
| DAG (`1d`) | **ELK.js** (`elkjs`, layered algorithm) in a worker | Handles the layered/orthogonal routing properly; `dagre` is lighter but less good with the wide fan-out from Texture nodes. Render with the same Sigma canvas using fixed positions. |
| Minimap | Second small Sigma instance on the same graph, `enableCamera: false` | Cheaper and always in sync vs. drawing it yourself. |

**Interaction budget:** hit-testing, hover highlight, and trace dimming must be attribute updates on the
graphology instance (a `reducer` in Sigma), never a React re-render of node components.

## Data access

| Concern | Recommendation |
|---|---|
| Static flavor | **`sql.js`** (or `wa-sqlite` with OPFS if you want persistence) to open the picked `.db` in-browser. Already the repo's approach — keep it. |
| Server flavor | Keep the existing JSON API over `better-sqlite3`. |
| Abstraction | One `GraphSource` interface (`getOverview`, `searchAssets`, `getDependencies`, `findReferences`, `tracePath`, `findUnused`, `runQuery`, `indexStatus`) with `HttpSource` and `WasmSource` implementations. The UI imports only the interface. |
| Query editor | **CodeMirror 6** with a small custom StreamLanguage for the Cypher-ish subset (+ the SQL mode for the `sql` tab). Monaco is far too heavy for a 3-line editor. |
| Results table | **TanStack Table** + **TanStack Virtual** | 312 rows in the mock, 50k in reality. Virtualize. |

## Testing & tooling

- **Vitest** — already the repo's test runner.
- **Playwright** — screenshot-diff the four layout directions and both themes; graph UIs regress silently.
- **ESLint + Prettier** — match the repo's existing config.

## Deliberately NOT recommended

- **D3 force / D3 rendering.** SVG DOM per node dies past ~2 000 nodes.
- **Cytoscape.js.** Fine at small scale, but its styling model fights the token system and it's slow at 10k+.
- **A charting/dashboard framework.** Nothing here is a chart.
- **A component library (MUI, Chakra, shadcn).** The chrome is ~12 bespoke primitives at an unusual
  density; a library would be fought more than used. Write the primitives.
- **A backend or auth.** Everything is local, single-user, offline.

## Implementation order

1. **Tokens + shell.** CSS variables for every token in the README, `data-theme` on `<html>`, plus a
   `prefers-color-scheme` listener for `system`. Build the static chrome of `1a` (top bar, sidebar,
   inspector, query bar) with fake data. This alone validates the theme spec (`1f`).
2. **`GraphSource` interface + both adapters.** Wire the real counts into the sidebar `INDEX` block and
   the `1e` indexing/first-run states. Ship this — it's already useful.
3. **2D canvas.** graphology + Sigma + ForceAtlas2 worker. Node shape/size/hue rules, edge hue-from-source,
   labels above degree threshold, zoom/fit/minimap. Node budget + type/origin filters.
4. **Selection + inspector.** Detail panel, reference rows with `ref_kind` badge and `context` property,
   the YAML ref-site snippet, history navigation. This is the payload of the whole app — get `context`
   and the snippet right.
5. **Trace mode (`1b`).** `tracePath` + the dim/highlight reducer + blast-radius summary.
6. **Search palette.** `⌘K`, debounce, grouped results, the three enter-modifiers.
7. **Query drawer (`1d`).** CodeMirror + virtualized results + CSV export.
8. **DAG view.** ELK worker, column headers, chip nodes.
9. **3D view (`1c`).** Last — it's the orientation toy, not the working surface. Ship without it if time is short.

## Two things that will make or break it

- **Never re-layout on selection.** Users build a spatial memory of the graph in the first ten seconds.
  Selecting, tracing, filtering, and switching themes must all leave positions untouched. Only an explicit
  re-layout or a node-budget change may move nodes — and that should animate, not jump.
- **`edges.context` is the product.** "`M_Metal` references this shader" is mildly useful; "on
  `m_Shader`" is what lets someone act. Surface it on every reference row, in every hover tooltip, and in
  every exported row.
