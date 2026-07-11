# US-023 Unity Exporter and Index Verification

## Status

implemented

## Lane

normal (E03 verification)

## Product Contract

Provide an optional, manually triggered accuracy harness. A separately
installable Unity Editor package exports direct Unity dependencies as
GUID-bearing `verify.json`; Node compares unique asset-GUID pairs against the
SQLite graph through both CLI and MCP.

The complete diff is written to `.asset-memory/verify-report.json`; callers
receive only a bounded summary and report path. Differences do not fail the
command. Invalid input, no index, or report-write failure does.

## Acceptance Criteria

- UPM package id is `com.jvincew.assetreferencememory` and its assembly is
  Editor-only.
- Export JSON has `schemaVersion: 1`, a UTC timestamp, asset GUIDs, and
  dependency `{ path, guid }` objects.
- `verify-index <project> --verify <verify.json> [--db <index.db>] [--out <report.json>]`
  returns `0` on a completed diff and `1` for an operational or input failure.
- MCP exposes `verify_index(verifyJsonPath)` and returns a bounded summary with
  `reportPath`.
- Comparisons deduplicate parser reference-site rows into GUID pairs and group
  results by source asset type, origin, and ref kind.
- `verify_last_run` updates only after the complete report is written.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | JSON validation; clean/missed/extra GUID-pair comparison; unresolved rows; bounded summary; metadata timing |
| Integration | CLI and MCP invoke the shared runner and write the report |
| Package | npm build remains intact; UPM manifest and asmdef parse |
| Platform | Import the UPM package into a real Unity project, run the menu item, then run `verify-index` against its output |

## Evidence

- `npm test` - 195 tests pass, including parser validation, GUID-pair diff,
  report persistence, CLI, MCP, and Unity package-shape coverage.
- `npm run typecheck` and `npm run build` pass.
- Root and Unity-package `npm pack --dry-run` pass; the Unity artifact is a
  separate UPM/npm-compatible package rather than part of the Node tarball.
- Unity Editor import/menu execution remains a manual platform proof. It is
  tracked in `docs/TEST_MATRIX.md` and was not claimed as executed here.
