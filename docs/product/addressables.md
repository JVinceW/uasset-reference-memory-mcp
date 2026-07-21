# Addressables Discovery

Addressables discovery is a read-only Stage 1 view of normalized Unity
Addressables authoring metadata. It reports membership, group identity,
addresses, labels, serialized-reference counts, and reachability without
editing project settings or predicting bundle output.

## MCP Tools

### `get_addressable_info(asset)`

`asset` accepts a 32-character GUID, exact project-relative path, exact asset
name, or exact Addressables address. Resolution uses that precedence: GUID,
path, name, then address. Duplicate exact names or addresses return
`status: "ambiguous"` with bounded asset candidates. Unknown inputs return
`status: "not-found"`.

A `status: "found"` response returns identity (`guid`, `path`, `name`, `type`, `origin`),
incoming and outgoing serialized-reference counts, and:

- `isAddressable: true` plus its address, group GUID/name/path, read-only flag,
  labels, and `reachableOnlyBecauseAddressable`; or
- `isAddressable: false` and `addressable: null` for a known asset without
  Addressables membership. This is a successful lookup, not an error.

### `search_addressables(query?, group?, label?, pathPrefix?, type?, reachableOnlyBecauseAddressable?, limit?)`

All filters are optional and combine with AND semantics. `query` partially
matches asset name, path, or address; `group` partially matches group name;
`label` is exact; `pathPrefix` and `type` filter asset metadata. `limit` is
bounded to 1-200. Results are deterministically ordered by asset path and
address and return `total`, `truncated`, and entries with asset identity,
address, group, read-only state, labels, reference counts, and reachability
classification.

### `list_addressable_groups()`

Returns `total` and every group, including empty groups, under `groups`, with
group GUID, name, path, entry count, distinct labels, and
`indexedSourceBytes`. This byte count sums
the indexed source asset file sizes for current entries. It is not built bundle
size, download size, compressed size, or a prediction of any of those values.

All three tools return the standard `no-index` error when no index exists. They
return `schema-mismatch` with expected/actual versions and rebuild guidance for
an older generated index.

## Reachability And Cleanup Safety

`find_unused_assets` remains conservative. With `addressableRoots: "on"`, or
`"auto"` in a project containing Addressable entries, every Addressable entry
and its serialized dependency closure is protected from unused-asset results.

`reachableOnlyBecauseAddressable` is true for an Addressable entry that is not
reachable from known non-Addressable roots (scenes or `Resources/`) but becomes
reachable when Addressable roots are included. It is a review and migration
signal only. It never means an asset is unused or safe to delete.

Projects without Addressables continue to support the general asset graph,
traversal, search, and unused-asset tools. Static indexing cannot prove dynamic
string-based loads such as hard-coded Addressables keys or `Resources.Load`
paths, so cleanup candidates must still be reviewed against runtime loading
code.

## Scope

Stage 1 is read-only: it does not add, remove, rename, or move entries or change
groups. Stage 2 remains deferred, including group schemas, packing and
compression, build/load paths, profile variables, providers, content-update
restrictions, bundle composition, and bundle-size analysis.
