# US-014 Per-project config file (.asset-memory/config.json)

## Status

implemented

## Lane

normal (intake #5)

## Product Contract

A per-project `.asset-memory/config.json` (co-located with the index) holding
options like `unused.addressableRoots`. Absent/invalid config falls back to
documented defaults; unknown keys and bad values are ignored. This is the config
surface for the open-source, multi-project tool.

## Relevant Product Docs

- `docs/product/configuration.md`

## Acceptance Criteria

- `parseConfig(json)` merges over `DEFAULT_CONFIG`, validates `addressableRoots`
  (`auto`/`on`/`off`), tolerates malformed JSON and unknown keys.
- `loadConfig(path)` reads the file or returns defaults.
- `configPathFor(dbPath)` = `<index dir>/config.json`.
- Default `unused.addressableRoots = "auto"`.

## Design Notes

- `src/config/project-config.ts`

## Validation

`scripts/bin/harness-cli story update --id US-014 --unit 1 --integration 0 --e2e 0 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | parse valid/invalid/malformed/unknown; configPathFor |

## Evidence

- `npm test` — `config/project-config` (6 tests) pass in the full suite (144).
- Consumed by US-015 (`find_unused_assets`) for the per-project default.
