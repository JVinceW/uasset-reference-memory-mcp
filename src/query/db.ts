/**
 * Minimal read interface the query layer depends on, so the same queries run on
 * better-sqlite3 (server) and sql.js (browser). Any object with an `all(sql,
 * params)` returning object-rows satisfies it — GraphStore and the WASM store
 * both do.
 */
export interface QueryDb {
  all(sql: string, params?: unknown[]): Record<string, unknown>[];
}
