# Reindex Documentation Design

**Date:** 2026-07-23
**Status:** Approved direction; artifact production pending review

## Goal

Explain the v0.3.1 reindex behavior at three levels without duplicating the
existing indexing reference:

1. A practical repository guide for users and agents.
2. A short Discord announcement ready to paste after release.
3. A blog-writing brief that gives the author the problem, narrative, and
   technical facts while leaving the final prose to them.

The implementation and completed execution plan are the source of truth. The
documents must not claim that v0.3.1 has been published while `package.json`
still reports `0.3.0`.

## Artifacts

### `docs/product/reindexing-workflow.md`

A practical guide organized around decisions and observable behavior:

- What a reindex is and what data it rebuilds.
- Unity's identity rule: GUID is stable identity; path is mutable metadata.
- Default incremental indexing versus `force: true`.
- The scan, validation, reconciliation, edge extraction, and atomic publication
  lifecycle.
- A case table for unchanged assets, asset-only and meta-only edits, moves,
  replacements, incomplete pairs, duplicate GUIDs, uppercase GUIDs, and legacy
  uppercase indexes.
- How incoming references, outgoing references, and Addressables ownership are
  handled.
- Recommended agent refresh workflow.
- Known timestamp-preserving and concurrent `.meta` read limitations.
- A link back to `docs/product/indexing.md` for the deeper technical reference.

### `docs/releases/v0.3.1-discord.md`

Short, ready-to-paste Markdown with:

- A release header.
- One-sentence summary.
- Highlights and reliability-fix bullets.
- A short usage note distinguishing incremental refresh from guaranteed
  freshness.
- No internal implementation details or unverified release claims.

Because publication is still pending, the file will label itself as release
copy and include a maintainer note outside the paste-ready block stating that it
should be posted after the package version is bumped and released.

### `docs/releases/v0.3.1-reindex-blog-brief.md`

A concise author brief rather than a finished blog post:

- Suggested thesis and audience.
- The original pain: filesystem/path-based discovery and stale indexes make
  asset migrations and Addressables investigation unreliable.
- Why reindexing is deceptively difficult in Unity.
- Representative failure cases.
- The adopted model and implementation journey.
- Trade-offs: timestamp speed versus forced freshness, schema preservation, and
  the deferred concurrent read/stat race.
- Suggested article outline, diagrams/examples the author may add, and a fact
  checklist.

## Boundaries

- Documentation only; no code, schema, package version, or release operation.
- Do not describe watchers, Unity callbacks, or analytics as implemented.
- Keep the product guide durable and neutral; keep promotional language in the
  Discord artifact only.
- Keep the blog brief factual and modular so the author can supply their own
  voice, anecdotes, and conclusions.

## Validation

- Cross-check behavior against `docs/product/indexing.md`, the completed
  v0.3.1 execution plan, and current tests.
- Scan for placeholders and contradictory incremental/force claims.
- Ensure the Discord copy is short and independently pasteable.
- Ensure the blog brief contains a coherent problem-to-solution narrative but
  is not written as a finished article.
- Run `git diff --check`.
