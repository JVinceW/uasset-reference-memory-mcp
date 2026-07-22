# Unity Incomplete Asset-Pair Handling Design

Date: 2026-07-22

## Goal

Keep indexing useful when a Unity asset/`.meta` pair is incomplete while never
guessing or mutating Unity asset identity.

## Authority Rule

Unity's asset workflow owns asset identity. One indexable logical asset requires
an asset path plus a sibling `.meta` containing one parseable GUID. The indexer
is an observer of that pair, not a repair tool.

It must never:

- invent or regenerate a GUID;
- copy a previous GUID into a current `.meta`;
- move, delete, or rewrite an asset or `.meta`; or
- preserve identity solely from path continuity.

## Approved Classification

The scanner retains its existing warning vocabulary:

| Physical state | Warning | Node |
| --- | --- | --- |
| Asset only | `missing-meta` | None |
| `.meta` only | `orphan-meta` | None |
| Pair with invalid GUID | `invalid-meta` | None |
| Complete pair with valid GUID | None for pair integrity | One logical node |

Warnings are returned with the index result. They do not prevent other complete
nodes from being indexed and do not fail `force: true`.

## Incremental Data Flow

1. Scan all configured Unity roots and collect complete nodes plus warnings.
2. Validate uniqueness among the complete current GUID set.
3. Reconcile moves and unchanged/updated stable GUIDs.
4. Treat each previous non-built-in GUID absent from the complete current set as
   removed, even when an incomplete physical half remains at the old path.
5. Publish the current graph and warnings through the normal atomic build.
6. On a later run, reconcile any restored complete pair by its observed GUID.

An incomplete pair therefore does not create a third persistent asset state.
The graph contains only currently complete identities; warnings carry the
physical hygiene signal.

## Recovery Examples

- A missing `.meta` is later restored with its old GUID at the same path: add
  that GUID again and promote unresolved incoming references.
- A missing `.meta` is regenerated with a new GUID at the same path: add the new
  GUID if an intervening incomplete run removed the old one; otherwise a direct
  old-to-new observation follows same-path replacement.
- An asset and its old `.meta` reappear together at another path: reconcile the
  stable GUID according to the current previous index; if an intervening run
  removed it, it is added and existing unresolved references are promoted.
- An orphan `.meta` disappears permanently: no additional graph change is
  needed after the old GUID has been removed.

## Failure Boundary

Incomplete pairs themselves remain warnings. Actual filesystem read failures,
duplicate GUID ambiguity, whole-project binary serialization, storage errors,
and other established fatal conditions retain their own behavior.

The returned warning is the caller's signal that indexing may have observed a
temporary project state. Once Unity/import/source-control activity is stable, a
normal rerun reconciles ordinary changes; a force run rebuilds a guaranteed
fresh snapshot of all supported readable content.

## Validation Contract

- A new asset without `.meta` emits `missing-meta`, creates no node, and does
  not block complete assets.
- An orphan `.meta` emits `orphan-meta`, creates no node, and does not block
  complete assets.
- A complete pair with an invalid GUID emits `invalid-meta` and creates no node.
- Losing `.meta` from a previously indexed asset removes its old GUID and
  demotes incoming references while returning `missing-meta`.
- Losing the asset but retaining `.meta` removes its old GUID and returns
  `orphan-meta`.
- Restoring the old GUID promotes unresolved references; receiving a new GUID
  follows replacement/addition rules.
- `force: true` preserves the warning/skip policy and never rewrites the Unity
  project.
- Existing move, replacement, duplicate, and atomic-publication behavior remains
  green.

## Compatibility And Scope

The approved behavior preserves existing warning kinds, public result shapes,
schema 3, and project read-only indexing. The work is contract clarification
and regression coverage targeted for `0.3.1`.

Automatic retry policy, Unity editor callbacks, filesystem watchers, and
project repair commands remain outside this decision.
