# US-016 Configurable scan ignore-list (scan.ignore + ignoreDefaults)

## Status

implemented

## Lane

normal (intake #6)

## Product Contract

Let users shape which files/folders the scanner ignores via
`.asset-memory/config.json`: `scan.ignore` (glob patterns, added to built-ins)
and `scan.ignoreDefaults` (keep the built-in Unity rules). Applied at index time.

## Relevant Product Docs

- `docs/product/configuration.md`

## Acceptance Criteria

- `scan.ignore`: string[] of globs matched against entry base name and
  project-relative path; `*` = non-separator run, `**` = separator-spanning.
- `scan.ignoreDefaults` (default true): apply built-in Unity ignore rules;
  `false` uses only user patterns.
- Ignored entries produce no node, no warning, and no recursion.
- Indexing loads project config and applies the predicate; injectable scan
  signature preserved for tests.

## Design Notes

- `src/config/glob.ts` — `matchesAnyGlob` (name/path, `*`/`**`)
- `src/config/project-config.ts` — `scan` section (validated, defaults)
- `src/indexer/meta-scanner.ts` — `IgnorePredicate`, `buildIgnore`, scanProject
  takes an ignore predicate
- `src/indexer/index-project.ts` — loads config, passes `buildIgnore(config.scan)`

## Validation

`scripts/bin/harness-cli story update --id US-016 --unit 1 --integration 1 --e2e 1 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | glob matcher; config parse; buildIgnore (defaults on/off + user) |
| Integration | scanProject skips a user-pattern match (no node/warning) |
| E2E | Real project config drops an ignored folder |

## Evidence

- `npm test` — 155 tests pass (incl. `glob` 5, `scan-ignore` 3, config `scan` 3).
- **Real project**: config `{"scan":{"ignore":["**/StompyRobot/**","*.bak"]}}`
  dropped all 347 `StompyRobot` assets (20,515 → 20,168) on re-index.
- `docs/product/configuration.md` documents both keys and the index-time caveat.
