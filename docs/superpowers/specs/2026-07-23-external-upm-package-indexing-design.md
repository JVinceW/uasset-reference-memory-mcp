# External UPM Package Indexing Design

Date: 2026-07-23

## Goal

Index Unity packages that are active through Unity Package Manager but whose
source folders live outside the Unity project, without requiring users to copy
or embed those packages or configure additional scan roots manually.

## Current Gap

The scanner walks three physical locations beneath the project root:

- `Assets/`;
- `Packages/`; and
- `Library/PackageCache/`.

This covers project assets, embedded packages, and cached registry or Git
packages. It does not reliably cover a local UPM dependency declared with a
`file:` path when that package's source directory is elsewhere on disk. Unity
supports such packages, so references into them can currently remain unresolved
even though Unity imports and uses the package.

## Approved Design

### Package discovery

Indexing builds a package-source plan before scanning assets:

1. Read `Packages/manifest.json` for direct dependencies.
2. Read `Packages/packages-lock.json`, when present, for Unity's resolved source
   classification and transitive package set.
3. Keep the current embedded and cache discovery behavior.
4. Add each dependency that Unity identifies as a local directory source, or
   whose direct manifest value is a resolvable local `file:` directory.

The lockfile is preferred when it supplies resolved local-package information.
The manifest is the fallback and the authority for direct `file:` declarations.
Relative paths are resolved from the directory containing the project manifest,
`<project>/Packages`. Absolute paths remain absolute for filesystem access.

Discovery follows only package paths explicitly declared by Unity's project
metadata. It does not crawl parent folders, sibling repositories, arbitrary
workspace directories, environment variables, or user home directories.

A candidate is accepted only when it is an accessible directory containing a
parseable `package.json`. The `name` in `package.json` must equal the dependency
name declared by the project. Local tarballs and local Git URLs are not scanned
as external directories; Unity's resolved cache remains their source.

### Physical roots and virtual identity

The scanner receives source descriptors rather than assuming every source is
relative to the project root. Each descriptor contains:

- the physical directory to read;
- its canonical virtual prefix;
- its origin; and
- its package identifier.

An external package named `com.company.gameplay` is read from its resolved
physical folder but represented as:

```text
Packages/com.company.gameplay/Runtime/SomeAsset.asset
```

The graph never stores the absolute source path or a `../` path. Nodes retain
`origin='package'`, and `package_id` is the package name from the validated
manifest. Reference extraction continues to resolve by GUID, so project-to-
package, package-to-project, and package-to-package edges need no query-layer
special case.

Ignore patterns are evaluated against the canonical virtual path. Existing
Unity default ignores also apply inside external packages.

### Source precedence and deduplication

Only one physical source supplies a given virtual package name. Precedence
matches the package source selected for the project:

1. an embedded package physically present under `Packages/<name>/`;
2. an active external local package resolved from the project manifest/lockfile;
3. a matching cached package under `Library/PackageCache/`.

Once a higher-precedence source claims a package name, lower-precedence
directories for that package are excluded from the scan. This prevents the same
package assets from appearing through both a local source and a stale cache
entry.

The existing global GUID validation remains the final safety boundary. A GUID
shared by genuinely different active assets still fails indexing with
`DuplicateGuidError`; automatic package discovery does not silently choose a
winner for cross-package GUID collisions.

### Missing and malformed package handling

An absent or malformed project manifest produces a bounded discovery warning
and leaves external-local discovery empty for that run. Existing embedded and
cache roots still scan, preserving the indexer's current useful fallback
behavior.

An individual external package that is missing, inaccessible, lacks
`package.json`, has malformed package metadata, or declares a different package
name produces a bounded scan warning and is skipped. Other roots continue to
index, and an earlier valid index is still replaced only after the complete
candidate graph passes existing publication checks.

Warnings identify the declared package name and failure category. They do not
include more of an absolute source path than is necessary to diagnose a local
configuration problem.

### Incremental freshness

The effective mtime of each indexed asset remains the newer of its asset and
`.meta` timestamps, including files in external packages. Normal incremental
reconciliation therefore detects external asset edits.

The index also records a package-discovery fingerprint derived from the project
manifest, lockfile, and the validated external package identities and source
descriptors. If that fingerprint changes, the next index run performs a fresh
package reconciliation so removed, moved, or retargeted packages cannot leave
stale nodes behind. `force: true` continues to rebuild all sources
unconditionally.

The fingerprint must not persist raw absolute paths. It stores a deterministic
digest plus portable package identity metadata.

## Validation Contract

- A relative `file:` dependency outside the project is discovered and indexed.
- An absolute `file:` dependency is discovered and indexed.
- Relative paths resolve from `Packages/manifest.json`, not the process working
  directory.
- External nodes use `Packages/<package-name>/...` paths, `origin='package'`,
  and the declared package name as `package_id`.
- Assets and edges cross project and external-package boundaries by GUID.
- User and default ignore rules apply to canonical external-package paths.
- An embedded package overrides an external declaration of the same name.
- An active external package prevents a stale cached copy of the same package
  from being scanned.
- Repeated manifest/lockfile descriptions of one source produce one scan root.
- A missing or malformed external package emits one bounded warning and does not
  prevent unrelated valid sources from indexing.
- A dependency-name and `package.json`-name mismatch warns and skips the source.
- Local tarballs and local Git URLs are left to Unity's cache behavior.
- A changed external asset or `.meta` participates in normal incremental
  reprocessing.
- Adding, removing, or retargeting a local dependency changes the discovery
  fingerprint and reconciles the package node set.
- `force: true` scans all active external packages.
- Existing `Assets/`, embedded-package, registry/Git cache, duplicate-GUID,
  atomic-publication, query, and verification behavior remains green.

## Compatibility and scope

This is an automatic indexing expansion. It adds no required CLI or MCP
argument, database column, query behavior, manual root setting, filesystem
watcher, Unity Editor dependency, or package-content mutation.

Product indexing documentation and the relevant index-core story are updated to
describe external local packages and canonical virtual paths. The feature does
not attempt to reproduce the whole Unity package resolver, download missing
packages, run Unity, index arbitrary non-UPM modules, or make external package
locations portable when the project's own `file:` declaration is
machine-specific.
