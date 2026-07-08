import type { QueryDb } from "./db.js";
import { resolveRef } from "./traverse.js";

export interface EdgeDetail {
  from: string;
  to: string;
  refKind: string;
  context: string | null;
  fileId: string | null;
  count: number;
}

export interface EdgeQuery {
  /** Source asset ref (path | guid | name). */
  from?: string;
  /** Target asset ref (path | guid | name). */
  to?: string;
  /** Filter by ref_kind. */
  kind?: string;
  limit?: number;
}

/**
 * List the individual reference edges (each with its ref_kind, YAML `context`,
 * and `fileId`) matching the filter — the raw rows behind the aggregated
 * `find_references`/`get_dependencies` views (US-019). At least one of `from`/`to`
 * should be given; an unresolvable endpoint yields an empty list.
 */
export function getEdges(db: QueryDb, q: EdgeQuery = {}): EdgeDetail[] {
  const where: string[] = [];
  const params: unknown[] = [];

  if (q.from !== undefined) {
    const node = resolveRef(db, q.from).node;
    if (!node) return [];
    where.push("e.from_guid = ?");
    params.push(node.guid);
  }
  if (q.to !== undefined) {
    const node = resolveRef(db, q.to).node;
    if (!node) return [];
    where.push("e.to_guid = ?");
    params.push(node.guid);
  }
  if (q.kind !== undefined) {
    where.push("e.ref_kind = ?");
    params.push(q.kind);
  }
  if (where.length === 0) return []; // require at least one endpoint

  const rows = db.all(
    `SELECT af.path AS "from", at.path AS "to", e.ref_kind AS refKind,
            e.context, e.file_id AS fileId, e.count
     FROM edges e
     JOIN assets af ON af.guid = e.from_guid
     JOIN assets at ON at.guid = e.to_guid
     WHERE ${where.join(" AND ")}
     ORDER BY at.path, e.ref_kind, e.context
     LIMIT ?`,
    [...params, q.limit ?? 1000],
  );

  return rows.map((r) => ({
    from: r.from as string,
    to: r.to as string,
    refKind: r.refKind as string,
    context: (r.context as string | null) ?? null,
    fileId: (r.fileId as string | null) ?? null,
    count: (r.count as number) ?? 1,
  }));
}
