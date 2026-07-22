# Meta-Aware Incremental Reindex Design

Date: 2026-07-22

## Goal

Make an ordinary `.meta`-only edit invalidate the same logical Unity asset row
used by incremental indexing, without adding `.meta` nodes or changing schema 3.

## Current Behavior

`scanProject` pairs each asset with its sibling `.meta`, reads identity and
importer data from `.meta`, and stats only the asset path. `applyIncremental`
then compares the row by project-relative path and stored `mtime`. Consequently,
a normal `.meta` edit can be missed when the asset file itself is untouched.

## Approved Design

`buildNode` will stat both physical members of the logical pair and store the
newer floored millisecond timestamp as the existing `AssetNode.mtime` value:

```text
effectiveMtime = max(assetMtime, metaMtime)
```

The SQLite model remains one row per Unity asset GUID/path. No table, column,
MCP argument, output field, or schema version changes. Incremental indexing
continues using its existing added/updated/removed/unchanged classification.

## Data Flow

1. The scanner finds an asset and its sibling `.meta`.
2. It reads GUID/importer data from `.meta`.
3. It stats both paths and calculates one effective timestamp.
4. The index stores that timestamp on the logical asset row.
5. A later index run classifies the row updated if either normal filesystem
   timestamp advanced.
6. Existing re-extraction refreshes the node, outgoing references, unresolved
   references, and Addressables ownership associated with that changed row.

## Failure Behavior

Missing and orphan `.meta` behavior remains unchanged. A stat/read failure still
fails the temporary build; atomic swap preserves the prior live database. The
fix does not claim protection against timestamp-preserving synchronization or
indexing during an incomplete external write.

## Validation Contract

- A scanner test sets the asset timestamp older than `.meta` and observes the
  `.meta` timestamp on the single returned node.
- An incremental integration test advances only `.meta` and observes exactly
  one updated logical asset, zero added/removed assets, and no duplicate row.
- Existing asset-only modification, removal, force rebuild, Addressables, and
  full repository tests remain green.

## Scope Boundary

Moves/renames, manual GUID replacement reconciliation, filesystem watchers,
content hashing, and automatic agent-triggered reindexing are separate work.
