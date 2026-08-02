# Handoff: Unity Asset Reference Graph Viewer

## Overview

A full-bleed desktop web app for exploring the Unity asset reference graph produced by
`unity-asset-reference-mcp` (repo: `JVinceW/uasset-reference-memory-mcp`). It replaces /
upgrades the existing `unity-asset-reference-mcp-web` viewer.

Primary jobs, in priority order:

1. **"What references this?"** — trace upstream from an asset, see the blast radius before changing it.
2. **"Find the thing"** — search assets/GUIDs/paths, jump to a node.
3. **"Run a query, read a table"** — graph/SQL query drawer over the same index.
4. **"What is this project shaped like?"** — orientation via clusters, hotspots, broken/unused counts.

Audience: Unity devs debugging dependency chains. Target: desktop web, full-bleed, 1440×900 baseline
(design is fluid — only the three chrome columns have fixed widths).

## About the Design Files

The files in this bundle are **design references written in HTML** — a prototype that shows intended
look, layout, density, and states. They are **not production code to copy**.

The task is to **recreate these designs inside the target codebase** using its own environment and
patterns. The existing viewer is TypeScript + a small HTML/CSS frontend in `src/web/`; if you keep
that project, implement in the stack recommended in `TECH_STACK.md`. Do not lift the prototype's
inline styles wholesale — port them into whatever styling system the app adopts.

`Asset Graph Viewer.dc.html` needs `support.js` next to it; open the HTML directly in a browser.
The graph coordinates in the prototype come from a small deterministic force simulation in the file's
logic class — read it for layout intent, not as an algorithm to ship (use a real graph library).

## Fidelity

**High-fidelity.** Colors, typography, spacing, and density are final and intended to be matched
closely. Interaction behavior is described below but was not built — the prototype is static.

## Data Model (source of truth)

From `docs/product/asset-graph-model.md` in the MCP repo. The UI is a direct projection of it:

- **Node** = row in `assets`: `guid`, `path`, `name`, `asset_type`, `origin` (`project|package|builtin`),
  `file_size`, `mtime`, `is_binary`.
- `asset_type` ∈ `Prefab | Scene | Material | Texture | Script | Shader | AnimationClip |
  AnimatorController | ScriptableObject | Sprite | AudioClip | Font | Model | Folder | Other`.
- **Edge** = row in `edges`: `from_guid`, `to_guid`, `ref_kind`, `file_id`, `context`, `count`.
- `ref_kind` ∈ `USES_SCRIPT | USES_MATERIAL | USES_TEXTURE | USES_SHADER | USES_MESH |
  USES_ANIMATION | NESTED_PREFAB | SERIALIZED_REF` (+ future `CODE_REF`, `ADDRESSABLE_REF`).
- **Broken refs** = `unresolved_refs`. **Addressables** = `addressable_groups` / `addressable_entries`
  / `addressable_entry_labels`.
- Impact analysis = reverse lookup on `idx_edges_to`. Dependencies = forward on `idx_edges_from`.

Never invent fields. Every string shown in the UI maps to one of the columns above.

---

## Screens / Views

The prototype is one canvas with six labelled options. `1a`–`1d` are four **layout directions** for the
same app; `1e` is transient states; `1f` is the theme/token spec. Pick one direction (or a hybrid) as
the shipping IA — they are alternatives, not four separate screens.

### 1a — Workbench (2D force layout, dark, nothing selected) — the recommended default

**Purpose:** land here after opening a project. Orient, then click into something.

**Layout:** vertical flex, 1440×900.
- Top bar `44px`, `background #121519`, `border-bottom 1px #242932`, padding `0 14px`, gap `14px`.
- Middle row `flex:1`: sidebar `248px` fixed · canvas `flex:1` · inspector `320px` fixed.
- Bottom query bar `36px` (collapsed state).

**Top bar contents (left → right)**
- Logo mark: `15×15`, `border-radius 4px`, `background oklch(0.72 0.14 250)`. Wordmark
  "assetgraph", `IBM Plex Sans 600 12.5px`, `letter-spacing .02em`.
- Project chip: padding `4px 9px`, `radius 6px`, `background #181c22`, `border 1px #242932`.
  Content: `SkyForge` (Mono 500 11px, `#c3c9d3`) · `/` (`#3a4150`) · `Unity 6000.0.23f1`
  (Mono 400 11px, `#626b79`) · `5px` green dot `oklch(0.72 0.14 145)` = index fresh.
- Omnisearch: `flex:1; max-width 400px`, height `28px`, `radius 7px`, `background #0b0d10`,
  `border 1px #242932`. Placeholder "Search assets, GUIDs, paths…" `12px #626b79`.
  Right-aligned kbd chip `⌘K`, Mono 500 10px, `border 1px #242932`, `radius 4px`, padding `2px 5px`.
- Segmented control **2D / 3D / DAG**: wrapper `padding 2px; radius 7px; background #0b0d10;
  border 1px #242932`; items `padding 4px 10px; radius 5px`, Mono 500 11px; selected
  `background #242932; color #e7eaee`, unselected `#626b79`.
- Segmented control **LIGHT / DARK / AUTO**: identical, `padding 4px 8px`, Mono 500 10.5px.
- Primary button "Reindex": `padding 5px 11px; radius 7px; background oklch(0.72 0.14 250);
  color #08121f; 11.5px/600`.

**Left sidebar (`248px`, `#121519`, `border-right 1px #242932`)** — sections separated by
`1px #1c2028`, each `padding 13–14px`. Section labels are Mono 600 9.5px, `letter-spacing .12em`,
`#626b79`, uppercase.
- `INDEX` — 2×2 grid, gap `9px`. Each stat card: `padding 8px 9px; radius 7px; background #181c22;
  border 1px #242932`; number Mono 600 17px; caption 10px `#626b79`.
  Values: `4 812 assets`, `11 946 edges`, `14 broken refs` (number in `oklch(0.7 0.16 30)`),
  `312 unused` (number in `oklch(0.75 0.14 80)`). Footer line Mono 10px `#4c5462`:
  "indexed 4 min ago · schema v3".
- `ASSET TYPES` — one row per type, `padding 4px 6px; radius 5px; gap 8px`: type dot (`8×8`,
  `radius 2px`, type hue) · name 11.5px `#c3c9d3` · count Mono 10.5px `#626b79` · proportional bar
  (`height 3px`, width 12–38px, type hue at 45% alpha). Rows are toggles (click = hide that type).
- `ORIGIN` — three pills, `padding 4px 9px; radius 20px`, 11px. Active: `background #242932;
  border 1px #2e3541; color #e7eaee`. Inactive: `border 1px #242932; color #626b79`.
- `NODE BUDGET` — label + value `oklch(0.72 0.14 250)` Mono 500 11px. Track `height 4px;
  radius 3px; background #242932`; fill same accent; knob `12px` circle `#e7eaee` with `2px` accent
  border. Range **50 – 5 000**, ranked by degree. Sub-labels Mono 9.5px `#4c5462`:
  `50` / `ranked by degree` / `5 000`. Below: two toggle chips "collapse folders", "hide builtin"
  (`padding 3px 8px; radius 5px; background #181c22; border 1px #242932; 10.5px #939bab`).
- `SAVED` — plain list, 11.5px `#939bab`, `3px` bullet `#4c5462`.

**Canvas** — `background: radial-gradient(circle at 46% 42%, #12161c 0%, #0b0d10 68%)`.
- Edges: SVG `<path>`, quadratic curve bowed perpendicular by `0.11 × length`. Stroke = **source
  node's type hue at 0.34 alpha**, width 1 (scale width by `edges.count`). No arrowheads at rest.
- Nodes: absolutely positioned, `translate(-50%,-50%)`, flex row, `gap 7px`.
  Dot diameter `5 + min(11, degree × 1.05)` px. Shape by type: **Scene = `radius 3px` square,
  Prefab = `radius 2px` square, everything else = circle.** Label Mono 500 11px `#e7eaee` with
  `text-shadow 0 1px 3px rgba(0,0,0,.75)`, shown only when `degree ≥ 4` (or when the label toggle is on).
- Top-left chips (`padding 5px 10px; radius 6px; background rgba(18,21,25,.86); border 1px #242932;`
  Mono 11px `#939bab`): `scope: Assets/`, `depth ∞`, `42 / 4 812 shown`.
- Bottom-left: stacked `+` / `−` buttons (`28×26`, joined, `radius 7px`, `border 1px #242932`,
  `background rgba(18,21,25,.9)`) and a `FIT` button (`30×26`, Mono 9px).
- Bottom-right minimap: `150×104`, `radius 8px`, `border 1px #242932`,
  `background rgba(11,13,16,.92)`; same edge paths at `opacity .5`; viewport rect
  `border 1px oklch(0.72 0.14 250 / .6)`, `background oklch(0.72 0.14 250 / .08)`.

**Right inspector (`320px`)** — empty-selection variant.
- `NO SELECTION` + helper copy 12.5px `#939bab`: "Click a node to inspect it, or start from a hotspot
  below." + dimmer hint "Shift-click two nodes to trace the path between them."
- `HOTSPOTS · MOST REFERENCED` — rows `padding 6px 7px; radius 6px; background #181c22`: type dot ·
  name (Mono 500 11.5px, ellipsis) + type caption 10px `#4c5462` · in-degree Mono 500 11px `#939bab`.
- `NEEDS ATTENTION` — two alert cards, `padding 9px 10px; radius 7px`:
  broken = `background oklch(0.7 0.16 30 / .1)`, `border 1px oklch(0.7 0.16 30 / .28)`, count in
  `oklch(0.72 0.16 30)`; unused = `background oklch(0.75 0.14 80 / .09)`,
  `border 1px oklch(0.75 0.14 80 / .25)`, count in `oklch(0.78 0.14 80)`. Sub-copy on unused:
  "Addressables-aware · verify vs. code loads" (the index cannot see `Resources.Load` — say so).
- `RECENT` — Mono 11px `#626b79` list.

**Bottom query bar (collapsed, `36px`)** — `QUERY` label, last query in Mono 11.5px `#4c5462`,
right-aligned hint `⌥↵ run · ⌃\` expand`, and an `18×18` expand button.

### 1b — Light theme + trace state

Same IA as 1a. Differences that matter:

- **Trace mode.** Sidebar's top section becomes a trace panel tinted
  `oklch(0.55 0.16 250 / .05)` with label `TRACE MODE · UPSTREAM` and two direction pills:
  `↑ referenced by` (active, `background oklch(0.55 0.16 250)`, white) and `↓ depends on`.
- **Blast radius** rows: hop label (`1 hop`, `2 hops`, `3 hops`, `total`) · category · count ·
  proportional bar (`height 4px; radius 3px`, `track #eef0f3`) colored by the hop's dominant type.
  Summary card: "Closure reaches **2 scenes**. Rebuild affects 6 bundles."
- **Canvas highlight rule:** on-path nodes at `opacity 1` with `box-shadow 0 0 14px <hue>/.45`;
  off-path nodes and edges drop to `opacity .14` / stroke alpha `.05` — **dimmed, never removed**.
  On-path edges: stroke alpha `.75`, width `1.8`. The trace root gets
  `box-shadow: 0 0 0 3px <hue>/.28, 0 0 22px <hue>/.5` and its label takes the type hue.
- Canvas chips: `trace: S_Lit_Custom ↑` (solid accent, white), `13 on path · 29 dimmed`, `clear ✕`.
- **Inspector, selected state:**
  - Header: type dot + `SHADER` in the type hue (Mono 600 9.5px, `letter-spacing .12em`),
    name Mono 600 16px, path Mono 10.5px `#8d95a1` (`word-break: break-all`), GUID chip
    `padding 5px 8px; radius 6px; background #f4f6f8`, Mono 10px, with a copy affordance `⧉`.
  - Meta grid 2×2: `ORIGIN`, `SIZE`, `IN / OUT`, `MODIFIED` — caption 9.5px `#8d95a1`,
    value Mono 500 11.5px.
  - Tabs: `Referenced by 3` / `Depends on 0` / `Source`. Active tab `600 11.5px #14171c` with
    `border-bottom 2px oklch(0.55 0.16 250)`.
  - Reference rows: `padding 8px 9px; radius 7px; border 1px #eef0f3` — dot · name Mono 500 11.5px ·
    `ref_kind` badge (Mono 500 9px, `padding 2px 6px; radius 4px`, background = **target type hue at
    .12**, text = same hue). Second line: path. Third line: `context <property>` — this is the YAML
    property from `edges.context` (`m_Shader`, `m_Materials`, `_MainTex`) and it is the single most
    useful thing on the panel. Always show it.
  - `REF SITE` code block: `padding 10px 11px; radius 8px; background #f7f8fa; border 1px #e8ebef`,
    Mono 10.5px/1.65, `white-space: pre`. Show the real YAML around the ref, with the matched
    `{fileID, guid}` line highlighted `background oklch(0.55 0.16 250 / .13)`.
  - Actions: `Reveal in Unity` (solid `#14171c`, white) and `Copy GUID` (outline).
- Bottom bar shows the call that produced the state:
  `trace_path(to: 'S_Lit_Custom', direction: 'inbound', depth: 5)` · `13 rows · 4 ms`.

### 1c — 3D galaxy (minimal HUD)

**Purpose:** orientation and "shape of the project" at high node counts; not for precise work.

- No sidebars. Top bar shrinks to logo + `SkyForge · 4 812 assets` + 2D/3D/DAG + `ORBIT` + `AUTO`.
- Canvas `background: radial-gradient(ellipse 70% 60% at 50% 46%, #131a26 0%, #07080b 72%)`.
- **Depth cues (must be implemented, they carry the readability):** perspective factor
  `k = 620 / (620 + z)`; node size scales `0.7 + k × 0.55`; far nodes get `blur((1 − k) × 3.4px)`;
  label size interpolates `9 → 11.4px` with `k`.
- Floating HUD panels: `radius 11px`, `background rgba(13,16,21,.72)`, `backdrop-filter blur(14px)`,
  `border 1px rgba(255,255,255,.08)`.
  - Left `216px` — `CLUSTERS` legend + `depth fog: on`, `edge bundling: 0.4`.
  - Right `250px` — selected node summary: type kicker, name, path, then
    `dependencies 6 direct · 19 closure`, `referenced by 2 scenes`, `closure size 24.6 MB`, and two
    buttons `Focus` (solid accent) / `Isolate` (outline).
- **Command palette** (open on typing): centered, `520px`, `top 96px`, `radius 13px`,
  `background rgba(13,16,21,.9)`, `backdrop-filter blur(20px)`, `box-shadow 0 24px 60px rgba(0,0,0,.6)`.
  Query row with caret bar (`1px × 16px`, accent) and `18 matches`. Result rows `padding 8px 10px;
  radius 8px`, selected row `background rgba(255,255,255,.06)`. Footer keys:
  `↵ focus node`, `⇧↵ trace upstream`, `⌘↵ isolate closure`.
- Bottom center hint chips: `drag orbit`, `scroll dolly`, `F fit`, `42 / 4 812 nodes`.

### 1d — Layered DAG + query drawer

**Purpose:** reading dependency order precisely; exporting query results.

- Left icon rail `56px` instead of the sidebar; items `34×34`, `radius 8px`, active
  `background #242932; color #e7eaee`, idle `#5a626f`.
- Canvas has a `26px` column header strip (`background #0e1115`, `border-bottom 1px #1a1e26`) with four
  Mono 600 9px `letter-spacing .12em` labels — `SCENES` / `PREFABS · CONFIG` /
  `MATERIALS · SCRIPTS · MESHES` / `LEAVES` — plus faint 213px column rules
  (`rgba(255,255,255,.022)`).
- Layer assignment: Scene → 0; Prefab, ScriptableObject → 1; Material, Script, AnimatorController,
  Model → 2; Texture, Shader, AnimationClip, AudioClip, Font, Sprite → 3. Within a column, sort by
  degree descending.
- Nodes are **chips**, not dots: `padding 3px 8px 3px 6px; radius 6px; background #14181e;
  border 1px #242932`, `7×7` type square + Mono 500 10.5px `#c3c9d3`.
- Edges are cubic béziers with horizontal control points (`M x+68,y C mid,y mid,y2 x−6,y2`), stroke =
  source hue at `.3`.
- Inspector shows `DEPENDENCY CLOSURE` (per-type count + size, then a total row) and `REF KINDS ON
  PATH` as tinted badges (`background <hue>/.13`, `color <hue>`).
- **Query drawer `240px`:**
  - Header `34px`: `QUERY` · `graph`/`sql` mini-tabs · `312 rows · 7 ms` · `Run ⌥↵` (accent) · collapse.
  - Editor: `background #0e1115`, Mono 12px/1.7, keyword color `oklch(0.75 0.13 300)`,
    label/rel `oklch(0.75 0.13 195)`, numbers `oklch(0.78 0.13 80)`.
  - Results table: grid `44px 1fr 110px 92px 100px` (`#`, `PATH`, `SIZE`, `REFS`, `ORIGIN`).
    Header Mono 600 9.5px `letter-spacing .1em` `#626b79`; rows `padding 5px 14px`, Mono 11px
    `#939bab`, `border-bottom 1px #161a20`; selected row `background rgba(255,255,255,.03)`.
    A `REFS` value of `0` is colored `oklch(0.72 0.16 30)` — that's the unused signal.
  - Footer bar: `showing 4 of 312` · `load more` chip · `total 61.4 MB reclaimable`. Real
    implementation should virtualize/paginate; keep the count affordance.

### 1e — Transient states

Three panels, equal thirds of a `400px` strip.

- **Indexing:** title "Reading Unity serialization", subtitle "3 108 of 4 812 assets · GUIDs from
  .meta, refs from YAML". Progress bar `height 5px; radius 3px; track #181c22`, fill accent, 64.6%.
  Step list with `15×15` `radius 4px` marks: done `✓` (`background oklch(0.72 0.14 145 / .16);
  color oklch(0.75 0.14 145)`), active `›` (accent at `.18`), idle `·` (`#181c22 / #4c5462`).
  Steps: Discover files · Parse .meta GUIDs · Scan YAML references · Resolve + write index.db.
  Footer note: "The graph stays queryable from the previous index while this runs." — **implement
  that**; don't blank the canvas during reindex.
- **First run / no index:** `52×52` `radius 14px` dashed placeholder, "No index yet", copy naming
  `Force Text` serialization and `.asset-memory/index.db`, buttons `Choose project…` (accent) and
  `Restore snapshot` (outline), plus "or drop an index.db here".
- **Broken references:** red kicker `14 BROKEN REFERENCES`, explainer, then rows `padding 8px 10px;
  radius 7px; background #121519; border 1px #242932` — source asset · `MISSING` badge ·
  `→ <truncated guid> · <context>`. Actions `Show all 14`, `Export report`.

### 1f — Theme & token spec

Three cards (Dark / Light / System). Each shows the six core surface swatches in order —
**surface · panel · raised · border · text · dim** — and the full type-hue chip set. Use it as the
acceptance reference for theming.

---

## Interactions & Behavior

**Selection & navigation**
- Click node → select; inspector switches from overview to detail. Canvas pans so the node is centered
  (~300ms ease-out); do **not** re-run the layout.
- Double-click node → focus/expand its neighborhood one hop.
- Shift-click a second node → trace the path between the two.
- Click a reference row in the inspector → select that asset (push to history; `⌘[` / `⌘]` to move).
- Hover node → highlight it and its direct edges; show a tooltip with `path` + `asset_type`.
  Hover edge → show `ref_kind` + `context`.
- Right-click node → context menu: Trace upstream · Trace downstream · Isolate closure · Copy GUID ·
  Copy path · Reveal in Unity.

**Trace mode**
- `trace_path(to, direction, depth)`. Direction toggle is `inbound` (referenced by) / `outbound`
  (depends on). Depth default 5, `∞` allowed with a node cap.
- Entering trace mode dims off-path elements to `opacity .14` over 200ms; it never removes them, and it
  never re-lays-out the graph. `Esc` or the `clear ✕` chip exits.

**Search**
- `⌘K` opens the palette. Debounce 120ms. Match on `name`, `path`, and GUID prefix; group by
  `asset_type`; show ref-count as the row's right-hand meta.
- `↵` focus · `⇧↵` trace upstream · `⌘↵` isolate closure · `Esc` close.

**Query drawer**
- `⌃\`` toggles collapsed/expanded. `⌥↵` runs. Show row count + elapsed ms after each run — the index
  is fast and the UI should prove it.
- Result rows are clickable → select node in canvas. `Export CSV` in the top bar exports the current
  result set.

**Layout engines**
- 2D / 3D / DAG switch keeps the current selection and trace state. Cross-fade 250ms; don't reset zoom.
- Force layout runs in a worker, settles, then stops. Never leave it jittering — nodes must be stable
  targets for the mouse.

**Scale handling**
- Node budget is a real setting: 50–5 000, default ~320, ranked by degree. Above the budget, aggregate
  by folder into a single node whose size encodes child count; clicking it drills in.
- `collapse folders` and `hide builtin` are independent switches. `origin` pills filter
  `project | package | builtin`.

**Loading / error**
- Reindex → the 1e progress panel appears as a sidebar takeover; the canvas stays interactive on the
  previous index.
- No index → 1e first-run panel fills the whole canvas area.
- Query error → inline red message under the editor quoting the parser's message; never clear the
  previous result set.

**Responsive**
- Below 1180px, collapse the inspector to an overlay drawer. Below 900px, collapse the sidebar to the
  1d icon rail. The canvas never goes below 560px wide.

## State Management

```
project: { root, unityVersion, indexedAt, schemaVersion, counts }
view:    { engine: '2d'|'3d'|'dag', theme: 'light'|'dark'|'system', zoom, pan }
filters: { types: Set<AssetType>, origins: Set<Origin>, nodeBudget, collapseFolders, hideBuiltin }
graph:   { nodes, edges, positions, layoutStatus: 'idle'|'running'|'settled' }
selection:{ selectedGuid, hoverGuid, history[], historyIndex }
trace:   { rootGuid, direction: 'inbound'|'outbound', depth, pathNodeIds: Set, pathEdgeIds: Set }
search:  { open, term, results, activeIndex }
query:   { drawerOpen, mode: 'graph'|'sql', text, rows, rowCount, elapsedMs, error }
indexing:{ status, step, filesDone, filesTotal, etaSeconds }
```

Data fetching mirrors the MCP tool surface: `index_status`, `get_overview`, `search_assets`,
`get_dependencies`, `find_references`, `trace_path`, `find_unused_assets`, `index_project`. The
viewer must work in both flavors the repo already ships: **server** (JSON API over the index) and
**static** (WASM SQLite in-browser) — so put every query behind one interface with two adapters, as the
repo already does with its shared query layer.

## Design Tokens

**Dark**
| Token | Value |
|---|---|
| surface (canvas) | `#0b0d10` (3D: `#07080b`) |
| panel | `#121519` |
| raised | `#181c22` |
| border | `#242932` (subtle divider `#1c2028`, hairline `#161a20`) |
| text | `#e7eaee` |
| text-secondary | `#c3c9d3` |
| dim | `#939bab` |
| faint | `#626b79` |
| faintest | `#4c5462` |
| glass panel | `rgba(13,16,21,.72)` + `blur(14px)` + `border rgba(255,255,255,.08)` |

**Light**
| Token | Value |
|---|---|
| surface | `#eef0f3` |
| panel | `#ffffff` |
| raised | `#f7f8fa` (input fill `#f4f6f8`) |
| border | `#e0e4ea` (divider `#eef0f3`) |
| text | `#14171c` |
| text-secondary | `#43494f` |
| dim | `#5d6570` |
| faint | `#8d95a1` |

**Accent (interactive):** dark `oklch(0.72 0.14 250)` on `#08121f` text; light `oklch(0.55 0.16 250)`
on white text.

**Semantic:** danger/broken `oklch(0.7 0.16 30)`; warning/unused `oklch(0.75 0.14 80)`; ok/fresh
`oklch(0.72 0.14 145)`.

**Asset type hues** — one hue per type at fixed chroma/lightness. Dark: `oklch(0.74 0.145 H)`.
Light: `oklch(0.58 0.145 H)`. Tinted background = same color at `.11–.13` alpha.

| Type | H | Type | H |
|---|---|---|---|
| Scene | 250 | AnimatorController | 175 |
| Prefab | 195 | AnimationClip | 160 |
| Material | 300 | ScriptableObject | 265 |
| Texture | 80 | Font | 110 |
| Script | 145 | Sprite | 20 |
| Shader | 340 | Model | 220 |
| AudioClip | 40 | | |

**Edges:** source node's hue. Idle alpha `.34`; on-trace `.75` at width `1.8`; off-trace `.05`.
DAG `.3`. Width may scale with `edges.count`.

**Typography** — `IBM Plex Sans` (UI copy) + `IBM Plex Mono` (every identifier: paths, GUIDs,
`ref_kind`, counts, numbers).

| Role | Spec |
|---|---|
| Section label | Mono 600 9.5px, `letter-spacing .12em`, uppercase |
| Table header | Mono 600 9.5px, `letter-spacing .1em` |
| Body | Sans 400 11.5–12.5px |
| Identifier / row | Mono 400–500 10–11.5px |
| Node label | Mono 500 11px |
| Inspector title | Mono 600 15–16px |
| Stat number | Mono 600 17px |
| Button | Sans 600 11–12px |

Nothing below 9.5px; mono never below 10px.

**Spacing** — 4 / 5 / 6 / 7 / 9 / 10 / 13 / 14 / 18 / 22px. Panel padding `13–14px`; card padding
`8–10px`; control padding `4–5px × 8–11px`.

**Radius** — `2px` type square · `4px` kbd/mark · `5px` chip · `6px` row/badge · `7px` control/card ·
`8px` result row · `11px` glass panel · `13px` palette · `20px` origin pill.

**Shadow** — panels are flat (border-only). Only two shadows exist: command palette
`0 24px 60px rgba(0,0,0,.6)`, and light-theme segmented thumb `0 1px 2px rgba(0,0,0,.08)`.

**Fixed dimensions** — top bar `44px` · sidebar `248px` · icon rail `56px` · inspector `320px` ·
query bar collapsed `36px` / expanded `240px` · minimap `150×104` · palette `520px`.

## Assets

None. There are no images or icon files — every glyph in the prototype (`⌕ ⧉ ✓ › ▲ ▼ ✕ ↑ ↓ ↵ ⌘ ⌥ ⌃`)
is a placeholder for a proper icon set. Swap them for a real icon library (see `TECH_STACK.md`) at
`14–16px`, `stroke-width 1.5`, using `currentColor`. The rail glyphs `◱ ⌕ ⌗ ◈ ⚑ ⚙` stand for
Graph / Search / Query / Closure / Issues / Settings.

## Files

- `Asset Graph Viewer.dc.html` — the design prototype (all six options on one canvas). Needs
  `support.js` beside it. Open in a browser.
- `support.js` — runtime for the prototype only. **Not part of the deliverable.**
- `TECH_STACK.md` — recommended libraries and implementation order.
