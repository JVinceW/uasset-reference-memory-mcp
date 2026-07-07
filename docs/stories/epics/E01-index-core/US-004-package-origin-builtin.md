# US-004 Package/origin classification + builtin GUID seeding

## Status

implemented

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

- `npm test` — 88 tests pass (12 files). New: `packages` (parsePackageId,
  BUILTIN_NODES), scanner `package_id` assertion, `index-project-builtins`
  (builtin refs resolve to edges not unresolved; builtins persist across
  incremental; `packages_lock_mtime` recorded).
- `npm run typecheck` clean; `npm run build` ok.
- **End-to-end** on the fixture: pointing `body.mat`'s `m_Shader` at the real
  sentinel guid `0000000000000000f000000000000000` → `unresolved: 0` (was 1),
  origin breakdown `builtin 2 / package 1 / project 8`, edge
  `body.mat → unity_builtin_extra (builtin, SERIALIZED_REF)`, `Widget.asset`
  `package_id = com.acme.tools`, `packages_lock_mtime` present in `index_meta`.

### Notes / boundaries

- Builtins are stored as infrastructure nodes (origin=builtin), resolvable and
  never removed on incremental, but **excluded from the user-facing change
  counts** (added/updated/removed/unchanged track real assets only).
- Builtin refs type as `SERIALIZED_REF` because a builtin guid holds many object
  types and we model at GUID granularity (no fileID→type map). Acceptable;
  documented.
- `package_id` is parsed from the path segment (PackageCache carries `@version`;
  embedded `Packages/` gives the bare name). Not enriched from `package.json`.
- `index_status` staleness check itself lands in E02; US-004 records
  `packages_lock_mtime` so that tool can compare.
- Follow-up logged (backlog): `Packages/` root non-assets (`packages-lock.json`,
  `manifest.json`) are flagged `missing-meta`.
