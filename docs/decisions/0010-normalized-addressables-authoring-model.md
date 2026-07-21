# 0010 Normalized Addressables Authoring Model

Date: 2026-07-21

## Status

Accepted

## Context

The schema 2 index stored only an Addressable entry GUID and address. That was
enough to protect entries during unused-asset analysis, but not enough for
group inventory, label discovery, migration review, or stable JSON export.
Bundle settings are version-sensitive and would make the first discovery
surface broader and easier to misinterpret.

## Decision

Schema 3 normalizes read-only Addressables authoring metadata into groups,
entries, and entry labels. JSON export preserves entry state, owning group
identity, and deterministically ordered labels. Generated indexes and snapshots
from older schemas are rebuilt with `index_project` instead of migrated in
place.

Stage 1 remains read-only. Group schemas, profile and provider configuration,
packing, compression, build/load paths, content-update settings, and bundle
output analysis are deferred to Stage 2.

## Consequences

- Asset lookup, filtered discovery, and group inventory can use normalized
  identities without reparsing Unity YAML.
- Exported Addressables metadata is stable and diffable under schema 3.
- Older live indexes and snapshots require a rebuild rather than mutation.
- Indexed source bytes cannot be presented as bundle bytes.
- Addressables-only reachability remains review context, never deletion proof.
