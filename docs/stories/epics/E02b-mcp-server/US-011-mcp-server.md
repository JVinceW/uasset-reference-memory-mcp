# US-011 MCP server wrapping the query layer (stdio tools)

## Status

implemented

## Lane

normal

## Product Contract

An MCP stdio server that exposes the shared query layer as tools so agents can
query the asset graph: `index_project`, `index_status`, `get_dependencies`,
`find_references`, `find_unused_assets`, `trace_path`, `search_assets`,
`get_overview`. Configured with a Unity project root and/or an `index.db` path.

## Relevant Product Docs

- `docs/product/mcp-tools.md`

## Acceptance Criteria

- All eight tools registered with schemas; results returned as JSON text content.
- Read tools open the index read-only and error cleanly (`no-index`) when it is
  absent; `index_project` builds/refreshes it.
- Tool logic reuses the E02a query layer (no duplication); dispatch is unit-tested
  and the server is smoke-tested over a real MCP client transport.

## Design Notes

- `src/mcp/tools.ts` — pure `runTool(ctx, name, args)` dispatch (testable)
- `src/mcp/server.ts` — `createMcpServer(ctx)` registers tools on `McpServer`;
  `main()` parses `--project`/`--db` and connects `StdioServerTransport`
- Bin `asset-reference-mcp-server`

## Validation

`scripts/bin/harness-cli story update --id US-011 --unit 1 --integration 0 --e2e 1 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | `runTool` per tool + no-index/unknown-tool errors (8 tests) |
| E2E | In-memory `Client`↔`Server`: listTools + callTool (2 tests); real-index run |
| Release | Part of full suite (128 tests) |

## Evidence

- `npm test` — 128 tests pass incl. `mcp/tools` (8) and `mcp/server` (2, real
  MCP client handshake over InMemoryTransport).
- `npm run typecheck` clean; `npm run build` ok; bin wired.
- **Real-index run** (`pudgy-index.db`): `index_status` → 22,913 assets /
  12,956 edges; `get_dependencies(BurningNFT prefab, 1)` → 71; `search_assets`
  found the project scenes.

### Wiring into Claude Code

```bash
claude mcp add asset-graph -- node <repo>/dist/mcp/server.js --project /path/to/UnityProject
```
Then `index_project` once, and query with the other tools.
