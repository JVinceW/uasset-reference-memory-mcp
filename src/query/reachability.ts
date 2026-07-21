import type { QueryDb } from "./db.js";
import { resolveRef } from "./traverse.js";

export interface ReachabilityOptions {
  roots?: string[];
  includeAddressables: boolean;
}

export function findReachableGuids(
  db: QueryDb,
  options: ReachabilityOptions,
): Set<string> {
  const params: unknown[] = [];
  let rootsSql: string;

  if (options.roots) {
    const guids = options.roots
      .map((root) => resolveRef(db, root).node?.guid)
      .filter((guid): guid is string => Boolean(guid));
    rootsSql = "SELECT value AS guid FROM json_each(?)";
    params.push(JSON.stringify(guids));
  } else {
    rootsSql = "SELECT guid FROM assets WHERE asset_type = 'Scene' OR path LIKE '%/Resources/%'";
  }

  if (options.includeAddressables) {
    rootsSql = `${rootsSql} UNION SELECT guid FROM addressable_entries`;
  }

  const rows = db.all(
    `WITH RECURSIVE
       roots(guid) AS (${rootsSql}),
       reach(guid) AS (
         SELECT guid FROM roots
         UNION
         SELECT e.to_guid FROM edges e JOIN reach r ON e.from_guid = r.guid
       )
     SELECT guid FROM reach`,
    params,
  );
  return new Set(rows.map((row) => row.guid as string));
}
