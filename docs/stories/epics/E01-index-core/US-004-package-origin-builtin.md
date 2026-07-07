# US-004 Package/origin classification + builtin GUID seeding

## Status

planned

## Lane

normal

## Product Contract

Classify every node's `origin` (`project` | `package` | `builtin`) and
`package_id`, scan `Packages/` and `Library/PackageCache/` as full sources, and
pre-seed built-in Unity assets (sentinel GUIDs) as synthetic nodes so references
to them resolve instead of landing in `unresolved_refs`.

## Relevant Product Docs

- `docs/product/indexing.md` (scan scope + query behavior rules)
- `docs/product/asset-graph-model.md` (`origin`, `package_id`, builtin seeding)

## Acceptance Criteria

- Assets under `Assets/` → `origin='project'`; under `Packages/` and
  `Library/PackageCache/` → `origin='package'` with `package_id` parsed
  (e.g. `com.unity.render-pipelines.universal@14.0.8`).
- Package node identity keys on GUID; version-suffixed PackageCache paths are
  informational only.
- Built-in sentinel GUIDs are seeded as `origin='builtin'` synthetic nodes and
  never appear in `unresolved_refs`.
- A GUID resolving to none of project/package/builtin remains a genuine
  `unresolved_ref`.
- `index_status` can report when `Packages/packages-lock.json` is newer than the
  index.

## Design Notes

- Commands: `classifyOrigin(path)`; `seedBuiltins()`
- Queries: enables `find_unused_assets` project-only rule and per-package overview
- API: extends US-001 scanner output; consumed by US-003 store
- Tables: `assets` (`origin`, `package_id`), interacts with `unresolved_refs`
- Domain rules: unused detection must never report non-project assets
- UI surfaces: none

## Validation

`scripts/bin/harness-cli story update --id US-004 --unit 1 --integration 1 --e2e 0 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | Path → origin/package_id mapping; builtin GUID seeded and resolves; genuine unresolved still flagged |
| Integration | Fixture with a package-style folder + a builtin ref + a broken ref → correct classification |
| E2E | n/a |
| Platform | n/a |
| Release | Part of full suite |

## Harness Delta

Needs a maintained list of built-in Unity sentinel GUIDs; consider a fixture/data
file and note it if it becomes friction.

## Evidence

Add after implementation.
