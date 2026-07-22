# 0017 Follow Unity's Incomplete Asset-Pair Workflow

Date: 2026-07-22

## Status

Accepted

## Context

A Unity asset's identity comes from the GUID in its sibling `.meta` file. During
an import, source-control update, external move, or accidental deletion, the
indexer can observe an asset without `.meta`, `.meta` without an asset, or a
pair whose `.meta` does not contain a valid GUID.

These states can be temporary, but the indexer cannot reconstruct trustworthy
identity from either physical half alone. Unity may later generate a new
`.meta`, producing a new identity and breaking references to the former GUID.
The project already treats incomplete pairs as hygiene warnings rather than
blocking all otherwise useful indexing.

## Decision

Unity's asset identity workflow is authoritative. The indexer observes and
reports Unity identity state; it never invents, copies, regenerates, or silently
repairs GUIDs or `.meta` files.

Continue indexing complete logical assets while handling incomplete identity as
follows:

- asset without `.meta`: emit `missing-meta` and create no node;
- `.meta` without asset: emit `orphan-meta` and create no node; and
- pair with no parseable GUID: emit `invalid-meta` and create no node.

If a previously indexed GUID is absent from the complete current GUID set,
normal removal processing applies: demote incoming edges, remove its outgoing
data and Addressables ownership, and delete its node. Do not preserve the old
GUID merely because one physical half remains at its former path.

When a complete pair later appears, classify it against the immediately prior
successful index using the normal global rules. If an intervening incomplete
run already removed the former GUID, restoring that GUID or receiving a newly
generated GUID is an addition; unresolved incoming references to a restored
GUID are promoted normally. A direct old-GUID-to-new-GUID transition without an
intervening indexed gap remains a same-path replacement.

Incomplete-pair warnings do not fail normal or force indexing. A caller that
observes them should wait for Unity or source control to stabilize and reindex;
`force: true` provides guaranteed freshness once the project is stable.

## Alternatives Considered

1. Preserve the previous node while one physical half remains. Rejected because
   it knowingly publishes an identity and relationships no longer supported by
   a complete current pair.
2. Fail the entire index on any incomplete pair. Rejected for `0.3.1` because
   it would block useful results during common transient states and break the
   existing warning contract.
3. Generate or copy a GUID automatically. Rejected because project mutation is
   Unity/user authority and guessing can corrupt serialized references.

## Consequences

Positive:

- Index behavior follows Unity's GUID and `.meta` ownership model.
- Complete assets remain queryable despite unrelated hygiene warnings.
- The tool never mutates the source Unity project during indexing.
- Existing warning response shapes and schema 3 remain unchanged.

Tradeoffs:

- Indexing during a temporary half-written state can briefly publish a removal.
- Callers must inspect warnings and rerun after Unity or source control settles.
- A skipped new asset remains undiscoverable until it has a valid `.meta` pair.

## Follow-Up

- Add incremental proof for each incomplete-pair warning and subsequent
  recovery through move, replacement, or addition.
- Let the separate agent-trigger policy decide when warnings should cause an
  automatic retry or user-facing reindex recommendation.
