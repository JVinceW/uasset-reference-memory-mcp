# Changelog

Notable changes to `unity-asset-reference-mcp`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[ADR 0012](docs/decisions/0012-semantic-versioning-release-policy.md): while the
project is `0.x`, new capability and breaking changes both take a MINOR bump.

Prereleases publish to npm under the `next` dist-tag and never displace
`latest` ([ADR 0019](docs/decisions/0019-prerelease-channel-policy.md)).

`.github/workflows/release-artifacts.yml` reads the section matching a pushed
tag and uses it as the GitHub release notes, so headings here become the
release page.

## [0.4.0] - 2026-08-23

Upgrading from 0.3.x needs nothing: the index schema is unchanged at version 3,
so an existing `.asset-memory/index.db` is read as-is. Upgrading from 0.2.x
requires a reindex from schema 2, which the indexer performs automatically on
the next run — no flag and no manual migration.

Two changes are worth knowing before upgrading: the web viewer served at `/` is
the new one, with the previous viewer moved to `/legacy.html`; and
`search_assets` now matches an asset's path and GUID prefix as well as its name,
so the same query returns more results than in 0.3.2.

### Added

- **Interactive web viewer.** A new graph viewer served at `/`, rendering the
  dependency graph in **2D** (Sigma) or **3D** (three.js). Includes an
  attention panel for broken references, unused assets, and the most-referenced
  assets; filters by asset type and origin; dependency/reference tracing; a node
  budget for large graphs; search; back/forward navigation; and light/dark
  theming.
- **Five HTTP API endpoints:** `/api/asset-detail`, `/api/broken-references`,
  `/api/graph`, `/api/index-status`, and `/api/root-trace`.
- **`--concurrency <n>`** on the indexer, to tune scanning and extraction for a
  given machine or storage device.
- **`--project <root>`** on the web viewer, matching the argument the MCP server
  and indexer already take.
- **Project discovery.** Run the web viewer from anywhere inside a Unity project
  and it locates the project root by walking up, the way `git` finds a
  repository. No arguments are required.
- **Automatic port selection.** The viewer binds the first free port from 7777,
  so several projects can be served at once without configuration.
- **Cross-platform installers** — `scripts/install.sh` and `scripts/install.ps1`,
  with Node version preflight and `--package`, `--force`, and `--dry-run`.
- **Unity Editor package downloads** on the GitHub release page, in three
  installable formats: `.tgz` (Package Manager → Add package from tarball),
  `.zip` (Add package from disk), and `.unitypackage` (Assets → Import Package).
- **Server-less viewer download** — `asset-graph-viewer-static-<version>.zip`,
  the WASM SQLite viewer that runs from the filesystem with no server.

### Changed

- **The new viewer is served at `/`.** The previous Cytoscape viewer remains
  bundled and moves to **`/legacy.html`**.
- **`search_assets` matches more.** The `name` filter now matches an asset's
  name, path, or GUID prefix; it previously matched only the name. Affects the
  MCP tool and the web API alike, and returns strictly more results than 0.3.2
  for the same query.
- **Indexing runs in parallel.** Scanning and reference extraction use bounded
  concurrency; SQLite writes remain transactional and serialized. Output is
  unchanged — a full index at concurrency 1 and 8 produces byte-identical
  `assets` and `edges` tables.
- **Installs are much smaller.** Viewer build dependencies are no longer runtime
  dependencies, and only latin/latin-ext WOFF2 fonts are bundled. A production
  install drops from roughly 134 MB to about 40 MB, and the published package
  from 1.45 MB to 0.72 MB.

### Removed

- **The WASM SQLite viewer is no longer inside the npm package.** It is a
  separate download on the release page. It exists to be opened from the
  filesystem, so it was charging every install about 706 KB of WASM it would
  never load. Nothing about the flavor itself changed.

### Fixed

- The web viewer no longer dies with an unhandled `EADDRINUSE` when its port is
  taken; it selects the next free port instead.
- `--concurrency` no longer silently ignores a non-numeric value, and
  `--concurrency --force` no longer consumes `--force` as its value.
- `AsyncLimiter` hands a released slot directly to the next waiter, closing a
  window in which two tasks could briefly exceed the configured limit.
- The attention panel renders its results, and 3D graph rendering is no longer
  too dark to read.
- The installers' PATH hint used `npm bin -g`, removed in npm 9 and therefore
  failing on every supported Node version. It now uses `npm prefix -g`.
- Fonts are served as `font/woff2` rather than `application/octet-stream`.

### Notes

- The MCP tool surface is unchanged at 15 tools. The `search_assets` behavior
  change above is the only difference an MCP client will observe.
- The Unity Editor package is versioned independently and remains at `0.2.0`; it
  is unchanged in this release.

## [0.4.0-rc.1] - 2026-08-23

Release candidate for 0.4.0, published under the `next` dist-tag so it never
displaced `latest`. It carries the same change set as 0.4.0 above; the stable
release adds only the upgrade guidance in the section above and this entry.

Installed with `npm install -g unity-asset-reference-mcp@next`. It remains on
npm and installable by exact version; `@next` follows whichever prerelease is
most recent. Anyone running it should move to 0.4.0, which is identical in
behavior.

## Earlier releases

`0.3.2` and earlier predate this file. See the
[releases page](https://github.com/JVinceW/uasset-reference-memory-mcp/releases)
and `docs/releases/` for their notes.
