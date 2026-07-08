# US-009 Web viewer (server flavor): HTTP API + Cytoscape frontend

## Status

implemented

## Lane

normal

## Product Contract

A local Node HTTP server serves a browser page that renders asset dependency
neighborhoods from `index.db`, backed by the shared query layer (E02a). Run
`node dist/web/server.js --db <index.db>` (or `npm run web -- --db ...`), open the
printed URL, search an asset, and explore its graph; click a node to expand.

## Relevant Product Docs

- `docs/product/graph-viewer.md`
- `docs/product/mcp-tools.md` (query semantics)

## Acceptance Criteria

- JSON API over the query layer: `/api/overview`, `/api/search`,
  `/api/neighborhood` (deps/refs + depth → Cytoscape elements), `/api/trace`,
  `/api/unused`, `/api/resolve`; unknown routes and unresolved refs return 404.
- Static serving of the viewer page + vendored Cytoscape (offline, no CDN); path
  traversal outside `public/` is blocked.
- Frontend: search box, direction toggle, depth control, radial-by-depth layout,
  type color coding, origin badges, click-to-expand, node detail panel,
  shareable `?ref=&dir=&depth=` URLs, auto-render on load.

## Design Notes

- `src/web/api.ts` — pure `handleApi(store, path, params)` router (unit-tested)
- `src/web/server.ts` — `node:http` server, static + API, `--db/--port`
- `src/web/public/` — `index.html`, `style.css`, `app.js`, `vendor/cytoscape.min.js`
- Build copies `public/` to `dist/web/public/` (`scripts/copy-public.mjs`)
- Bin `asset-reference-mcp-web`; `npm run web`

## Validation

`scripts/bin/harness-cli story update --id US-009 --unit 1 --integration 0 --e2e 1 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | `handleApi` routing/serialization (6 tests) |
| E2E | Server run vs `pudgy-index.db`: HTML+vendor+API served; headless screenshot renders a real prefab neighborhood |
| Release | Part of full suite (117 tests) |

## Evidence

- `npm test` — 117 tests pass (incl. `web/api` 6); typecheck clean; build copies
  static assets to `dist/web/public`.
- **Live server** on `pudgy-index.db`: `/` → 200 HTML, `/vendor/cytoscape.min.js`
  → 200 (435 KB), `/api/overview` → 22,913 assets / 12,956 edges.
- **Headless screenshot** rendered `P_BurningNFTView.prefab` deps depth-1 =
  72 nodes / 104 edges, radial-by-depth, type-colored, root centered.

### Follow-ups (not blocking)

- Static WASM flavor (E04b) reuses this frontend + SQL.
- Show unresolved/broken refs as distinct "missing" nodes.
- Large-neighborhood ergonomics (filter by type, collapse).
