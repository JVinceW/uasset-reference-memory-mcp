# US-021 ADR management (manage_adr MCP tool + markdown store)

## Status

implemented

## Lane

normal (E09, intake — spec slice)

## Product Contract

Record and query Architecture Decision Records via the MCP server. ADRs are
git-diffable markdown files under `<project>/.asset-memory/adrs/NNNN-slug.md`
(committable, human-readable). Tool `manage_adr(action, ...)` covers
create/list/get/update.

## Acceptance Criteria

- `createAdr` assigns sequential zero-padded ids, writes `NNNN-slug.md`, defaults
  status `Proposed`.
- `listAdrs` → id/title/status; `getAdr` → full content; `updateAdr` patches
  status/fields preserving id; missing id → null.
- MCP `manage_adr(action: create|list|get|update, id?, title?, status?, context?,
  decision?, consequences?)`; works without an index present.

## Design Notes

- `src/adr/adr.ts` — file-backed ADR CRUD (no DB table; committable)
- `src/mcp/{tools,server}.ts` — `manage_adr` tool
- Chose markdown files over a SQLite table for git-diffability + review
  (mirrors this repo's own `docs/decisions/`).

## Validation

`scripts/bin/harness-cli story update --id US-021 --unit 1 --integration 0 --e2e 1 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | sequential ids; list/get/update; missing id → null |
| E2E | manage_adr create/list/update via runTool writes markdown |

## Evidence

- `npm test` — 182 tests pass (incl. `adr` 7).
- **End-to-end** via `runTool`: created two ADRs
  (`0001-adopt-addressables-for-lobby-content.md`, `0002-keep-index-in-project.md`),
  listed both, updated #2 to `Superseded`.

### Note

- ADRs live in `.asset-memory/adrs/` and are meant to be **committed** (unlike the
  live `index.db`).
