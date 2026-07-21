<!-- HARNESS:BEGIN -->
# Project Context

This repository uses the text-first Harness workflow. Claude Code does not
auto-load `AGENTS.md`, so its entrypoint is imported here into every session.

@AGENTS.md
@docs/WORKFLOW.md

## Project

Building **asset-reference-mcp**: an MCP server that indexes a Unity project's
assets into a reusable SQLite reference graph (impact analysis, unused-asset
detection, dependency tracing, agent context). Design spec:
`docs/superpowers/specs/2026-07-07-asset-memory-mcp-design.md`.
<!-- HARNESS:END -->
