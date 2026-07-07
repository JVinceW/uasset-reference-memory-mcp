# US-001 Project scan + GUID map + asset nodes

## Status

implemented

## Lane

normal

## Product Contract

Given a Unity project root, the indexer walks the project, reads every `.meta`
file, and produces one asset node per asset with a resolved
`GUID → {path, name, asset_type, origin, package_id, file_size, mtime, is_binary}`.
This is the `meta-scanner` component and the foundation every other story builds
on.

## Relevant Product Docs

- `docs/product/indexing.md`
- `docs/product/asset-graph-model.md` (the `assets` table)

## Acceptance Criteria

- Every `.meta` under `Assets/`, `Packages/`, and `Library/PackageCache/` yields
  exactly one asset node keyed by GUID.
- `asset_type` is derived from extension + importer type and covers the enum in
  `asset-graph-model.md` (unmapped → `Other`).
- Folders produce nodes.
- `is_binary` is set correctly (text-serializable assets vs binary assets like
  `.png`/`.fbx`).
- A `.meta` without its asset file, and an asset file without a `.meta`, are each
  recorded in the warnings list, not crashes.
- `mtime` and `file_size` are captured for incremental re-index and cleanup
  sorting.

## Design Notes

- Commands: `scan(projectRoot) -> AssetNode[]`
- Queries: none yet (write path only)
- API: internal component boundary consumed by US-003 store
- Tables: `assets`
- Domain rules: GUID is the identity; path is informational for packages
- UI surfaces: none

## Validation

`scripts/bin/harness-cli story update --id US-001 --unit 1 --integration 1 --e2e 0 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | Fixture `.meta` files → correct `asset_type`/`origin`; missing-meta/orphan-meta warnings |
| Integration | Fixture project scan yields expected node count + types |
| E2E | n/a (no MCP tool yet) |
| Platform | n/a |
| Release | Part of full suite |

## Harness Delta

Establishes the fixture Unity project used by later integration tests.

## Evidence

- `npm test` — 45 tests pass across 4 files (`meta-parse`, `asset-type`,
  `origin` unit tests; `meta-scanner` integration over a real temp fixture tree).
- `npm run typecheck` — clean (`tsc --noEmit`).
- Durable proof recorded: `story verify US-001` = pass; unit=1, integration=1.
- Modules: `src/indexer/{meta-parse,asset-type,origin,meta-scanner,types}.ts`.

### Boundary notes carried to later stories

- `origin` is minimal here (project vs package by path prefix). **US-004** adds
  `package_id` parsing and pre-seeded `builtin` nodes.
- `Sprite` vs `Texture` is not yet split (images map to `Texture`); refine via
  `TextureImporter` sprite mode when needed.
- `isBinary` encodes "not a scannable YAML asset" per the schema's documented
  meaning, so `.cs`/`.shader` are `isBinary=true` (no guid refs to scan).
