# 0009 Text-First Harness

Date: 2026-07-21

## Status

Accepted

## Context

The installed Harness CLI and SQLite schema are an incompatible historical
compatibility surface. The project already keeps product contracts, stories,
decisions, validation evidence, and Git history as text.

## Decision

Use the current repository-centered Harness workflow. `AGENTS.md`,
`docs/WORKFLOW.md`, product documentation, execution plans, decisions, code,
tests, and Git history are the authoritative process record. Remove the local
Harness executable, database schema, database lifecycle, durable matrix, trace,
and tool-registry requirements.

## Consequences

- No local Harness installation or schema migration is needed for ordinary work.
- Complex work uses one Git-tracked execution plan.
- Existing story packets and decision records remain historical evidence.
- Decisions 0004 and 0005 are superseded for workflow operation; they remain as
  historical records and do not authorize restoring the SQLite layer.
