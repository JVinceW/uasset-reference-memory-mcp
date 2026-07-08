# US-018 Shared snapshot export/import (brotli) + CLI + auto-import + gitignore split

## Status

implemented

## Lane

normal (intake #8)

## Product Contract

Team-shared snapshots (mirroring `codebase-memory`'s `.codebase-memory/`): compress
the live index into a committable `.asset-memory/index.db.br` + `artifact.json` +
`.gitattributes`, restorable without re-indexing. The MCP server and web viewer
auto-restore from a snapshot when the live index is missing. Config and snapshot
are committed; the live `index.db` is gitignored.

## Acceptance Criteria

- `exportSnapshot(dbPath)` writes `index.db.br` (brotli), `artifact.json`
  (schema_version, indexed_at, asset/edge counts, sizes, tool version, git
  commit), and `.gitattributes` (`index.db.br merge=ours binary`).
- `importSnapshot(dbPath)` restores an identical, openable index.
- `ensureLiveIndex(dbPath)` imports iff the live index is missing and a snapshot
  exists; used by MCP `runTool` and the web server on startup.
- CLI: `snapshot` (export), `restore` (import), and `index --snapshot`.
- README documents the commit-vs-ignore split.

## Design Notes

- `src/snapshot/snapshot.ts` — brotli via `node:zlib` (zero deps)
- `src/cli/{parse-args,main}.ts` — `snapshot`/`restore` commands + `--snapshot`
- `src/mcp/tools.ts`, `src/web/server.ts` — auto-restore hook
- zstd avoided (native dep); brotli gets ~85% on the index

## Validation

`scripts/bin/harness-cli story update --id US-018 --unit 1 --integration 1 --e2e 1 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | export artifact fields; import round-trip; ensureLiveIndex cases; parse-args commands |
| E2E | Real project: index --snapshot → delete live db → restore |

## Evidence

- `npm test` — 165 tests pass (incl. `snapshot` 5, parse-args snapshot cases).
- **Real project lifecycle** (`pudgy-unity`): `index --snapshot` → 20,515 assets,
  `index.db` 12 MB → `index.db.br` **1.8 MB (~85% smaller)`; deleted the live db;
  `restore` rebuilt all 20,515 assets from the 1.8 MB snapshot with no re-index.

### Follow-up (offered, not built)

- Global-cache live DB (`~/.cache/unity-asset-reference-mcp/<slug>.db`) so the
  Unity project holds only committed files. Deferred — requires decoupling config
  resolution from the db path; current in-project live db + committed snapshot
  already delivers team sharing.
