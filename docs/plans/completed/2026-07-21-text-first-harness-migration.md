# Execution Plan: Text-First Harness Migration

Date: 2026-07-21

## Status

Completed

## Outcome

Removed the obsolete local Harness SQLite/CLI compatibility layer and made the
current Git-native workflow the repository default.

## Context

`AGENTS.md`, `docs/HARNESS.md`, the former Harness schema under
`scripts/schema/`, and `docs/decisions/0009-text-first-harness.md`.

## Scope

In scope:

- Text-first workflow, execution-plan structure, and agent entrypoints.
- Removal of tracked legacy CLI/schema/process artifacts.
- Recoverable removal of ignored local CLI/database files.

Out of scope:

- Product SQLite index format and application dependencies.
- Changes to implemented story packets or product behavior.

## Approach

1. Installed the current text-first documentation core.
2. Replaced legacy agent instructions and removed obsolete tracked compatibility files.
3. Moved ignored local compatibility state outside the repository.
4. Checked active documentation for stale mandatory control-plane references.

## Risks And Recovery

- Historical decision records remain available in Git.
- The removed local `harness.db`, CLI executable, and empty `.harness` state are
  recoverable from `%TEMP%\uasset-reference-memory-mcp-harness-legacy-20260721`.

## Progress

- [x] Capture legacy state and source-of-truth decision.
- [x] Install text-first workflow core.
- [x] Remove tracked compatibility artifacts.
- [x] Move ignored local state to recoverable backup.
- [x] Verify documentation and project checks.

## Decisions

- 2026-07-21: Repository documents and Git history replace the local operational database as Harness authority.

## Validation

- Focused proof: no stale active-workflow CLI/database references outside retained historical decisions.
- Repository-required checks: `npm test`, `npm run typecheck`, and `npm run build` passed.

## Result

The repository now follows the text-first workflow. The product's SQLite asset
index remains unchanged; only the retired Harness operational database and CLI
surface were removed.
