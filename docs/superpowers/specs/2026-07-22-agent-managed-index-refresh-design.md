# Agent-Managed Index Refresh Design

Date: 2026-07-22

## Goal

Give agents a predictable way to obtain current Unity asset graph data without
hidden indexing or redundant scans before every query.

## Authority And Boundaries

`index_project` is the only operation that establishes a refreshed graph.
`index_status` reports stored state and does not inspect the current project.
All search, traversal, Addressables, overview, unused-asset, and export query
tools operate on the currently published database without triggering writes.

The server does not run a background watcher. Refresh timing belongs to the
calling agent or user.

## Approved Agent State Machine

```text
freshness unknown
  -> incremental index
  -> graph fresh for known task state
  -> reuse across read-only queries

known asset/meta edits
  -> finish coherent edit batch
  -> incremental index
  -> continue graph work

guaranteed freshness required
  -> force index
  -> continue graph work
```

The agent does not index between queries when no relevant files changed and
does not index after each individual edit within one coherent batch.

## Force Selection

Incremental refresh is the normal first choice. Force refresh is selected for:

- an explicit user request;
- timestamp-preserving restore or synchronization risk;
- substantial external change with uncertain filesystem freshness;
- a stabilized incomplete-pair episode where a guaranteed snapshot is needed;
  or
- observed disagreement between Unity state and incremental results.

Ordinary Git operations do not automatically require force. Start incremental
unless the specific operation may have preserved timestamps or results disagree.

## Warning And Failure Flow

- Return and surface incomplete-pair and invalid-meta warnings. Do not poll or
  retry indefinitely; wait for the external operation to settle.
- Surface `guid-replaced` as a successful identity transition.
- Treat `DuplicateGuidError` as repair-required and stop refresh attempts.
- If refresh fails while a prior database exists, explicitly label any query of
  that database as stale. Do not imply the failed refresh published data.

## Documentation And Tool Guidance

User-facing setup and MCP tool descriptions must state:

- run incremental indexing before first graph work when freshness is unknown;
- refresh once after a batch of asset changes;
- reserve force for guaranteed freshness;
- `index_status` is informational only; and
- query tools never auto-index.

This wording prevents agents from treating `indexedAt` or the stored
`packagesLockMtime` as proof that no live asset changed.

## Validation Contract

- Product and MCP documentation describe identical refresh rules.
- `index_status` tests continue proving stored metadata only; no filesystem scan
  is introduced.
- Query-tool tests verify they do not dispatch `index_project` implicitly.
- `index_project` remains the sole MCP path that calls the indexer.
- Tool descriptions distinguish incremental refresh from force guarantee.
- No watcher, timer, polling loop, or background process is introduced.

## Compatibility And Scope

The policy changes guidance and tool descriptions without adding an MCP tool,
argument, response field, database table, schema version, or automatic write.
It is compatible with the `0.3.1` release target.

Watcher/event-journal integration remains case 15 and is not required for this
policy.
