# Duplicate GUID Validation Design

Date: 2026-07-22

## Goal

Prevent the indexer from publishing an arbitrary or incomplete graph when one
Unity asset GUID occurs at multiple project paths.

## Current Failure Mode

`scanProject` returns one node for each asset/`.meta` pair without checking GUID
uniqueness. `buildResolver` stores nodes in a `Map` keyed by GUID, and
`GraphStore.upsertNodes` writes them into a table whose primary key is GUID.
Both operations silently keep only one duplicate. Which path survives can
depend on traversal order, and reference extraction cannot disambiguate because
serialized Unity references contain only the GUID and file ID.

## Approved Design

Add an index-boundary validation step after `scanProject` returns and before the
resolver or graph store receives scanned nodes. The boundary is authoritative
even when tests or another caller inject a custom scan implementation.

Validation groups all scanned nodes by GUID, then includes the synthetic
built-in nodes as reserved identities. Every group must contain exactly one
path. Any group with more than one path becomes a collision.

If collisions exist, throw `DuplicateGuidError` containing structured collision
data equivalent to:

```text
Array<{
  guid: string;
  paths: string[];
}>
```

Both the collision list and each path list are sorted lexicographically. The
human-readable message identifies the GUIDs, lists their paths, explains that
each Unity asset needs a unique `.meta` GUID, and tells the user to repair the
conflicting `.meta` file before reindexing.

## Failure And Recovery

Duplicate GUIDs are fatal for normal and force indexing. Validation occurs
before reference extraction and before asset upserts. The surrounding cleanup
path closes and removes the temporary database. If an earlier live index
exists, atomic publication leaves it unchanged; if none exists, no index is
published.

The tool does not select a winner, ignore a path, regenerate a GUID, or mutate
the Unity project. Project repair remains an explicit user or Unity Editor
operation.

## Scope Details

Validation covers nodes scanned from:

- `Assets/`;
- `Packages/`;
- `Library/PackageCache/`; and
- collisions between scanned nodes and reserved built-in GUIDs.

Two different GUIDs occupying paths across time are not duplicates; they follow
the same-path replacement decision. One GUID found at one new path across time
is a move. Duplicate validation concerns multiple paths in the same completed
scan only.

## Validation Contract

- Two `Assets/` paths with one GUID throw `DuplicateGuidError` listing both
  sorted paths.
- Three paths across project and package roots report one collision containing
  all three paths.
- Multiple duplicated GUIDs are all reported in sorted order in one failure.
- A scanned path using a reserved built-in GUID fails explicitly.
- `force: true` does not bypass validation.
- An incremental failure leaves the previous database byte-for-byte usable and
  queryable.
- A failed fresh build does not publish the requested database.
- Unique-GUID add, update, removal, move, replacement, and full rebuild behavior
  remains green.

## Compatibility And Scope

The change adds an exported error class but no MCP/CLI argument, success-response
field, database column, or schema version. It is a backward-compatible
correctness fix targeted for `0.3.1`.

This design does not automatically repair GUIDs, attempt to reproduce Unity's
choice of a duplicate, add content hashing, change agent reindex triggers, or
introduce filesystem and Unity editor watchers.
