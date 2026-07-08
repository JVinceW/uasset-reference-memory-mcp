# Testing / Try It Out

Two levels: the automated suite (fast confidence) and a hands-on walkthrough on a
real Unity project exercising all three surfaces (CLI, web viewer, MCP server).

Paths below assume the repo at `~/Documents/asset-reference-mcp` and a Unity
project at `<PROJECT>`. Replace `<PROJECT>` with your project path
(e.g. `~/Documents/unity_workspace/pudgy-unity`).

## 0. Build

```bash
cd ~/Documents/asset-reference-mcp
npm install
npm run build     # compiles to dist/ and copies web assets
```

## 1. Automated tests (fast)

```bash
npm test          # ~165 unit + integration + e2e tests, all should pass
npm run typecheck # tsc --noEmit, no errors
```

## 2. CLI — index, snapshot, restore

```bash
# build the index (writes <PROJECT>/.asset-memory/index.db)
node dist/cli/main.js index <PROJECT> --force
# expect: assets / edges counts, a few warnings, a few seconds

# export a shareable snapshot (compressed, committable)
node dist/cli/main.js snapshot <PROJECT>
# expect: index.db.br a fraction of the db size

# simulate a teammate: delete the live db, restore from the snapshot
rm <PROJECT>/.asset-memory/index.db
node dist/cli/main.js restore <PROJECT>
# expect: "Restored live index from snapshot"
```

Inspect the reusable artifact with any SQLite tool:

```bash
sqlite3 <PROJECT>/.asset-memory/index.db \
  "SELECT asset_type, count(*) FROM assets GROUP BY asset_type ORDER BY 2 DESC LIMIT 8;"
sqlite3 <PROJECT>/.asset-memory/index.db \
  "SELECT count(*) FROM edges;  SELECT count(*) FROM unresolved_refs;"
```

## 3. Web viewer

```bash
# server flavor
node dist/web/server.js --db <PROJECT>/.asset-memory/index.db
# open http://localhost:7777 — search an asset path, click nodes to expand,
# toggle dependencies / references, change depth
```

Static flavor (no server): open `dist/web/public/viewer.html` in a browser and
pick the `index.db` file — same UI, runs entirely in-browser (WASM SQLite).

## 4. MCP server (any agent)

Wire into Claude Code (or any MCP host — see the README for other hosts):

```bash
claude mcp add unity-asset-graph -- \
  node ~/Documents/asset-reference-mcp/dist/mcp/server.js --project <PROJECT>
claude mcp list   # should show unity-asset-graph ✓ connected
```

Then in a session, ask things that call the tools:

- "Index the Unity project" → `index_project`
- "What references `Assets/.../SomeTexture.png`?" → `find_references`
- "What does `Assets/.../Player.prefab` depend on?" → `get_dependencies`
- "Find unused assets under `Assets/lobby.contents`" → `find_unused_assets`
- "Give me a project overview" → `get_overview`

## 5. Things worth verifying

- **Addressables toggle** — `find_unused_assets` with `addressableRoots: "off"`
  vs `"auto"` should differ a lot on an Addressables-heavy project (auto counts
  Addressable entries as roots).
- **Impact analysis** — `find_references` on a shared material/texture lists the
  prefabs/scenes that would break if you change it.
- **Broken refs** — `unresolved_refs` surfaces references to deleted assets
  (e.g. missing nested-prefab sources).
- **Config** — add `<PROJECT>/.asset-memory/config.json` with
  `{"scan":{"ignore":["**/ThirdParty/**"]}}`, re-run `index --force`, confirm
  those assets drop out.
