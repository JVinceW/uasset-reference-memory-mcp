# unity-asset-reference-mcp

Index a **Unity** project's assets into a reusable **SQLite reference graph**, then
query it three ways: a **CLI**, an **MCP server** (for Claude and other agents),
and a local **web viewer**. Unity-only.

- **Impact analysis** — "what references this material?" before you change it
- **Unused-asset detection** — orphans nothing loads (Addressables-aware)
- **Dependency tracing** — the full closure a scene/prefab pulls in
- **Broken-reference detection** — refs to deleted/missing assets
- **Reusable artifact** — a plain `.sqlite` any tool can open; no lock-in

It reads Unity's own serialization (`.meta` GUIDs + YAML `{fileID, guid}` refs),
so the graph is exact — no heuristics, no AST. Requires **Asset Serialization:
Force Text** (Unity's default for version control).

## Requirements

- Node.js ≥ 20
- A Unity project using **Force Text** serialization
- `better-sqlite3` builds via prebuilt binaries during install (native module)

## Install

```bash
# global CLI + servers
npm install -g unity-asset-reference-mcp

# or run on demand with npx (no install)
npx unity-asset-reference-mcp-index index /path/to/UnityProject
```

## 1. Index a project

Builds `<project>/.asset-memory/index.db`. Add `.asset-memory/` to your Unity
project's `.gitignore`.

```bash
unity-asset-reference-mcp-index index /path/to/UnityProject --force
```

## 2. MCP server (Claude Code & other agents)

```bash
claude mcp add asset-graph -- npx -y unity-asset-reference-mcp --project /path/to/UnityProject
```

Tools: `index_project`, `index_status`, `get_dependencies`, `find_references`,
`find_unused_assets`, `trace_path`, `search_assets`, `get_overview`.

## 3. Web viewer

```bash
# server flavor — serves the viewer + a JSON API over the index
unity-asset-reference-mcp-web --db /path/to/UnityProject/.asset-memory/index.db
# open http://localhost:7777
```

There is also a **static** flavor: open `dist/web/public/viewer.html` in a
browser and pick a `.db` — it runs the same queries entirely in-browser (WASM
SQLite), no server. Both share one query layer.

## Configuration

Optional per-project `.asset-memory/config.json` (see
[docs/product/configuration.md](docs/product/configuration.md)):

```json
{
  "unused": { "addressableRoots": "auto" },
  "scan":   { "ignore": ["**/ThirdParty/**", "*.bak"], "ignoreDefaults": true }
}
```

- `unused.addressableRoots` (`auto`\|`on`\|`off`) — count Addressable entries as
  roots for unused detection (query-time; `auto` = on if the project uses
  Addressables). Overridable per call.
- `scan.ignore` / `scan.ignoreDefaults` — extra ignore globs (index-time).

## The SQLite artifact

Open `.asset-memory/index.db` with any SQLite tool. Core tables: `assets`
(nodes), `edges` (references), `unresolved_refs` (broken refs),
`addressable_entries`, `index_meta`. Schema:
[docs/product/asset-graph-model.md](docs/product/asset-graph-model.md).

## Known limitations

- **Code-based refs not tracked**: `Resources.Load("path")` and hard-coded
  Addressable address strings in C# aren't scanned yet, so `find_unused` output
  is *candidates* — verify against your loading code.
- **Asset-level granularity**: edges are asset→asset (not per-GameObject/fileID).
- Incremental re-index is by mtime; use `--force` for a fully consistent rebuild.

## Development

```bash
npm install
npm test        # vitest
npm run build   # tsc + copy web assets to dist/
```

This repo also uses an internal agent **Harness** for development process (see
[docs/HARNESS.md](docs/HARNESS.md)); it is not part of the shipped package.

## License

MIT — see [LICENSE](LICENSE).
