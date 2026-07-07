<!-- HARNESS:BEGIN -->
# Project Context

This repository uses Harness. Claude Code does not auto-load `AGENTS.md`, so the
harness entrypoint and intake rules are imported here into every session.

@AGENTS.md
@docs/FEATURE_INTAKE.md

Before changing anything, follow the Task Loop in `docs/HARNESS.md`: classify the
request through feature intake, record it with the Harness CLI at
`scripts/bin/harness-cli`, work inside the chosen lane, and record a trace when
done.

## Project

Building **asset-reference-mcp**: an MCP server that indexes a Unity project's
assets into a reusable SQLite reference graph (impact analysis, unused-asset
detection, dependency tracing, agent context). Design spec:
`docs/superpowers/specs/2026-07-07-asset-memory-mcp-design.md`.
<!-- HARNESS:END -->
