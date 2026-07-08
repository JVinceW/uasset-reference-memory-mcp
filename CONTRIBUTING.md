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
