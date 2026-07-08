# US-022 CI/CD GitHub Actions (CI + npm release on release/*)

## Status

implemented

## Lane

normal (E08, intake — spec slice)

## Product Contract

Automated CI on push/PR and automated npm publish on `release/*` branches.

## Acceptance Criteria

- `ci.yml`: on push to `main`/`planning`/`feat/**`/`release/**` and PRs to `main`
  → matrix Node 20 & 22 → `npm ci`, typecheck, test, build.
- `release.yml`: on push to `release/**` (or manual) → CI steps → `npm publish
  --provenance` only if `package.json` version is not already on npm. Auth via
  `NPM_TOKEN` secret (automation token, bypass 2FA); `id-token: write` for
  provenance.
- README CI + npm badges; CONTRIBUTING documents the release flow + secret.

## Design Notes

- `.github/workflows/ci.yml`, `.github/workflows/release.yml`
- Config only (no unit tests — verified by the workflow running on GitHub).
- Version guard avoids republish errors on re-pushed release branches.

## Validation

`scripts/bin/harness-cli story update --id US-022 --unit 0 --integration 0 --e2e 1 --platform 1`

| Layer | Expected proof |
| --- | --- |
| Platform | Workflow YAML parses; CI runs green on GitHub after push |
| E2E | Release workflow publishes a new version when version bumps |

## Evidence

- Both workflow YAML files parse (pyyaml `safe_load` ok).
- Local `npm test`/`typecheck`/`build` (what CI runs) green: 182 tests.
- CI triggers on the merge-to-main push; run observed via `gh run`.

### Follow-up

- Add the `NPM_TOKEN` repo secret to enable the Release workflow.
- Optional: create a `v*` git tag + GitHub Release in `release.yml`.
