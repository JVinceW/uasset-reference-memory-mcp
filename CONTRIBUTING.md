# Contributing

## Branching strategy

```
  planning  ──(merge)──►  main  ◄──(merge PR)──  feat/<item>   (cut from main)
 (long-lived,             (stable,               (short-lived,
  docs & planning)         integration+release)   one per plan item)
```

### `main`
Stable integration branch. Everything merges here; releases are cut from here.
Always green (tests pass).

### `planning` — long-lived, **never deleted**
All **docs and planning** work happens here: roadmap, specs, design notes,
decisions, story shaping. Merge `planning` → `main` when a planning slice is
ready. Keep it fresh by periodically merging `main` back in
(`git checkout planning && git merge main`) so it doesn't drift.

### `feat/<item>` — short-lived implementation branches
When implementing, **cut from `main`**, pick a plan item from
[`docs/ROADMAP.md`](docs/ROADMAP.md), build it, then open a PR back to `main`.
Delete the branch after merge. Name by the item, e.g. `feat/E08-ci-cd`,
`feat/E09-adr`, `feat/E10-json-snapshot`.

### `release/*` — triggers publish (planned, E08)
Once CI is set up, pushing to `release/*` runs tests and publishes to npm.

## Typical flows

**Planning**
```bash
git checkout planning
# edit docs/ROADMAP.md, add specs/design notes...
git commit -am "plan: ..."
git checkout main && git merge planning        # (or via PR)
```

**Implementing a roadmap item**
```bash
git checkout main && git pull
git checkout -b feat/E10-json-snapshot
# implement + tests (npm test must pass)
# open PR -> main, merge, delete branch
```

## Before merging to `main`
- `npm test` green
- `npm run typecheck` clean
- `npm run build` succeeds

## CI/CD (GitHub Actions)

- **CI** (`.github/workflows/ci.yml`): typecheck + test + build on Node 20 & 22,
  for pushes to `main`/`planning`/`feat/**`/`release/**` and PRs to `main`.
- **Release** (`.github/workflows/release.yml`): on push to `release/**` (or
  manual dispatch), runs CI then `npm publish` **if `package.json`'s version is
  new** (skips otherwise).

### Releasing

Select the next version from the changes since the latest published tag using
Semantic Versioning (`MAJOR.MINOR.PATCH`):

| Change | Version bump | Example |
| --- | --- | --- |
| Backward-compatible bug fixes only; no new public tools or schema changes | PATCH | `0.3.0` -> `0.3.1` |
| New backward-compatible capability, public MCP tool, or additive schema behavior | MINOR | `0.3.1` -> `0.4.0` |
| Breaking public API or schema contract while the project is `0.x` | MINOR, with an explicit upgrade note | `0.4.0` -> `0.5.0` |
| Breaking public API after the project declares `1.0.0` stability | MAJOR | `1.4.2` -> `2.0.0` |

Do not reuse or replace a version already published to npm. If one release
contains both fixes and a new capability, choose the larger applicable bump.
When the correct category is ambiguous, pause and ask the release owner before
editing `package.json`, creating a tag, or publishing.

1. Bump `version` in `package.json` (and update any changelog).
2. Push to a `release/*` branch (e.g. `git push origin main:release/0.1.2`).
3. The Release workflow publishes to npm.

**One-time setup:** add a repo secret **`NPM_TOKEN`** — an npm **Automation**
(granular) token with publish permission and **bypass-2FA** enabled (CI can't do
interactive OTP). GitHub → repo Settings → Secrets and variables → Actions.
