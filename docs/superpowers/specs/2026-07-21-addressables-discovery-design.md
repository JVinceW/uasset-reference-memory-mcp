# Addressables Discovery Design

Date: 2026-07-21
Status: Proposed

## Outcome

Let an agent answer Addressables discovery and migration-readiness questions
directly through MCP without exporting the graph, opening SQLite, or grepping
Unity YAML.

Stage 1 is read-only. It identifies Addressable assets, groups, addresses,
labels, and graph reachability. It does not edit Addressables configuration or
predict bundle-build consequences.

## Problem

The index currently stores only an Addressable entry GUID and address. That is
enough to protect Addressable entries during unused-asset analysis, but not
enough for an agent to answer common questions efficiently:

- Is this asset Addressable?
- Which group contains it?
- Which labels and address does it use?
- What else is in the same group?
- Which entries are candidates for cleanup or migration?
- Would moving an entry affect assets that depend on it or that it depends on?

Group identity, group membership, labels, and a curated MCP query surface are
missing. Agents therefore fall back to JSON export, direct database access, or
grep against Addressables YAML.

## Scope

### Stage 1

- Parse group identity, group name, group asset path, entries, addresses,
  read-only flags, and labels from `AddressableAssetGroup` YAML.
- Store normalized group, entry, and label relationships in the generated index.
- Add direct MCP tools for asset lookup, filtered discovery, and group inventory.
- Identify entries reachable only because they are registered as Addressable.
- Preserve Addressable entries as roots for `find_unused_assets`.
- Provide clear limitations and stable, bounded results.

### Deferred

- Editing or moving Addressable entries.
- Group schemas, packing mode, compression, build/load paths, profile variables,
  content-update restrictions, providers, and bundle output analysis.
- Detecting hard-coded Addressable addresses or `Resources.Load` paths in code.
- Proving that an Addressable entry is loaded at runtime.
- Custom root providers, AssetBundle manifests, and application-specific registries.

## Approaches Considered

### Entry-only extension

Add group and label columns to the current entry table and expose one lookup
tool. This is small, but it makes group inventory awkward and cannot represent
labels cleanly.

### Full Addressables configuration model

Parse entries, every group schema, profiles, and bundle settings in one release.
This may eventually support build-impact analysis, but it couples the first
useful query surface to version-sensitive Unity serialization and increases the
risk of misleading migration advice.

### Staged normalized model

Normalize authoring metadata now and reserve group configuration for a later
extension. This directly removes the discovery pain, keeps Stage 1 testable, and
provides stable identities for future schema and bundle data. This is the
selected approach.

## Data Model

The generated asset index advances to schema version 3.

### `addressable_groups`

| Column | Meaning |
| --- | --- |
| `group_guid` | Addressables group identity from the group YAML. |
| `asset_guid` | Unity GUID of the group asset itself. |
| `name` | Human-readable group name. |
| `path` | Project-relative path of the group asset. |

`group_guid` is the primary key. `asset_guid` links the Addressables concept to
the existing asset graph without treating the group asset as a runtime content
dependency.

### `addressable_entries`

| Column | Meaning |
| --- | --- |
| `guid` | GUID of the addressed asset; primary key. |
| `address` | Runtime Addressables key. |
| `group_guid` | Owning group. |
| `read_only` | Serialized entry read-only flag. |

An index contains at most one current group membership for an asset. Duplicate
addresses remain observable and are not silently collapsed.

### `addressable_entry_labels`

| Column | Meaning |
| --- | --- |
| `entry_guid` | Addressable entry GUID. |
| `label` | One label assigned to the entry. |

The composite primary key is `(entry_guid, label)`.

The index is generated state. When an older schema is detected, the user gets a
clear re-index requirement; Stage 1 does not attempt to mutate an old index in
place. Snapshot metadata continues carrying the schema version.

## Parser Boundary

Replace the entry-only parser result with one group-shaped result:

```ts
interface AddressableGroup {
  groupGuid: string;
  assetGuid: string;
  name: string;
  path: string;
  entries: Array<{
    guid: string;
    address: string;
    readOnly: boolean;
    labels: string[];
  }>;
}
```

The parser continues using already-read YAML during indexing. It must reject
non-group files cleanly, preserve empty groups, avoid confusing the group GUID
with entry GUIDs, and attach labels only within the current entry block.

Full and incremental indexing must replace the authoritative membership for
each changed group. Deleting a group or removing an entry must remove stale
group, entry, and label rows without requiring a force rebuild.

## MCP Contract

### `get_addressable_info(asset)`

Accepts an asset path, exact name, GUID, or Addressable address.

For an Addressable asset, return:

- asset GUID, path, type, and origin;
- `isAddressable: true`;
- address, group GUID/name/path, read-only flag, and labels;
- incoming and outgoing serialized-reference counts;
- `reachableOnlyBecauseAddressable`.

For a known non-Addressable asset, return its identity with
`isAddressable: false`. This is a normal answer, not an error.

### `search_addressables(...)`

Optional filters:

- free-text name/path/address query;
- exact or partial group name;
- label;
- asset path prefix;
- asset type;
- `reachableOnlyBecauseAddressable`;
- bounded `limit`.

Return matching entries with their asset, address, group, labels, reference
counts, and reachability classification. Also return the total match count and
whether the displayed list was truncated.

### `list_addressable_groups()`

Return every group with group GUID, name, path, entry count, aggregate indexed
source bytes, and distinct labels. Source bytes are not bundle size and must be
named and documented accordingly.

## Reachability Semantics

`find_unused_assets` remains conservative and continues treating Addressable
entries as roots when `addressableRoots` resolves to `auto` or `on`.

For example:

```text
Addressable prefab -> material -> texture
```

The prefab and its dependency closure are not unused even when no scene points
to the prefab, because runtime code may load it by address.

`reachableOnlyBecauseAddressable` answers a different question. It is true when
an Addressable entry is not reachable from non-Addressable known roots such as
scenes or `Resources/`, but becomes reachable when Addressable roots are added.
It marks a review candidate; it never claims the entry is unused or safe to
delete.

Addressables are not required for the broader tool. Serialized dependency,
reference, traversal, and search queries continue working for projects without
Addressables. Dynamic string-based loaders remain an explicit limitation of
unused-asset analysis.

## Query Architecture

Addressables queries live in a focused query module using the shared `QueryDb`
boundary so Node SQLite and browser/WASM consumers can share semantics. Asset
resolution reuses the existing path/name/GUID rules and adds exact Addressable
address resolution.

The MCP dispatcher only validates arguments, opens the index, invokes the query
module, bounds output, and formats the result. SQL and reachability algorithms
do not live in the MCP transport layer.

## Errors And Ambiguity

- Missing index: existing `no-index` response with re-index guidance.
- Old schema: `schema-mismatch` response naming expected and actual versions and
  instructing the user to run `index_project`.
- Unknown asset or address: `not-found`.
- Ambiguous non-exact name: `ambiguous-asset` with bounded path/GUID candidates.
- Known asset without Addressables membership: successful
  `isAddressable: false` response.
- Empty group or no search matches: successful empty result.
- Malformed group YAML: indexing warning identifying the group path; other
  assets continue indexing.

No response should suggest that an entry is safe to delete solely because it
has no serialized referrers.

## Validation

### Parser tests

- Group GUID/name/path are distinct from entry identity.
- Multiple entries, empty groups, labels, empty labels, and read-only entries.
- Non-group YAML and malformed entry blocks.
- Removed entries and deleted groups do not remain after incremental indexing.

### Store and query tests

- Group, entry, and label persistence and replacement.
- Lookup by path, name, GUID, and address.
- Non-Addressable and ambiguous-asset results.
- Group/label/path/type filters, totals, limits, and deterministic ordering.
- Duplicate-address visibility.
- `reachableOnlyBecauseAddressable` with scene, Resources, and Addressable roots.
- Existing `find_unused_assets` behavior remains unchanged.

### MCP tests

- All three tools are registered with bounded schemas.
- Responses match the documented success and error contracts.
- Existing tools and snapshot restore continue working.

### Repository proof

- `npm test`
- `npm run typecheck`
- `npm run build`
- Re-index an Addressables-heavy fixture or real Unity project and manually
  confirm representative asset, group, label, and migration-readiness queries.

## Delivery Sequence

1. Schema and group-shaped parser, including stale-row cleanup.
2. Shared query module and reachability classification.
3. MCP tools and response contracts.
4. Product documentation, story evidence, and real-project verification.

Stage 2 can extend `addressable_groups` with normalized schema/configuration
tables without changing Stage 1 entry identities or MCP meanings.
