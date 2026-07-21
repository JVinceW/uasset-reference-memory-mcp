import type { QueryDb } from "./db.js";
import { rowToNode } from "../store/row.js";
import type { AddressableRoots } from "../config/project-config.js";
import type { AssetNode } from "../indexer/types.js";
import { findReachableGuids } from "./reachability.js";

export interface UnusedOptions {
  /** Restrict results to assets whose path starts with this prefix. */
  scope?: string;
  /** Explicit entry-point refs; defaults to all Scenes + Resources/ assets. */
  roots?: string[];
  /** Include Script assets (off by default: code refs aren't in the graph). */
  includeScripts?: boolean;
  /** Treat Addressable entries as roots: 'auto' (if any present) | 'on' | 'off'. */
  addressableRoots?: AddressableRoots;
}

/** Resolve whether Addressable entries should be used as roots for this call. */
function useAddressables(db: QueryDb, mode: AddressableRoots): boolean {
  if (mode === "on") return true;
  if (mode === "off") return false;
  const n = (db.all("SELECT COUNT(*) AS n FROM addressable_entries")[0]?.n as number) ?? 0;
  return n > 0; // auto
}

/**
 * Project-origin assets not reachable from any root entry point (US-006).
 * Roots default to all Scenes and everything under a `Resources/` folder.
 * Folders (and Scripts, unless `includeScripts`) are excluded to avoid noise.
 * Sorted by file size descending — biggest cleanup wins first.
 */
export function findUnusedAssets(db: QueryDb, opts: UnusedOptions = {}): AssetNode[] {
  const reachable = findReachableGuids(db, {
    roots: opts.roots,
    includeAddressables: useAddressables(db, opts.addressableRoots ?? "auto"),
  });
  const params: unknown[] = [];
  const excludedTypes = opts.includeScripts ? ["Folder"] : ["Folder", "Script"];
  const typePlaceholders = excludedTypes.map(() => "?").join(", ");
  params.push(...excludedTypes);

  let scopeClause = "";
  if (opts.scope) {
    scopeClause = "AND a.path LIKE ?";
    params.push(`${opts.scope}%`);
  }

  const sql = `SELECT a.* FROM assets a
    WHERE a.origin = 'project'
      AND a.asset_type NOT IN (${typePlaceholders})
      ${scopeClause}
    ORDER BY (a.file_size IS NULL), a.file_size DESC, a.path`;

  return db
    .all(sql, params)
    .filter((row) => !reachable.has(row.guid as string))
    .map(rowToNode);
}
