# 0013 GUID-First Move And Rename Reconciliation

Date: 2026-07-22

## Status

Accepted

## Context

Unity treats the GUID stored in an asset's sibling `.meta` file as stable
identity and its project-relative path as mutable location. A move or rename
performed by Unity preserves the GUID while changing the path. The current
incremental index instead joins previous and current assets by path, so it can
classify one logical move as an addition at the new path and a removal at the
old path. Because both records carry the same GUID, the subsequent removal can
delete the newly upserted row.

Unity editor callbacks can report exact old/new path pairs, but they are not
available for every indexing environment. Source-control updates, external
filesystem operations, CI, fresh clones, and changes made while the editor is
closed must still reconcile correctly.

## Decision

Use GUID reconciliation during each scan as the authoritative move/rename
mechanism. Treat path as mutable metadata rather than asset identity.

When the previous index contains a GUID at one path and the current scan
contains that same GUID exactly once at a different path, while the previous
path is absent, classify the logical asset as updated:

- keep the existing GUID identity and incoming references;
- update the stored path and all path-derived node fields;
- re-extract the moved asset's outgoing references and Addressables metadata;
- report one updated asset, not one added asset plus one removed asset; and
- never run removal cleanup for that GUID in the same indexing transaction.

A rename uses the same reconciliation rule as a move. Folder moves require no
special identity rule: each contained asset is reconciled independently by its
preserved GUID.

`AssetPostprocessor.OnPostprocessAllAssets` move pairs may be considered later
as an optional optimization or diagnostic input. They must not become the sole
source of truth.

## Alternatives Considered

1. Keep path-based reconciliation. Rejected because paths change during normal
   Unity moves and can cause the logical asset to be deleted after upsert.
2. Depend on Unity editor move callbacks. Rejected as authoritative behavior
   because callbacks do not cover offline, source-control, CI, or fresh-index
   workflows.
3. Combine scan-time GUID reconciliation with an editor event journal now.
   Deferred because GUID reconciliation is sufficient for correctness and the
   journal adds another stateful integration surface.

## Consequences

Positive:

- Moves and renames remain correct without a running Unity editor.
- Incoming graph relationships remain attached to the stable Unity identity.
- Existing public summary fields and schema 3 remain unchanged.
- The rule matches Unity's GUID-first reference model.

Tradeoffs:

- A moved asset is deliberately re-extracted even if its effective timestamp
  did not change.
- A large folder move can reprocess many assets.
- The implementation must build both path and GUID lookup maps for previous and
  current scans.

## Follow-Up

- Decide how an occupied path with a different GUID is classified before the
  combined `0.3.1` implementation plan is finalized.
- Define explicit handling for duplicate current GUIDs; they are not eligible
  for move inference because the destination is ambiguous.
- Consider an optional Unity callback journal only if scan performance data
  demonstrates a need.
