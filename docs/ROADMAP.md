# Roadmap / TODO

Planned work, noted for later. Not yet implemented. Tracked in the harness
backlog (`scripts/bin/harness-cli query backlog`).

---

## E08 — CI/CD (GitHub Actions)

**Goal:** automated tests on every push/PR, and automated npm publish on
`release/*` branches.

### `.github/workflows/ci.yml` — test on push & PR
- Triggers: `push` (all branches) + `pull_request`.
- Matrix: Node `20` and `22` on `ubuntu-latest` (+ optionally macOS for the
  `better-sqlite3` native build).
- Steps: `npm ci` → `npm run typecheck` → `npm test` → `npm run build`.
- Note: `better-sqlite3` installs via prebuilt binaries on standard runners.

### `.github/workflows/release.yml` — publish on `release/*`
- Trigger: `push` to `release/**`.
- Steps: run the full CI (typecheck/test/build), then `npm publish --access public`
  (build runs via `prepublishOnly`).
- **Auth:** `NPM_TOKEN` repo secret — a **granular automation token** with publish
  permission and **bypass-2FA** enabled (CI can't do interactive OTP). Set
  `//registry.npmjs.org/:_authToken=${NPM_TOKEN}` in `.npmrc` at build time.
- **Version guard:** skip/soft-fail if `package.json` version already exists on
  npm (avoid republish errors). Version is bumped manually in `package.json`
  before pushing to `release/*`.
- **Optional:** `npm publish --provenance` (needs `permissions: id-token: write`
  + public repo) for supply-chain provenance; create a GitHub Release + `v*` tag.

**Decisions to make:** manual vs automated version bump; whether to also trigger
on `v*` tags; which Node/OS matrix.

**Secrets required:** `NPM_TOKEN`.

---

## E09 — ADR management (like codebase-memory-mcp `manage_adr`)

**Goal:** record and query Architecture Decision Records for the project, via the
MCP server, so agents can answer "why is this structured this way?".

### Design options (pick one)
- **A. Markdown files** under `.asset-memory/adrs/NNNN-title.md` (git-diffable,
  human-readable, committed — mirrors this repo's own `docs/decisions/`). MCP
  tool does file CRUD.
- **B. SQLite table** `adrs(id, title, status, context, decision, consequences,
  created_at, updated_at, supersedes)` in the index (queryable, but binary; would
  ride along in snapshots). codebase-memory-mcp stores ADRs in its graph.
- Recommendation: **A** (files) for committability + review; optionally index
  them into a table for search.

### MCP tool
- `manage_adr(action: create | list | get | update | supersede, ...)` returning
  ADR content/metadata.

**Open question:** ADR content model for an *asset* tool — likely the generic
title/status/context/decision/consequences, scoped to asset architecture
decisions. Confirm scope before building.

---

## E10 — JSON graph snapshot (git-diffable export)

**Goal:** a **JSON** export of the graph, complementing the existing compressed
binary snapshot (`index.db.br`). SQLite-free, human-readable, git-diffable.

- New CLI action / MCP tool: `export --json` → writes
  `.asset-memory/graph.json`:
  ```json
  {
    "meta": { "schema_version": 2, "indexed_at": "...", "counts": {...} },
    "assets": [{ "guid", "path", "assetType", "origin", ... }],
    "edges": [{ "from", "to", "refKind", "context", "fileId", "count" }],
    "unresolved": [...],
    "addressables": [...]
  }
  ```
- **Stable ordering** (sort by path/guid) so diffs are meaningful across re-index.
- Consideration: size — a 20k-asset project produces multi-MB JSON. Offer compact
  vs pretty; maybe a scoped export (by path prefix).

**Open question (clarify):** confirm this means a full JSON graph export. The
existing snapshot already ships `artifact.json` (metadata) + `index.db.br`
(compressed DB); this item adds a readable **whole-graph** JSON on top.

---

## Already shipped (for reference)

- Index core, query layer, MCP server (9 tools), web viewer (server + WASM),
  configurable Addressables-as-roots + ignore-list, **compressed shared snapshot**
  (`index.db.br` + `artifact.json` + `.gitattributes`), npm packaging (published
  as `unity-asset-reference-mcp`).
