# 0015 Fail On Duplicate Asset GUIDs

Date: 2026-07-22

## Status

Accepted

## Context

Unity references an asset through the GUID stored in its `.meta` file. If the
same GUID appears at multiple scanned paths, a reference containing that GUID
cannot identify which physical asset was intended.

The current indexer does not validate this invariant. Its resolver stores one
asset type per GUID and silently keeps the last node encountered. SQLite also
uses `assets.guid` as the primary key, so sequential upserts silently replace
one conflicting path with another. The resulting graph can therefore depend on
filesystem traversal order while appearing valid.

## Decision

Require every scanned asset GUID to identify exactly one path. Validate GUID
uniqueness immediately after scanning and before building the resolver,
extracting references, or upserting nodes.

If any GUID occurs at multiple paths, fail the entire index with a dedicated
`DuplicateGuidError`. The error reports every conflicting GUID and all of its
paths in deterministic sorted order. It includes conflicts across `Assets/`,
`Packages/`, and `Library/PackageCache/`, as well as a scanned asset using a
reserved synthetic Unity built-in GUID.

Duplicate-GUID failure is not downgraded to a warning and `force: true` does not
bypass it. The existing temporary database and atomic swap preserve a prior
live index; a fresh failed build does not publish a database.

## Alternatives Considered

1. Warn and choose the first or last path. Rejected because the chosen asset
   would depend on scan ordering and references could resolve incorrectly.
2. Skip all conflicting paths and continue. Rejected because it would publish
   a knowingly incomplete graph and falsely treat every reference to the GUID
   as missing.
3. Store both paths under a composite GUID/path key. Rejected because Unity
   references contain the GUID, not a project-relative path, so the ambiguity
   would remain while requiring a breaking schema and query-model change.

## Consequences

Positive:

- The graph never silently chooses between ambiguous Unity identities.
- Failures contain actionable paths for repairing copied or conflicting
  `.meta` files.
- Results become independent of filesystem traversal order.
- No database schema or public tool arguments change.

Tradeoffs:

- Indexing remains unavailable until the project or package conflict is fixed.
- A force rebuild cannot recover from duplicate GUIDs because it observes the
  same invalid identity mapping.
- One invalid package can block indexing the whole project, which is required
  because project assets may reference that package GUID.

## Follow-Up

- Add duplicate validation and atomic-preservation proof to the combined
  `0.3.1` implementation plan.
- Document the repair workflow without automatically rewriting `.meta` files.
