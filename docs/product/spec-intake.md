# Spec Intake

Date: 2026-07-07

## Source

Where did the spec come from?

- User prompt: Build an "asset memory MCP" for Unity, inspired by
  `codebase-memory-mcp`, mapping assets and all their references.
- Attached file: `docs/superpowers/specs/2026-07-07-asset-memory-mcp-design.md`
  (approved design spec).
- External reference: https://github.com/DeusData/codebase-memory-mcp

## Project Summary

`asset-reference-mcp` indexes a Unity project's assets into a persistent
reference graph so humans and AI agents can answer structural questions
instantly: what references this asset (impact analysis), which assets are unused,
how two assets connect, and an architectural overview. The index is a plain,
documented SQLite artifact reusable by future external tooling. A static
TypeScript parser reads `.meta` + text-serialized YAML; an optional,
manually-triggered C# Unity Editor step verifies the graph against
`AssetDatabase`. Indexing is manual-trigger only (no background watcher).

## Candidate Product Docs

| File | Purpose | Source sections |
| --- | --- | --- |
| `docs/product/overview.md` | Product goals, non-goals, feasibility premise | Spec §1, §2 |
| `docs/product/asset-graph-model.md` | SQLite schema as the reusable public contract | Spec §4, §5 |
| `docs/product/indexing.md` | Parser behavior, scan scope, packages, error handling | Spec §3, §5, §7 |
| `docs/product/mcp-tools.md` | The 9 MCP tool contracts | Spec §6 |
| `docs/product/verification.md` | Unity C# verify export + `verify_index` diff | Spec §6, §3 |

## Candidate Epics

| Epic | Description | Status |
| --- | --- | --- |
| E01 | Static index core: scan, GUID map, nodes, edges, packages, SQLite store | sliced |
| E02 | MCP query tools: index/status/impact/unused/trace/search/overview | unsliced |
| E03 | Verification: Unity C# exporter + `verify_index` diff | unsliced |

## Architecture Questions

- Runtime stack: TypeScript / Node (indexer + MCP server); C# only for the Unity
  Editor verify exporter.
- Product surfaces: MCP server (agent-facing tools) + a reusable SQLite file
  (external-tool-facing).
- Storage: SQLite (`.asset-memory/index.db`), plain `assets`/`edges`/
  `unresolved_refs`/`index_meta` tables, traversal via recursive CTEs + TS BFS.
- External providers: none. Unity Editor is an optional local verify source, not
  a runtime dependency.
- Deployment target: local dev tool, distributed via npx; runs offline/CI.
- Security model: read-only over local project files; no network, no secrets.

## Validation Shape

| Layer | Expected proof |
| --- | --- |
| Unit | Parser fixtures per `ref_kind`, builtin GUIDs, unresolved refs, malformed YAML, binary-header detection |
| Integration | Small fixture Unity project indexed end-to-end; exact node/edge counts + query results |
| E2E | MCP tool-call tests against the fixture index |
| Platform | Unity C# verify exporter runs in Editor; `verify_index` diff on a real project |
| Release | Full suite + verify diff on a real project as accuracy gate |

## Open Decisions

- Node driver choice (`better-sqlite3` vs `node:sqlite`) — decide at E01 impl.
- Whether folders get nodes (spec says yes) — confirmed, keep.
- Sub-asset (fileID-level) granularity — deferred; `file_id` column reserves it.

## First Story Candidates

- US-001: Project scan + GUID map + asset nodes.
- US-002: Reference extraction → edges + unresolved refs.
- US-003: SQLite graph-store schema + atomic write path.
- US-004: Package/origin classification + builtin GUID seeding.

## Harness Delta

- Recorded intake #1 (`new_spec`, normal).
- Added `CLAUDE.md` harness import block (Claude Code does not auto-load
  `AGENTS.md`).
- Added the repo-local Codex skill referenced by `AGENTS.md:5` at
  `.codex/skills/harness-intake-griller/SKILL.md`.
