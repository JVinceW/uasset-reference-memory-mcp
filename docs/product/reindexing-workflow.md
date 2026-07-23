# How Reindexing Works

`index_project` builds the local asset-reference graph from the Unity project
on disk. It is an explicit refresh: query tools use the database that is already
present and do not scan Unity files or reindex automatically. For the full
indexing reference, including scan scope and query behavior, see
[Indexing Behavior](indexing.md).

## The Identity Model

Unity GUIDs are the stable identity of assets. Paths, names, extensions, and
some metadata can change; the GUID in the sibling `.meta` file identifies the
same logical asset across those changes. The index therefore treats an asset
file and its sibling `.meta` as one logical unit and stores one row per GUID.

The index canonicalizes valid GUIDs to lowercase before comparison. It never
generates, copies, changes, or repairs Unity GUIDs. Make identity repairs in
Unity or source control, then run the index again.

## What Happens During index_project

On a successful run, `index_project`:

1. Scans complete asset/`.meta` pairs in the configured project scope.
2. Canonicalizes GUIDs and validates that every asset GUID is unique.
3. Classifies the current scan against the prior index by GUID rather than by
   path.
4. Re-extracts references from changed sources and from sources affected by a
   target change.
5. Refreshes the Addressables rows owned by changed group assets, removing
   stale ownership when a group is removed or ceases to be a group.
6. Writes the result to a temporary schema-3 database.
7. Atomically replaces the prior good database only after the new database has
   completed successfully.

This publication flow protects the previous good index if a run is interrupted
or fails before replacement.

## Incremental And Forced Reindex

Normal `index_project` is incremental. It compares each logical asset's stored
effective timestamp with the current one and reprocesses only changed or
affected content. The effective timestamp is the newer modification time of
the asset file and its `.meta`, so an ordinary edit to either is detected.

Use `force: true` when guaranteed freshness is required. A forced run ignores
prior incremental state and rebuilds the graph-relevant data from the current
project contents. It is appropriate before a high-confidence audit, after
timestamp-preserving file operations, or when a prior run reported warnings.
The guarantee applies to the completed scan; concurrent project writes can
still require a later run after the project is stable.

## How Common Changes Are Classified

| Change on disk | Index result |
| --- | --- |
| Unchanged complete asset and `.meta` pair | Retained without normal re-extraction during an incremental run. |
| Asset-only edit | The logical asset is updated; its outgoing references are re-extracted. |
| Meta-only edit | The logical asset is updated because the `.meta` contributes to its effective timestamp and identity metadata. |
| GUID-preserving move or rename | One GUID is updated at its new path. Incoming references remain attached, while path-derived metadata and affected references are refreshed. |
| Same-path GUID replacement | The old GUID is removed and the new GUID is added. A `guid-replaced` warning identifies the path; references to the missing old GUID remain unresolved. |
| Missing, orphan, or invalid `.meta` | The incomplete logical asset is skipped with a warning. A previously indexed GUID absent from the complete scan is removed until a valid pair returns. |
| Duplicate GUIDs | The run fails with `DuplicateGuidError` before publication. Repair the conflicting metas in Unity or source control and retry. |
| Uppercase GUID in a `.meta` | The GUID is canonicalized to lowercase, so it resolves consistently with serialized references. |
| Existing schema-3 index containing uppercase asset GUIDs | A one-time fresh rebuild creates a canonical lowercase index. It is published atomically and does not report those canonicalization changes as replacements. |
| Existing schema-3 index containing multiple GUIDs at one asset path | A one-time fresh rebuild from current project files removes the obsolete row and reconstructs edges and unresolved references. It uses fresh-build counts and does not report a compatibility-only `guid-replaced` warning. |

## References And Addressables

Reference extraction records outgoing references from text-serialized assets;
incoming references are the reverse graph view. When a target changes in a way
that can affect reference typing or restore a previously unresolved target, the
index re-extracts the affected source assets so edge data remains faithful.

Addressables group assets own their generated groups, entries, labels, and
addresses. A full reindex replaces that generated data. An incremental reindex
replaces rows owned by changed group assets and removes stale membership if a
group disappears or stops being an Addressables group.

## Failure And Recovery

Some file-level conditions are recoverable: the index warns and continues
where it can safely publish a coherent graph. For example, an unparseable YAML
asset still has a node when its `.meta` is valid, but its edges are skipped for
that run. Missing or invalid metas are also warnings, and the incomplete pair
is excluded.

Other conditions prevent safe publication. Duplicate GUIDs stop the run before
the new database replaces the prior good one. A project-wide ForceBinary
setting in `ProjectSettings/EditorSettings.asset` also aborts with guidance to
enable Unity's Force Text serialization setting. In contrast, non-YAML or
binary content in an asset expected to contain YAML produces a
`binary-serialized` warning and skips only that asset's outgoing-reference
extraction. Known non-YAML formats such as textures, models, and audio remain
nodes but are not outgoing-reference candidates. If a run is interrupted,
rerun it; the atomic replacement leaves the previous good index available.
After fixing project files, run normal indexing again, or use `force: true`
when the refreshed result must be guaranteed current.

## Recommended Agent Workflow

1. Run `index_project` once after a coherent batch of asset, meta, rename, or
   Addressables changes.
2. Inspect returned warnings and fix ambiguous project state before relying on
   graph results.
3. Use normal indexing for routine incremental refreshes.
4. Use `force: true` before a guaranteed-fresh audit, after operations that may
   preserve timestamps, or after concurrent edits have settled.
5. Query the graph only after the explicit refresh completes; query tools do
   not silently refresh it.

## Known Limitations

- Incremental freshness depends on observed timestamps. Tools that preserve
  both asset and `.meta` timestamps can evade the fast path; use `force: true`
  in that situation.
- A `.meta` may change between the scanner's read and stat operations during a
  concurrent write. This release intentionally has no retry loop for that
  race; stabilize the project and rerun, using force when freshness matters.
- The index is static and offline. It does not watch files, invoke Unity
  callbacks, or repair project metadata.
