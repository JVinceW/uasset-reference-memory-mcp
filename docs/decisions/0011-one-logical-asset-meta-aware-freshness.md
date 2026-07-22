# 0011 One Logical Asset With Meta-Aware Freshness

Date: 2026-07-22

## Status

Accepted

## Context

Unity represents one logical asset with two physical filesystem entries: the
asset path and its sibling `.meta` file. The index already stores one asset row
whose serialized references and size come from the asset while its GUID and
importer identity come from `.meta`. Incremental indexing currently stores only
the asset path's modification time, so importer-only `.meta` edits can leave the
logical row incorrectly classified as unchanged.

## Decision

Keep one database row per logical Unity asset. Do not create graph nodes for
`.meta` files.

During scanning, define the row's effective modification time as:

```text
max(floor(asset.mtimeMs), floor(meta.mtimeMs))
```

The existing incremental comparison continues comparing one stored integer per
logical asset. A normal modification to either physical file therefore marks
the asset updated without changing schema 3 or public query contracts.

## Alternatives Considered

1. Store `.meta` as a separate graph node. Rejected because it would double
   logical asset results and corrupt user-facing counts and unused analysis.
2. Add separate asset and meta timestamp columns. More explicit, but it would
   require a generated-index schema bump for a change that can use the existing
   freshness field.
3. Hash asset and `.meta` content. More robust against preserved timestamps,
   but broader and more expensive than this bounded fix.

## Consequences

Positive:

- Normal importer-only `.meta` edits trigger incremental reprocessing.
- Asset and `.meta` remain one discoverable asset throughout MCP queries.
- Existing schema-3 indexes remain compatible.

Tradeoffs:

- Timestamp-preserving synchronization can still evade detection.
- A path with an artificially future-dated asset can mask an older `.meta`
  timestamp until wall-clock time passes it.
- Some importer-only edits will cause harmless extra parsing even when graph
  references do not change.

## Follow-Up

- Handle asset moves/renames by GUID in a separate decision and plan.
- Define explicit incremental semantics for manual GUID replacement separately.
- Consider content fingerprints only if real timestamp-preservation failures
  justify the additional cost.
