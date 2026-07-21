# Addressables Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fast, read-only Addressables discovery through normalized group metadata and three curated MCP tools while preserving conservative unused-asset detection.

**Architecture:** Extend the generated SQLite index with normalized Addressables groups, entries, and labels. Parse group-shaped data during the existing indexing pass, expose it through a focused shared query module, and keep the MCP layer limited to argument validation and bounded response formatting. Reuse one reachability primitive for both unused detection and the `reachableOnlyBecauseAddressable` review signal.

**Tech Stack:** TypeScript 5.7, Node.js 20+, better-sqlite3, SQLite recursive CTEs, MCP SDK 1.29, Zod 4, Vitest 2.1.

## Status

Active

## Global Constraints

- Stage 1 is read-only; do not modify Unity Addressables assets or settings.
- Store authoring metadata only: group identity/name/path, entry address/read-only state, and labels.
- Do not parse group schemas, profiles, packing, compression, providers, or build/load paths.
- Do not infer that an entry is safe to delete from serialized-reference counts.
- Keep `find_unused_assets` conservative: Addressable entries remain roots for `auto` and `on`.
- The index is generated state. Schema 2 indexes must produce explicit re-index guidance; no in-place data migration.
- Preserve Node SQLite and browser/WASM compatibility by implementing query behavior against `QueryDb`.
- Bound MCP list output to 200 rows and return total/truncation metadata.
- Use deterministic ordering in queries and exported JSON.
- Do not add runtime dependencies.

## Source Map

- `src/indexer/addressables.ts`: parse one Addressables group into a typed group-shaped result.
- `src/indexer/index-project.ts`: collect groups during existing YAML reads and replace authoritative group state during fresh/incremental indexing.
- `src/store/schema.ts`: schema version 3 and normalized Addressables tables.
- `src/store/graph-store.ts`: transactional replacement and cleanup of Addressables group state.
- `src/query/reachability.ts`: shared known-root reachability calculation.
- `src/query/addressables.ts`: lookup, filter, inventory, reference counts, and Addressables-only reachability classification.
- `src/query/unused.ts`: consume the shared reachability primitive without changing public behavior.
- `src/mcp/server.ts`: register three new MCP tool schemas.
- `src/mcp/tools.ts`: dispatch and format the new query results and schema mismatch response.
- `src/snapshot/json-export.ts`: preserve normalized Addressables data in the text export.
- `docs/product/addressables.md`: user-facing behavior, limits, and examples.
- `docs/stories/epics/E11-addressables-discovery/US-024-addressables-discovery.md`: story contract and evidence.
- `docs/decisions/0010-normalized-addressables-authoring-model.md`: durable schema/source-of-truth decision.

---

### Task 1: Parse Addressables Groups, Entries, Labels, and Read-Only State

**Files:**
- Modify: `src/indexer/addressables.ts`
- Modify: `src/indexer/addressables.test.ts`

**Interfaces:**
- Consumes: Unity `AddressableAssetGroup` YAML plus `{ assetGuid, path }` supplied by the indexer.
- Produces: `AddressableGroup`, `AddressableGroupEntry`, `AddressableParseError`, and `extractAddressableGroup(content, source)`.

- [ ] **Step 1: Replace the entry-only fixture with failing group-shaped parser tests**

Add a fixture containing a group name/GUID, two entries, a read-only flag, labels, and an empty-label entry. Assert the complete public result:

```ts
const SOURCE = { assetGuid: "f".repeat(32), path: "Assets/AddressableAssetsData/AssetGroups/UI.asset" };

test("returns group identity, entries, labels, and read-only state", () => {
  expect(extractAddressableGroup(GROUP, SOURCE)).toEqual({
    groupGuid: "65cb101caed9d47f4a691dc0dea916ae",
    assetGuid: SOURCE.assetGuid,
    name: "UI Remote",
    path: SOURCE.path,
    entries: [
      {
        guid: "013c6163221e6ab4782143325d5f2080",
        address: "ui/profile",
        readOnly: false,
        labels: ["remote", "ui"],
      },
      {
        guid: "06521722bffe44540a3b2d5f8213bef3",
        address: "ui/settings",
        readOnly: true,
        labels: [],
      },
    ],
  });
});

test("returns null for non-group YAML", () => {
  expect(extractAddressableGroup("%YAML 1.1\nMaterial:\n", SOURCE)).toBeNull();
});

test("preserves an empty group", () => {
  const yaml = "MonoBehaviour:\n  m_Name: Empty\n  m_GUID: " + "a".repeat(32) + "\n  m_SerializeEntries: []\n";
  expect(extractAddressableGroup(yaml, SOURCE)?.entries).toEqual([]);
});

test("throws a path-aware parse error when marked group YAML lacks identity", () => {
  expect(() => extractAddressableGroup("m_SerializeEntries: []\n", SOURCE)).toThrow(
    /UI\.asset.*missing group name or GUID/,
  );
});
```

- [ ] **Step 2: Run the parser tests and confirm the old interface fails**

Run: `npx vitest run src/indexer/addressables.test.ts`

Expected: FAIL because `extractAddressableGroup` and the group-shaped types do not exist.

- [ ] **Step 3: Implement the group-shaped parser boundary**

Add these public types and function signature while temporarily retaining
`extractAddressableEntries(content)` as a compatibility wrapper for the existing
indexer caller:

```ts
export interface AddressableGroupEntry {
  guid: string;
  address: string;
  readOnly: boolean;
  labels: string[];
}

export interface AddressableGroup {
  groupGuid: string;
  assetGuid: string;
  name: string;
  path: string;
  entries: AddressableGroupEntry[];
}

export interface AddressableGroupSource {
  assetGuid: string;
  path: string;
}

export class AddressableParseError extends Error {
  constructor(path: string, detail: string) {
    super(`could not parse Addressables group ${path}: ${detail}`);
    this.name = "AddressableParseError";
  }
}

export function extractAddressableGroup(
  content: string,
  source: AddressableGroupSource,
): AddressableGroup | null;
```

Implement block-aware parsing with anchored expressions for top-level `m_Name`, top-level `m_GUID`, list-item `- m_GUID`, `m_Address`, `m_ReadOnly`, and `m_Labels`. Normalize GUIDs to lowercase, decode `m_ReadOnly: 1` as `true`, preserve label order while removing duplicates, and stop entry parsing at the next list-item GUID. Throw `AddressableParseError` only when `m_SerializeEntries:` identifies a group but its group name or group GUID is missing.

The compatibility wrapper calls the same parser and returns `group?.entries ?? []`.
Remove the wrapper in Task 2 after `index-project.ts` consumes the group-shaped
API.

- [ ] **Step 4: Run the parser tests**

Run: `npx vitest run src/indexer/addressables.test.ts`

Expected: PASS for group identity, entries, labels, read-only state, empty group, non-group YAML, and malformed group warning detail.

- [ ] **Step 5: Run type checking**

Run: `npm run typecheck`

Expected: PASS because the compatibility wrapper keeps the current indexer caller valid.

- [ ] **Step 6: Commit the parser contract**

```powershell
git add src/indexer/addressables.ts src/indexer/addressables.test.ts
git commit -m "feat: parse Addressables group metadata"
```

---

### Task 2: Persist Schema 3 and Keep Incremental Group State Authoritative

**Files:**
- Modify: `src/store/schema.ts`
- Modify: `src/store/graph-store.ts`
- Modify: `src/store/graph-store.test.ts`
- Modify: `src/indexer/index-project.ts`
- Modify: `src/indexer/index-project.test.ts`

**Interfaces:**
- Consumes: `AddressableGroup[]` from Task 1.
- Produces: `SCHEMA_VERSION = 3`, `GraphStore.readSchemaVersion(path)`, `GraphStore.replaceAddressableGroups(groups)`, `GraphStore.replaceAddressableGroupsForAssets(assetGuids, groups)`, and incremental stale-row cleanup.

- [ ] **Step 1: Write failing schema and transactional replacement tests**

In `src/store/graph-store.test.ts`, assert all normalized tables and replacement behavior:

```ts
test("schema 3 stores normalized groups, entries, and labels", () => {
  const store = GraphStore.open(":memory:");
  expect(store.getMeta("schema_version")).toBe("3");
  const tables = store.db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((row) => (row as { name: string }).name);
  expect(tables).toEqual(expect.arrayContaining([
    "addressable_groups",
    "addressable_entries",
    "addressable_entry_labels",
  ]));
  store.close();
});

test("replacing a changed group removes stale entries and labels", () => {
  const store = GraphStore.open(":memory:");
  store.replaceAddressableGroups([group("UI", [entry("a", ["old"]), entry("b", [])])]);
  store.replaceAddressableGroupsForAssets(
    ["f".repeat(32)],
    [group("UI", [entry("a", ["new"])])],
  );
  expect(store.addressableCount()).toBe(1);
  expect(store.db.prepare("SELECT label FROM addressable_entry_labels").all()).toEqual([
    { label: "new" },
  ]);
  store.close();
});

test("replacing a deleted group asset removes its membership", () => {
  const store = GraphStore.open(":memory:");
  store.replaceAddressableGroups([group("UI", [entry("a", [])])]);
  store.replaceAddressableGroupsForAssets(["f".repeat(32)], []);
  expect(store.addressableCount()).toBe(0);
  store.close();
});
```

Use local `group()` and `entry()` factories returning the Task 1 interfaces with fixed 32-character GUIDs.

- [ ] **Step 2: Run the store tests and verify failure**

Run: `npx vitest run src/store/graph-store.test.ts`

Expected: FAIL because schema version 3, normalized tables, and replacement methods do not exist.

- [ ] **Step 3: Replace the Addressables schema with normalized tables**

Set `SCHEMA_VERSION = 3` and replace the old table with:

```sql
CREATE TABLE IF NOT EXISTS addressable_groups (
  group_guid TEXT PRIMARY KEY,
  asset_guid TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  path       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS addressable_entries (
  guid       TEXT PRIMARY KEY,
  address    TEXT NOT NULL,
  group_guid TEXT NOT NULL REFERENCES addressable_groups(group_guid) ON DELETE CASCADE,
  read_only  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_addressable_entries_address
  ON addressable_entries(address);
CREATE INDEX IF NOT EXISTS idx_addressable_entries_group
  ON addressable_entries(group_guid);

CREATE TABLE IF NOT EXISTS addressable_entry_labels (
  entry_guid TEXT NOT NULL REFERENCES addressable_entries(guid) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  PRIMARY KEY (entry_guid, label)
);
CREATE INDEX IF NOT EXISTS idx_addressable_labels_label
  ON addressable_entry_labels(label);
```

- [ ] **Step 4: Implement full and scoped transactional replacement**

Add these exact methods to `GraphStore`:

```ts
replaceAddressableGroups(groups: AddressableGroup[]): void;
replaceAddressableGroupsForAssets(assetGuids: string[], groups: AddressableGroup[]): void;
```

Both methods must run in one transaction. `replaceAddressableGroups` deletes all groups and reinserts the supplied authoritative set. `replaceAddressableGroupsForAssets` first deletes rows from `addressable_groups` whose `asset_guid` is in `assetGuids`, relying on foreign-key cascades, then inserts supplied groups, entries, and labels. Share one private insertion helper so SQL bindings are identical in both paths.

- [ ] **Step 5: Update the indexer and add incremental lifecycle tests**

Change `extractAll` to return `addressableGroups: AddressableGroup[]`, remove the
temporary `extractAddressableEntries` compatibility export, and call the parser as:

```ts
try {
  const group = extractAddressableGroup(content, { assetGuid: node.guid, path: node.path });
  if (group) addressableGroups.push(group);
} catch (error) {
  if (error instanceof AddressableParseError) {
    warnings.push({ kind: "unreadable-asset", path: node.path, message: error.message });
  } else {
    throw error;
  }
}
```

Fresh indexing calls `store.replaceAddressableGroups(addressableGroups)`. Incremental indexing calls:

```ts
store.replaceAddressableGroupsForAssets(
  [...changed.map((node) => node.guid), ...removedGuids],
  addressableGroups,
);
```

Add integration tests that index a group with two entries, rewrite it with one entry and new labels, then delete the group asset. Each incremental run must leave exactly the current groups, entries, and labels.

- [ ] **Step 6: Make old indexes rebuild on `index_project`**

Add a non-mutating static helper:

```ts
static readSchemaVersion(path: string): number | null {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const row = db.prepare("SELECT value FROM index_meta WHERE key = 'schema_version'").get() as
      | { value: string }
      | undefined;
    return row ? Number(row.value) : null;
  } finally {
    db.close();
  }
}
```

Before copying an existing database into the temporary incremental database,
call this helper. Use incremental mode only when the value equals
`SCHEMA_VERSION`; otherwise start a fresh temporary database. This check must
happen before `GraphStore.open`, because applying schema-3 indexes to the old
schema-2 `addressable_entries` table would fail. Add a test that creates a
schema-2-shaped database with `index_meta.schema_version = '2'`, runs
`indexProject`, and asserts the resulting database reports schema 3 and contains
current scan data.

- [ ] **Step 7: Run focused storage/indexing tests**

Run:

```powershell
npx vitest run src/store/graph-store.test.ts src/indexer/addressables.test.ts src/indexer/index-project.test.ts
```

Expected: PASS, including changed/deleted group cleanup and schema-2 rebuild.

- [ ] **Step 8: Run the full suite and commit**

Run: `npm test`

Expected: PASS with no existing unused-asset regression.

```powershell
git add src/store/schema.ts src/store/graph-store.ts src/store/graph-store.test.ts src/indexer/index-project.ts src/indexer/index-project.test.ts
git commit -m "feat: persist normalized Addressables groups"
```

---

### Task 3: Share Reachability and Add Addressables Queries

**Files:**
- Create: `src/query/reachability.ts`
- Create: `src/query/reachability.test.ts`
- Create: `src/query/addressables.ts`
- Create: `src/query/addressables.test.ts`
- Modify: `src/query/unused.ts`
- Modify: `src/query/unused.test.ts`

**Interfaces:**
- Consumes: schema 3 through `QueryDb`, `resolveRef` from `src/query/traverse.ts`, and asset rows through `rowToNode`.
- Produces: `findReachableGuids`, `getAddressableInfo`, `searchAddressables`, and `listAddressableGroups`.

- [ ] **Step 1: Write failing reachability tests**

Create a graph with a Scene-rooted prefab, a `Resources/` asset, an Addressable-only prefab, its material dependency, and an orphan. Assert:

```ts
expect(findReachableGuids(store, { includeAddressables: false })).toEqual(
  new Set([SCENE, SCENE_PREFAB, RESOURCE]),
);
expect(findReachableGuids(store, { includeAddressables: true })).toEqual(
  new Set([SCENE, SCENE_PREFAB, RESOURCE, ADDRESSABLE, ADDRESSABLE_MATERIAL]),
);
```

Also retain existing tests proving `find_unused_assets` gives the same results for `addressableRoots: "auto" | "on" | "off"`.

- [ ] **Step 2: Run reachability and unused tests and verify failure**

Run: `npx vitest run src/query/reachability.test.ts src/query/unused.test.ts`

Expected: FAIL because `findReachableGuids` does not exist.

- [ ] **Step 3: Implement the shared reachability primitive**

Create:

```ts
export interface ReachabilityOptions {
  roots?: string[];
  includeAddressables: boolean;
}

export function findReachableGuids(
  db: QueryDb,
  options: ReachabilityOptions,
): Set<string>;
```

Resolve explicit roots through `resolveRef`. Otherwise select Scene and `Resources/` roots. Conditionally union `addressable_entries.guid`, then use one recursive CTE to return the root and dependency closure. Refactor `findUnusedAssets` to exclude GUIDs from this shared set while preserving project-origin, type, scope, size ordering, and all current options.

- [ ] **Step 4: Write failing Addressables query tests**

Define the expected public types by test usage:

```ts
const info = getAddressableInfo(store, "ui/profile");
expect(info).toMatchObject({
  status: "found",
  asset: { guid: PROFILE, path: "Assets/UI/Profile.prefab", type: "Prefab", origin: "project" },
  isAddressable: true,
  addressable: {
    address: "ui/profile",
    group: { guid: UI_GROUP, name: "UI Remote", path: "Assets/AddressableAssetsData/AssetGroups/UI.asset" },
    readOnly: false,
    labels: ["remote", "ui"],
  },
  incomingReferences: 0,
  outgoingReferences: 1,
  reachableOnlyBecauseAddressable: true,
});

expect(getAddressableInfo(store, "Assets/UI/Local.prefab")).toMatchObject({
  status: "found",
  isAddressable: false,
});

expect(getAddressableInfo(store, "Duplicate.prefab")).toMatchObject({
  status: "ambiguous",
  candidates: expect.any(Array),
});
```

Add search assertions for free text, partial group, exact label, path prefix, type, and `reachableOnlyBecauseAddressable`. Add group inventory assertions for deterministic name/path ordering, entry count, direct indexed source bytes, and distinct sorted labels. Insert two entries with the same address and assert lookup returns `status: "ambiguous"` with both asset candidates.

- [ ] **Step 5: Run the Addressables query tests and verify failure**

Run: `npx vitest run src/query/addressables.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 6: Implement the focused query module**

Export these contracts:

```ts
export type AddressableLookupResult =
  | { status: "found"; asset: AddressableAssetSummary; isAddressable: boolean; addressable: AddressableMetadata | null; incomingReferences: number; outgoingReferences: number; reachableOnlyBecauseAddressable: boolean }
  | { status: "not-found"; input: string }
  | { status: "ambiguous"; input: string; candidates: AddressableAssetSummary[] };

export interface AddressableSearchFilters {
  query?: string;
  group?: string;
  label?: string;
  pathPrefix?: string;
  type?: AssetType;
  reachableOnlyBecauseAddressable?: boolean;
  limit?: number;
}

export interface AddressableSearchResult {
  total: number;
  truncated: boolean;
  entries: AddressableSearchEntry[];
}

export function getAddressableInfo(db: QueryDb, input: string): AddressableLookupResult;
export function searchAddressables(db: QueryDb, filters?: AddressableSearchFilters): AddressableSearchResult;
export function listAddressableGroups(db: QueryDb): AddressableGroupSummary[];
```

Resolution precedence is exact GUID, exact path, unique exact name, then exact Addressable address. A duplicate exact address returns `ambiguous`. Sort ambiguity candidates by path and cap them at 20. Search defaults to 200 and clamps `limit` to `1..200`. Compute base reachability once per call and mark an entry `reachableOnlyBecauseAddressable` when its GUID is absent from the non-Addressable root closure.

- [ ] **Step 7: Run focused query tests**

Run:

```powershell
npx vitest run src/query/reachability.test.ts src/query/addressables.test.ts src/query/unused.test.ts
```

Expected: PASS for all lookup, filtering, group inventory, ambiguity, reachability, and legacy unused behavior cases.

- [ ] **Step 8: Commit the shared query layer**

```powershell
git add src/query/reachability.ts src/query/reachability.test.ts src/query/addressables.ts src/query/addressables.test.ts src/query/unused.ts src/query/unused.test.ts
git commit -m "feat: query Addressables metadata and reachability"
```

---

### Task 4: Expose Three Bounded MCP Tools and Schema Guidance

**Files:**
- Modify: `src/mcp/server.ts`
- Modify: `src/mcp/server.test.ts`
- Modify: `src/mcp/tools.ts`
- Modify: `src/mcp/tools.test.ts`

**Interfaces:**
- Consumes: Task 3 query functions and `SCHEMA_VERSION`.
- Produces: `get_addressable_info`, `search_addressables`, and `list_addressable_groups` MCP contracts.

- [ ] **Step 1: Add failing MCP registration tests**

Extend the server test to require all three names:

```ts
expect(names).toEqual(expect.arrayContaining([
  "get_addressable_info",
  "search_addressables",
  "list_addressable_groups",
]));
```

Inspect `search_addressables` from `client.listTools()` and assert its input schema includes `query`, `group`, `label`, `pathPrefix`, `type`, `reachableOnlyBecauseAddressable`, and `limit`.

- [ ] **Step 2: Add failing dispatcher contract tests**

Seed Addressables metadata in the existing MCP test store and assert:

```ts
expect(await runTool(ctx, "get_addressable_info", { asset: "ui/profile" })).toMatchObject({
  status: "found",
  isAddressable: true,
  reachableOnlyBecauseAddressable: true,
});

expect(await runTool(ctx, "search_addressables", { group: "UI", label: "remote" })).toMatchObject({
  total: 1,
  truncated: false,
});

expect(await runTool(ctx, "list_addressable_groups")).toMatchObject({
  total: 1,
  groups: [{ name: "UI Remote", entryCount: 1 }],
});
```

Create a database whose metadata says schema 2 and assert each new tool returns:

```ts
{
  error: "schema-mismatch",
  expected: 3,
  actual: 2,
  message: "index schema 2 is incompatible with this tool; run index_project to rebuild schema 3",
}
```

- [ ] **Step 3: Run MCP tests and verify failure**

Run: `npx vitest run src/mcp/server.test.ts src/mcp/tools.test.ts`

Expected: FAIL because the tools and dispatch cases are absent.

- [ ] **Step 4: Register the MCP schemas**

Add definitions with these input shapes:

```ts
{
  name: "get_addressable_info",
  description: "Addressables membership, group, labels, references, and reachability for one asset or address.",
  schema: { asset: z.string().describe("asset path, exact name, guid, or Addressable address") },
},
{
  name: "search_addressables",
  description: "Filter Addressable entries by text, group, label, path, type, or Addressables-only reachability.",
  schema: {
    query: z.string().optional(),
    group: z.string().optional(),
    label: z.string().optional(),
    pathPrefix: z.string().optional(),
    type: z.string().optional(),
    reachableOnlyBecauseAddressable: z.boolean().optional(),
    limit: z.number().int().min(1).max(200).optional(),
  },
},
{
  name: "list_addressable_groups",
  description: "Addressables group inventory with entry counts, indexed source bytes, and labels.",
  schema: {},
},
```

- [ ] **Step 5: Dispatch through a schema-aware store wrapper**

Add `withCurrentStore` beside `withStore`. It must inspect the stored version
before calling `GraphStore.open`:

```ts
function withCurrentStore<T>(
  ctx: ToolCtx,
  fn: (store: GraphStore) => T,
): T | { error: string; message: string; expected?: number; actual?: number | null } {
  if (!existsSync(ctx.dbPath)) {
    return { error: "no-index", message: `no index at ${ctx.dbPath} — run index_project first` };
  }
  const actual = GraphStore.readSchemaVersion(ctx.dbPath);
  if (actual !== SCHEMA_VERSION) {
    return {
      error: "schema-mismatch",
      expected: SCHEMA_VERSION,
      actual,
      message: `index schema ${actual ?? 0} is incompatible with this tool; run index_project to rebuild schema ${SCHEMA_VERSION}`,
    };
  }
  return withStore(ctx, fn);
}
```

Use it only for the three new cases. Return lookup results directly, return the search result directly, and wrap group inventory as `{ total: groups.length, groups }`. Preserve the current `no-index` behavior and all existing tool responses.

- [ ] **Step 6: Run MCP tests and the full suite**

Run:

```powershell
npx vitest run src/mcp/server.test.ts src/mcp/tools.test.ts
npm test
npm run typecheck
```

Expected: all commands PASS; the MCP server lists 15 tools.

- [ ] **Step 7: Commit the MCP surface**

```powershell
git add src/mcp/server.ts src/mcp/server.test.ts src/mcp/tools.ts src/mcp/tools.test.ts
git commit -m "feat: expose Addressables discovery MCP tools"
```

---

### Task 5: Preserve Addressables Metadata in JSON and Document the Contract

**Files:**
- Modify: `src/snapshot/json-export.ts`
- Modify: `src/snapshot/json-export.test.ts`
- Modify: `src/snapshot/snapshot.test.ts`
- Create: `docs/product/addressables.md`
- Modify: `docs/product/asset-graph-model.md`
- Modify: `docs/product/indexing.md`
- Modify: `docs/product/mcp-tools.md`
- Modify: `docs/product/overview.md`
- Modify: `README.md`
- Create: `docs/decisions/0010-normalized-addressables-authoring-model.md`
- Create: `docs/stories/epics/E11-addressables-discovery/US-024-addressables-discovery.md`
- Modify: `docs/stories/backlog.md`

**Interfaces:**
- Consumes: schema 3 and the three MCP contracts.
- Produces: stable exported Addressables metadata and current product/story/decision documentation.

- [ ] **Step 1: Write failing JSON export assertions**

Update the export fixture to insert one group with two labels and assert:

```ts
expect(j.addressables).toEqual([
  {
    guid: g("a"),
    address: "ui/profile",
    readOnly: false,
    group: {
      guid: g("d"),
      assetGuid: g("f"),
      name: "UI Remote",
      path: "Assets/AddressableAssetsData/AssetGroups/UI.asset",
    },
    labels: ["remote", "ui"],
  },
]);
expect(j.meta.schemaVersion).toBe(3);
```

Update the snapshot artifact test to expect `schema_version: 3`.

- [ ] **Step 2: Run export/snapshot tests and verify failure**

Run: `npx vitest run src/snapshot/json-export.test.ts src/snapshot/snapshot.test.ts`

Expected: FAIL because the export still emits `{ guid, address }` and tests expect schema 2.

- [ ] **Step 3: Export normalized metadata deterministically**

Change `GraphJson.addressables` to include entry state, nested group identity, and labels. Query groups and entries in address/group/path/GUID order and load labels in label order. Do not export group schema or bundle fields. Keep `addressableCount` as the number of entries.

- [ ] **Step 4: Run export, snapshot, and build checks**

Run:

```powershell
npx vitest run src/snapshot/json-export.test.ts src/snapshot/snapshot.test.ts
npm run typecheck
npm run build
```

Expected: PASS, with deterministic JSON and schema 3 artifact metadata.

- [ ] **Step 5: Write the product and decision documentation**

Create `docs/product/addressables.md` with:

- the three tool signatures and response meanings;
- lookup precedence and ambiguity behavior;
- group inventory fields and the fact that indexed source bytes are not bundle bytes;
- conservative `find_unused_assets` behavior;
- the exact meaning of `reachableOnlyBecauseAddressable`;
- non-Addressables behavior and dynamic string-load limitations;
- read-only Stage 1 and deferred Stage 2 settings.

Record decision 0010: normalize authoring metadata in schema 3, rebuild generated indexes rather than migrating them in place, and keep bundle configuration deferred. Update the graph-model tables, indexing lifecycle, MCP tool count/list, overview limitations, and README tool/schema sections.

- [ ] **Step 6: Add story US-024 and backlog status**

The story acceptance criteria must mirror the approved spec and list proof by parser, store, query, MCP, JSON/snapshot, and real-project layers. Add E11 and US-024 to `docs/stories/backlog.md` with status `implemented` only after Task 6 verification passes; until then use `in_progress`.

- [ ] **Step 7: Check documentation references and commit**

Run:

```powershell
rg -n "Twelve tools|schema version 2|SCHEMA_VERSION = 2|guid.*address.*only" README.md docs/product docs/stories
git diff --check
```

Expected: no stale active product-contract references to the old tool count or entry-only schema.

```powershell
git add src/snapshot/json-export.ts src/snapshot/json-export.test.ts src/snapshot/snapshot.test.ts docs/product/addressables.md docs/product/asset-graph-model.md docs/product/indexing.md docs/product/mcp-tools.md docs/product/overview.md README.md docs/decisions/0010-normalized-addressables-authoring-model.md docs/stories/epics/E11-addressables-discovery/US-024-addressables-discovery.md docs/stories/backlog.md
git commit -m "docs: publish Addressables discovery contract"
```

---

### Task 6: Verify the Complete Feature and Close the Harness Plan

**Files:**
- Modify: `docs/stories/epics/E11-addressables-discovery/US-024-addressables-discovery.md`
- Modify: `docs/stories/backlog.md`
- Move after proof: `docs/plans/active/2026-07-21-addressables-discovery.md` to `docs/plans/completed/2026-07-21-addressables-discovery.md`
- Modify: `docs/plans/completed/README.md`

**Interfaces:**
- Consumes: all prior task commits.
- Produces: repository-wide proof, real-project evidence, completed story state, and completed plan state.

- [ ] **Step 1: Run the repository verification ladder**

Run:

```powershell
npm test
npm run typecheck
npm run build
git diff --check
```

Expected: every command exits 0; all parser, store, query, MCP, export, snapshot, and existing regression tests pass.

- [ ] **Step 2: Build an installable package smoke artifact**

Run:

```powershell
npm pack --dry-run
```

Expected: exit 0; `dist/mcp/server.js`, query implementation, README, and package metadata are present in the dry-run file list.

- [ ] **Step 3: Verify an Addressables-heavy Unity project with explicit authority**

Before this step, obtain or confirm authorization for the external Unity project path because indexing writes its `.asset-memory/index.db`. Then run the built indexer with `force` and call the three MCP tools against representative cases:

```text
1. Known Addressable asset by project path.
2. Same entry by runtime address.
3. Known non-Addressable asset.
4. Group filter plus label filter.
5. Group inventory and direct indexed source-byte count.
6. Entry classified reachableOnlyBecauseAddressable.
7. find_unused_assets with addressableRoots auto and off.
```

Record the exact project path, command, entry/group samples, counts, and limitations in the US-024 Evidence section. Do not commit the external project's live `index.db` from this repository task.

- [ ] **Step 4: Review the diff for scope and unsafe claims**

Run:

```powershell
git diff --stat HEAD~5..HEAD
rg -n -i "safe to delete|bundle size|migration is safe|runtime loaded" README.md docs/product src/mcp
git status --short
```

Expected: only approved Stage 1 surfaces changed; documentation does not equate reference absence with deletion safety, source bytes with bundle size, or registration with runtime loading.

- [ ] **Step 5: Mark story and plan complete**

Change US-024 and the backlog row from `in_progress` to `implemented`. Fill the story Evidence section with fresh command results. Update this plan's progress, validation, decisions, and result; change its status to `Completed`; move it to `docs/plans/completed/`; and add it to `docs/plans/completed/README.md`.

- [ ] **Step 6: Commit completion evidence**

```powershell
git add docs/stories/epics/E11-addressables-discovery/US-024-addressables-discovery.md docs/stories/backlog.md docs/plans/completed/README.md
git add -A docs/plans
git commit -m "test: verify Addressables discovery workflow"
```

Use `git status --short` afterward. Expected: clean worktree.

## Recovery

- Each task is independently committed and can be reverted without rewriting unrelated history.
- Index schema 3 is generated state. Recovery from schema/query failures is to restore the prior package version and rebuild the index with that version.
- Never attempt to downgrade a schema 3 index in place.
- Existing committed schema 2 snapshots remain intact until intentionally regenerated; a new binary snapshot should be committed only in the consumer Unity project after schema 3 verification.

## Completion Criteria

- All three MCP tools answer directly from the index without grep or raw SQL.
- Group membership, addresses, labels, read-only state, reference counts, and deterministic inventory are correct.
- `reachableOnlyBecauseAddressable` is tested and documented as a review signal.
- Existing `find_unused_assets` behavior passes unchanged.
- Old indexes receive explicit re-index handling and `index_project` rebuilds them cleanly.
- JSON/snapshot contracts report schema 3.
- Full tests, type checking, build, package smoke, and authorized real-project checks pass.
- US-024 and this plan contain current evidence and are moved to completed state.
