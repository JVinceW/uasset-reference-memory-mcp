# US-010 Web viewer (static WASM flavor) + shared QueryDb refactor

## Status

implemented

## Lane

normal

## Product Contract

A self-contained `viewer.html` that runs the entire query layer in the browser
over a user-picked `index.db` via WASM SQLite (sql.js) — no server. It reuses the
exact same frontend and the exact same `handleApi`/query code as the server
flavor. Enabled by refactoring the query layer to depend on a minimal `QueryDb`
interface (one `all(sql, params)` method) that both better-sqlite3 (`GraphStore`)
and sql.js satisfy.

## Relevant Product Docs

- `docs/product/graph-viewer.md` (two flavors, one UI, shared query layer)

## Acceptance Criteria

- Query layer (`traverse`, `unused`, `trace`, `search`) and `handleApi` depend
  only on `QueryDb`, not `GraphStore` — verified by an engine-parity test.
- `GraphStore` implements `QueryDb` (`all`); row mapping extracted to `store/row.ts`.
- `viewer.html` loads a `.db` (file picker or `?db=<url>`), runs queries via
  sql.js, and renders using the shared `app.js` (deferred boot).
- Vendored sql.js (offline); no query logic duplicated between flavors.

## Design Notes

- `src/query/db.ts` — `QueryDb` interface
- `src/store/row.ts` — `AssetRow`, `rowToNode`, `rowToEdge`, `EDGE_COLS`
- query modules refactored to `QueryDb`; `api.ts` takes `QueryDb`
- `src/web/public/{viewer.html,wasm-app.js}`; `app.js` gains provider branch +
  `window.__bootViewer`

## Validation

`scripts/bin/harness-cli story update --id US-010 --unit 1 --integration 1 --e2e 1 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | `wasm-parity` — `handleApi` identical on better-sqlite3 vs sql.js |
| Integration | All 118 tests green after the refactor (no behavior change) |
| E2E | Headless screenshot of `viewer.html` loading `pudgy-index.db` in-browser |
| Release | Part of full suite |

## Evidence

- Refactor kept all tests green; total **118 tests** incl. `wasm-parity` proving
  identical `handleApi` results on both SQLite engines.
- `npm run typecheck` clean; `npm run build` copies static assets + vendored
  sql.js/cytoscape.
- **Headless screenshot**: `viewer.html?db=/pudgy.db&ref=<BurningNFT>` rendered
  the same 72-node / 104-edge neighborhood, entirely in-browser (sql.js), no
  server involved in the query.

### Notes

- Static flavor loads the whole DB into the browser (fine at project size).
- `?db=<url>` convenience works when served; the file picker needs no server.
