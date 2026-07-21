import type { AssetType, Origin } from "../indexer/types.js";
import { rowToNode } from "../store/row.js";
import type { QueryDb } from "./db.js";
import { findReachableGuids } from "./reachability.js";

const GUID_RE = /^[0-9a-f]{32}$/i;
const MAX_AMBIGUITY_CANDIDATES = 20;
const MAX_SEARCH_RESULTS = 200;

export interface AddressableAssetSummary {
  guid: string;
  path: string;
  name: string;
  type: AssetType;
  origin: Origin;
}

export interface AddressableGroupRef {
  guid: string;
  name: string;
  path: string;
}

export interface AddressableMetadata {
  address: string;
  group: AddressableGroupRef;
  readOnly: boolean;
  labels: string[];
}

export type AddressableLookupResult =
  | {
      status: "found";
      asset: AddressableAssetSummary;
      isAddressable: boolean;
      addressable: AddressableMetadata | null;
      incomingReferences: number;
      outgoingReferences: number;
      reachableOnlyBecauseAddressable: boolean;
    }
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

export interface AddressableSearchEntry {
  asset: AddressableAssetSummary;
  address: string;
  group: AddressableGroupRef;
  readOnly: boolean;
  labels: string[];
  incomingReferences: number;
  outgoingReferences: number;
  reachableOnlyBecauseAddressable: boolean;
}

export interface AddressableSearchResult {
  total: number;
  truncated: boolean;
  entries: AddressableSearchEntry[];
}

export interface AddressableGroupSummary {
  guid: string;
  name: string;
  path: string;
  entryCount: number;
  indexedSourceBytes: number;
  labels: string[];
}

function assetSummary(row: Record<string, unknown>): AddressableAssetSummary {
  const asset = rowToNode(row);
  return {
    guid: asset.guid,
    path: asset.path,
    name: asset.name,
    type: asset.assetType,
    origin: asset.origin,
  };
}

function ambiguous(input: string, rows: Record<string, unknown>[]): AddressableLookupResult {
  return {
    status: "ambiguous",
    input,
    candidates: rows.slice(0, MAX_AMBIGUITY_CANDIDATES).map(assetSummary),
  };
}

function labelsByEntry(db: QueryDb): Map<string, string[]> {
  const labels = new Map<string, string[]>();
  for (const row of db.all(
    "SELECT entry_guid, label FROM addressable_entry_labels ORDER BY entry_guid, label",
  )) {
    const guid = row.entry_guid as string;
    const values = labels.get(guid) ?? [];
    values.push(row.label as string);
    labels.set(guid, values);
  }
  return labels;
}

function referenceCount(db: QueryDb, column: "from_guid" | "to_guid", guid: string): number {
  const row = db.all(`SELECT COALESCE(SUM(count), 0) AS n FROM edges WHERE ${column} = ?`, [guid])[0];
  return (row?.n as number) ?? 0;
}

export function getAddressableInfo(db: QueryDb, input: string): AddressableLookupResult {
  let rows: Record<string, unknown>[] = [];

  if (GUID_RE.test(input)) {
    rows = db.all("SELECT * FROM assets WHERE guid = ?", [input.toLowerCase()]);
  }
  if (rows.length === 0) {
    rows = db.all("SELECT * FROM assets WHERE path = ?", [input]);
  }
  if (rows.length === 0) {
    const byName = db.all("SELECT * FROM assets WHERE name = ? ORDER BY path", [input]);
    if (byName.length > 1) return ambiguous(input, byName);
    rows = byName;
  }
  if (rows.length === 0) {
    const byAddress = db.all(
      `SELECT a.* FROM addressable_entries ae
       JOIN assets a ON a.guid = ae.guid
       WHERE ae.address = ?
       ORDER BY a.path`,
      [input],
    );
    if (byAddress.length > 1) return ambiguous(input, byAddress);
    rows = byAddress;
  }

  const row = rows[0];
  if (!row) return { status: "not-found", input };

  const guid = row.guid as string;
  const addressableRow = db.all(
    `SELECT ae.address, ae.read_only, ag.group_guid, ag.name AS group_name, ag.path AS group_path
     FROM addressable_entries ae
     JOIN addressable_groups ag ON ag.group_guid = ae.group_guid
     WHERE ae.guid = ?`,
    [guid],
  )[0];
  const baseReachable = findReachableGuids(db, { includeAddressables: false });
  const addressable = addressableRow
    ? {
        address: addressableRow.address as string,
        group: {
          guid: addressableRow.group_guid as string,
          name: addressableRow.group_name as string,
          path: addressableRow.group_path as string,
        },
        readOnly: addressableRow.read_only === 1,
        labels: labelsByEntry(db).get(guid) ?? [],
      }
    : null;

  return {
    status: "found",
    asset: assetSummary(row),
    isAddressable: addressable !== null,
    addressable,
    incomingReferences: referenceCount(db, "to_guid", guid),
    outgoingReferences: referenceCount(db, "from_guid", guid),
    reachableOnlyBecauseAddressable: addressable !== null && !baseReachable.has(guid),
  };
}

export function searchAddressables(
  db: QueryDb,
  filters: AddressableSearchFilters = {},
): AddressableSearchResult {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.query !== undefined) {
    clauses.push("(a.name LIKE ? OR a.path LIKE ? OR ae.address LIKE ?)");
    const pattern = `%${filters.query}%`;
    params.push(pattern, pattern, pattern);
  }
  if (filters.group !== undefined) {
    clauses.push("ag.name LIKE ?");
    params.push(`%${filters.group}%`);
  }
  if (filters.label !== undefined) {
    clauses.push(
      "EXISTS (SELECT 1 FROM addressable_entry_labels filter_label WHERE filter_label.entry_guid = ae.guid AND filter_label.label = ?)",
    );
    params.push(filters.label);
  }
  if (filters.pathPrefix !== undefined) {
    clauses.push("a.path LIKE ?");
    params.push(`${filters.pathPrefix}%`);
  }
  if (filters.type !== undefined) {
    clauses.push("a.asset_type = ?");
    params.push(filters.type);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.all(
    `SELECT a.*, ae.address, ae.read_only, ag.group_guid, ag.name AS group_name,
            ag.path AS group_path,
            COALESCE((SELECT SUM(e.count) FROM edges e WHERE e.to_guid = a.guid), 0) AS incoming_count,
            COALESCE((SELECT SUM(e.count) FROM edges e WHERE e.from_guid = a.guid), 0) AS outgoing_count
     FROM addressable_entries ae
     JOIN assets a ON a.guid = ae.guid
     JOIN addressable_groups ag ON ag.group_guid = ae.group_guid
     ${where}
     ORDER BY a.path COLLATE NOCASE, a.path, ae.address`,
    params,
  );
  const baseReachable = findReachableGuids(db, { includeAddressables: false });
  const labels = labelsByEntry(db);
  let entries = rows.map((row): AddressableSearchEntry => ({
    asset: assetSummary(row),
    address: row.address as string,
    group: {
      guid: row.group_guid as string,
      name: row.group_name as string,
      path: row.group_path as string,
    },
    readOnly: row.read_only === 1,
    labels: labels.get(row.guid as string) ?? [],
    incomingReferences: row.incoming_count as number,
    outgoingReferences: row.outgoing_count as number,
    reachableOnlyBecauseAddressable: !baseReachable.has(row.guid as string),
  }));

  if (filters.reachableOnlyBecauseAddressable !== undefined) {
    entries = entries.filter(
      (entry) =>
        entry.reachableOnlyBecauseAddressable === filters.reachableOnlyBecauseAddressable,
    );
  }

  const requestedLimit = Number.isFinite(filters.limit) ? Math.trunc(filters.limit!) : MAX_SEARCH_RESULTS;
  const limit = Math.min(MAX_SEARCH_RESULTS, Math.max(1, requestedLimit));
  const total = entries.length;
  return { total, truncated: total > limit, entries: entries.slice(0, limit) };
}

export function listAddressableGroups(db: QueryDb): AddressableGroupSummary[] {
  const rows = db.all(
    `SELECT ag.group_guid, ag.name, ag.path,
            COUNT(ae.guid) AS entry_count,
            COALESCE(SUM(a.file_size), 0) AS indexed_source_bytes
     FROM addressable_groups ag
     LEFT JOIN addressable_entries ae ON ae.group_guid = ag.group_guid
     LEFT JOIN assets a ON a.guid = ae.guid
     GROUP BY ag.group_guid, ag.name, ag.path
     ORDER BY ag.name COLLATE NOCASE, ag.name, ag.path`,
  );
  const labelRows = db.all(
    `SELECT ae.group_guid, l.label
     FROM addressable_entries ae
     JOIN addressable_entry_labels l ON l.entry_guid = ae.guid
     GROUP BY ae.group_guid, l.label
     ORDER BY ae.group_guid, l.label`,
  );
  const labels = new Map<string, string[]>();
  for (const row of labelRows) {
    const guid = row.group_guid as string;
    const values = labels.get(guid) ?? [];
    values.push(row.label as string);
    labels.set(guid, values);
  }

  return rows.map((row) => ({
    guid: row.group_guid as string,
    name: row.name as string,
    path: row.path as string,
    entryCount: row.entry_count as number,
    indexedSourceBytes: row.indexed_source_bytes as number,
    labels: labels.get(row.group_guid as string) ?? [],
  }));
}
