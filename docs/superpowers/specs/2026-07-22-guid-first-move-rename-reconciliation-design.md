# GUID-First Move And Rename Reconciliation Design

Date: 2026-07-22

## Goal

Make incremental indexing preserve one logical Unity asset when its asset and
`.meta` pair move or rename together, without requiring a running Unity editor.

## Current Behavior

`applyIncremental` obtains a path-keyed map from `GraphStore.getNodeMtimes`,
classifies a current path with no prior entry as added, and separately removes
every prior path missing from the current scan. For a normal Unity move, the
new and old path records carry the same GUID. The index can therefore upsert the
new row and then delete it while processing the old path's removal.

## Approved Design

Incremental reconciliation will use two identities:

- GUID is stable logical identity.
- Project-relative path is mutable location metadata.

The previous database state and current scan will each be available through
GUID and path lookup maps. A current node is a move/rename when its GUID occurs
exactly once in both states, its path changed, and the previous path is absent
from the current scan.

That node enters the existing updated collection. It does not enter the added
or removed collections. Existing `IndexSummary` response fields remain intact,
so one move produces `updated: 1`, `added: 0`, and `removed: 0`.

## Reconciliation Order

For each unique current GUID:

1. Match the previous record by GUID.
2. If the GUID exists and the path differs, classify the node as updated due to
   move/rename.
3. If the GUID exists at the same path, compare effective asset/`.meta` mtime
   using the separately approved freshness rule.
4. If the GUID does not exist previously, leave classification to the
   add/replacement rules.
5. After current classification, remove only previous GUIDs that are absent
   from the complete current GUID set.

This ordering prevents a moved GUID from entering removal cleanup.

## Graph And Addressables Behavior

The node upsert changes its path, name, origin, package identifier, asset type,
size, binary flag, effective timestamp, and any other scanner-derived fields.
Incoming edges continue targeting the unchanged GUID and are not demoted.

The moved node is re-extracted even when its effective timestamp is unchanged.
Its old outgoing edges and unresolved references are replaced with fresh data.
Addressables group metadata owned by the moved asset is also replaced, ensuring
stored group paths do not remain stale.

## Unity Editor Integration Boundary

`AssetDatabase.MoveAsset` and `AssetDatabase.RenameAsset` demonstrate Unity's
GUID-preserving model but are mutation APIs, not indexer dependencies.
`AssetPostprocessor.OnPostprocessAllAssets` can provide old/new path pairs only
while the editor integration is active. A future event journal may accelerate
or explain reconciliation, but the complete scan and GUID comparison remain
authoritative.

## Failure And Ambiguity Boundaries

- Duplicate current occurrences of one GUID are not inferred as moves. Their
  error/warning behavior requires a separate explicit decision.
- Reuse of an existing path by a different GUID is not resolved by the move
  rule. GUID replacement semantics require the next decision.
- Moving only the asset without its `.meta` is not a valid identity-preserving
  Unity move; the scanner observes whatever GUID is paired at the destination.
- Atomic database replacement continues protecting the prior live index when
  indexing fails.

## Validation Contract

- Moving one asset and its `.meta` together produces one updated asset, no add,
  no removal, one row for the GUID, and the new stored path.
- Incoming references to the moved GUID remain resolved and unchanged.
- Outgoing references are re-extracted from the new location.
- Moving an Addressables group asset refreshes its stored group path and keeps
  its entries and labels queryable.
- Renaming an asset follows the same behavior as moving it.
- Moving a folder reconciles each contained GUID without duplicate rows.
- Existing add, update, removal, builtin, force rebuild, and meta-aware
  freshness tests remain green.

## Scope Boundary

This design does not introduce Unity editor callbacks, a filesystem watcher,
content hashing, new public summary fields, or a database schema change. Manual
GUID replacement and duplicate-GUID policy remain separate decisions required
before the combined `0.3.1` implementation plan is complete.
