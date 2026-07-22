# 0016 Force Is The Guaranteed-Freshness Path

Date: 2026-07-22

## Status

Accepted

## Context

Incremental indexing uses filesystem modification times to avoid reading and
extracting every graph-relevant asset on every run. A synchronization or copy
operation can preserve timestamps even when file contents change, so no
timestamp-only classifier can guarantee detection of that edit.

Guaranteed detection would otherwise require hashing or reparsing all relevant
content. The existing `force: true` option already ignores the previous index
and rebuilds from the current project files, providing that correctness path
without adding another overlapping public option.

## Decision

Keep normal `index_project` incremental and optimized for speed. Define
`force: true` and CLI `--force` as the explicit guaranteed-freshness path.

A force run does not use prior timestamps to decide which assets to parse. It
builds a fresh generated database from the current scan, extracts all supported
references and Addressables data, and atomically publishes the result only
after success.

Do not add a second `guaranteedFreshness` option, content fingerprints, or file
hashes in `0.3.1`. Normal incremental indexing may miss an edit when all
observed freshness metadata is deliberately preserved; users and agents choose
force indexing when that risk matters.

The guarantee is bounded to the readable project snapshot observed during the
completed scan. Concurrent file writes and explicit parse/read warnings can
require another run and do not become silent success guarantees.

## Alternatives Considered

1. Hash every graph-relevant asset during normal indexing. Rejected because it
   removes much of the I/O advantage of the default incremental path and needs
   persistent fingerprint policy.
2. Add a separate `guaranteedFreshness` flag. Rejected because it would overlap
   exactly with the existing full-rebuild behavior of `force`.
3. Compare modification time and file size only. Rejected as a guarantee
   because same-size content can change while both values remain preserved.

## Consequences

Positive:

- The default path remains fast for ordinary Unity and source-control edits.
- Guaranteed freshness is available through an existing MCP and CLI contract.
- No database schema, tool argument, or success-response change is required.
- Users can choose the correctness/cost tradeoff explicitly.

Tradeoffs:

- Guaranteed freshness costs a complete scan, extraction, and database rebuild.
- Default incremental results are not guaranteed after timestamp-preserving
  external synchronization.
- Agents need a separate policy for deciding when to request a force run.

## Follow-Up

- Decide the automatic agent reindex trigger policy separately.
- Add regression proof that incremental can retain a preserved-timestamp result
  while a subsequent force rebuild observes the current references.
- Reconsider fingerprints only if measured full-rebuild cost justifies a third
  freshness mode in a future minor release.
