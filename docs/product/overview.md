# Product Overview

`asset-reference-mcp` is an MCP server that indexes a Unity project's assets into
a persistent reference graph, so humans and AI agents can answer structural
questions about the project instantly.

Full design detail: `docs/superpowers/specs/2026-07-07-asset-memory-mcp-design.md`.

## Goals

1. **Impact analysis** — before changing/deleting an asset, know everything that
   references it.
2. **Find unused assets** — detect orphans nothing references (build-size wins).
3. **AI agent context** — agents query the asset graph via MCP tools.
4. **Explore / understand** — trace dependency chains, get an architectural view.
5. **Reusable index artifact** — the index is a plain, documented SQLite file
   any future external tool can consume directly, independent of the MCP server.
6. **Addressables discovery** — inspect normalized entry, group, label, and
   reachability metadata through read-only MCP tools.

## Non-Goals (v1)

- No background watcher / auto-indexing. **Indexing is manual-trigger only.**
- No code-based reference extraction (`Resources.Load("...")`, Addressables
  string addresses). Deferred; schema reserves room via `CODE_REF`/`ADDRESSABLE_REF`.
- No GameObject-level (sub-asset) edge granularity. Edges are asset-to-asset;
  the `file_id` column reserves the upgrade path.
- No Cypher / graph query language. Plain SQL over documented tables + curated
  MCP tools.
- No Addressables configuration editing or bundle prediction. Group schemas,
  profiles, providers, packing, compression, build/load paths, content-update
  settings, and bundle output analysis are deferred.

## Feasibility Premise

Unity serialized assets state their references explicitly. Every asset has a
`.meta` with a stable **GUID**; text-serialized assets reference each other as
`{fileID, guid, type}`. Unlike source code (which needs AST + type resolution to
*infer* edges), Unity hands us an unambiguous reference graph — we only parse
YAML and `.meta`. No tree-sitter, no LSP.

**Hard requirement:** the Unity project must use text serialization (Asset
Serialization: Force Text). Binary serialization is detected and rejected with a
clear message.

Addressables are optional. Projects without them retain the complete general
asset graph and query surface. `reachableOnlyBecauseAddressable` is a review
signal, not evidence that an asset is unused or safe to delete; dynamic
string-based loading remains outside the static graph.

## Relationship to codebase-memory-mcp

Same pattern (index → SQLite graph → MCP query tools) with the heavy code-analysis
machinery removed because Unity's serialization already did that work. Added: a
Unity-side C# verify step. See `docs/decisions/` for the durable design decisions.
