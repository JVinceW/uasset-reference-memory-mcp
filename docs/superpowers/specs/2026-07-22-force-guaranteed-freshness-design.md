# Force Guaranteed Freshness Design

Date: 2026-07-22

## Goal

Provide an explicit correctness path for content changes whose filesystem
timestamps are preserved, without slowing every normal incremental index.

## Approved Contract

Normal indexing remains incremental:

```text
index_project(force: false)
```

It reconciles current paths and GUIDs and re-extracts assets whose observable
incremental freshness changed. Timestamp-preserving external edits can evade
this mode.

Guaranteed-freshness indexing uses the existing option:

```text
index_project(force: true)
```

CLI callers use `index <project> --force`. This mode ignores the previous
incremental database, scans the current project, extracts every supported
graph-relevant asset, and publishes a fresh database atomically.

## Why Force Instead Of Fingerprints

The indexer already has an all-content correctness path. A new fingerprint mode
would need to read graph-relevant content, select and version a hash policy,
persist per-asset hashes, and define transitions from older indexes. Reusing
force keeps one fast mode and one unambiguous correctness mode with no public or
storage expansion in `0.3.1`.

Opaque binary file contents are not reference-extracted today, while their
`.meta` files provide Unity identity/importer information. A force run still
rescans their nodes and metadata; guaranteed freshness refers to all information
the current graph model supports, not semantic inspection of arbitrary binary
formats.

## Guarantee Boundary

A successful force result reflects the readable project state observed during
that scan. It does not promise a transaction over a Unity project being edited
concurrently. Existing warnings for unreadable or unparseable individual assets
remain visible, and callers can rerun after the project becomes stable.

The temporary database and atomic publication continue preserving the previous
live index when the force build fails before publication.

## Validation Contract

- Index a YAML source and its reference edge.
- Change the referenced GUID in the YAML while restoring both asset and `.meta`
  timestamps to their original values.
- Confirm a normal incremental run can report the asset unchanged and retain
  the previous edge.
- Run `force: true` and confirm the rebuilt graph contains the new edge and not
  the old edge.
- Confirm the equivalent CLI `--force` path invokes the same behavior.
- Confirm force failure preserves a previously published database.
- Existing incremental, move, replacement, duplicate-validation, Addressables,
  and atomic-swap behavior remains green.

## Compatibility And Scope

No new flag, warning kind, response field, database table, schema version, or
hash dependency is introduced. The work is contract clarification and
regression coverage for the existing force behavior, targeted for `0.3.1`.

Automatic agent choice between incremental and force indexing is the next
separate decision. Watchers, Unity editor callbacks, and persistent content
fingerprints remain deferred.
