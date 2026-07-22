# 0018 Agent-Managed Index Refresh

Date: 2026-07-22

## Status

Accepted

## Context

Agents need current graph data without paying for a project scan before every
read-only query. The MCP server exposes explicit `index_project` and
`index_status` tools, and the product deliberately has no background watcher.

`index_status` returns metadata stored by the last successful index: schema,
project root, recorded time, counts, and the stored package-lock timestamp. It
does not scan current assets or compare the live filesystem, so it cannot prove
that the graph is fresh.

## Decision

Keep index refresh explicit and agent-managed. Query tools remain read-only and
never invoke indexing implicitly.

An agent performs one incremental `index_project` before its first
graph-dependent operation when freshness has not already been established in
the current task/session. It reuses that successful index for subsequent
queries while it knows no relevant files changed.

After the agent or user completes a coherent batch of asset or `.meta` changes,
the agent runs one incremental refresh before further graph-dependent work. It
does not reindex after every individual edit inside the batch.

The agent uses `force: true` when:

- the user explicitly requests guaranteed freshness;
- a backup, archive, or synchronization may have preserved timestamps;
- the project changed substantially and timestamp freshness is uncertain;
- an incomplete-pair state has stabilized and a guaranteed snapshot is wanted;
  or
- visible Unity state disagrees with incremental graph results.

Normal Git checkout/pull activity starts with incremental indexing unless
timestamp preservation or inconsistency is plausible.

Warnings and failures control retry behavior:

- incomplete or invalid `.meta` warnings are surfaced; the agent does not
  auto-loop while Unity or source control is unstable;
- `guid-replaced` is surfaced as an identity change while indexing succeeds;
- `DuplicateGuidError` stops refresh until the conflicting project state is
  repaired; and
- after any failed refresh, a previous database may be queried only when it is
  clearly described as stale, never as the result of the failed refresh.

## Alternatives Considered

1. Auto-index before every query. Rejected because it adds unpredictable latency
   and repeats full project discovery across a sequence of read-only questions.
2. Refresh only when `index_status` reports stale. Rejected because current
   status metadata does not inspect general live asset changes.
3. Add a background watcher. Deferred because watcher lifecycle, missed events,
   source-control transitions, and recovery require a separate design.

## Consequences

Positive:

- Agents normally start graph work from an incrementally refreshed index.
- Multiple related queries reuse one scan and remain fast.
- Batched edits cause one refresh rather than repeated scans.
- Query calls have no hidden write or latency side effects.

Tradeoffs:

- Correct refresh timing depends on agent instructions and task knowledge.
- External edits unknown to the agent remain possible between refresh and query.
- `index_status` is informational rather than a freshness oracle.
- Guaranteed freshness still incurs a force rebuild.

## Follow-Up

- Include the policy in MCP tool descriptions and user-facing agent setup
  guidance.
- Keep watcher/event-driven indexing deferred unless measured workflows show
  explicit refresh is inadequate.
