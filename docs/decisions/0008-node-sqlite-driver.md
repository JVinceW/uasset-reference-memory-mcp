# 0008 Index Store SQLite Driver

Date: 2026-07-07

## Status

Accepted

## Context

US-003 persists the asset graph into the product's reusable SQLite artifact
(`.asset-memory/index.db`, distinct from the harness's own `harness.db`). We must
pick a Node SQLite driver. Goal #5 (reusable artifact) requires a standard
SQLite file readable by any tool; both candidates satisfy that — the choice is
about the runtime dependency model, not the file format.

Node 24 (the current environment) ships `node:sqlite` (`DatabaseSync`), so it is
a live option, not just a future one.

## Decision

Use **better-sqlite3** as the driver for the index store.

Rationale: it has a stable, non-experimental API, works on Node 18+, is
synchronous (the simplest code for a batch indexer), and ships prebuilt binaries
for common platforms including macOS arm64. The one runtime dependency and the
small native-module install risk are acceptable for a locally-run developer tool.

## Alternatives Considered

1. `node:sqlite` (built-in `DatabaseSync`). Rejected for now: still marked
   experimental (emits `ExperimentalWarning`, API may shift across Node
   versions) and requires Node >= 22.5. Attractive because it is zero-dependency;
   kept as the documented migration path if we later want to drop the native
   module.
2. `sql.js` (WASM). Rejected: in-memory, needs manual file persistence, slower
   for large projects.

## Consequences

Positive:

- Stable, well-documented, synchronous API keeps the store code simple.
- Prebuilt binaries make install reliable on the target platform.
- Produces a standard SQLite file — external tools read it directly.

Tradeoffs:

- One runtime dependency and a native module (possible prebuild friction on
  uncommon platforms).
- If we later prioritise zero-dependency distribution, a migration to
  `node:sqlite` is the documented fallback; the store API is written behind a
  thin boundary to keep that swap contained.

## Follow-Up

- Keep the store's driver usage behind a single module so a future `node:sqlite`
  swap touches one file.
- Revisit if `node:sqlite` stabilises (leaves experimental) and Node >= 22.5 is a
  safe baseline for our users.
