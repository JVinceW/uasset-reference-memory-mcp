import { existsSync } from "node:fs";
import { GraphStore } from "../store/graph-store.js";
import { findReferences, getDependencies, type Subgraph } from "../query/traverse.js";
import { getEdges } from "../query/edges.js";
import { writeGraphJson } from "../snapshot/json-export.js";
import { createAdr, listAdrs, getAdr, updateAdr } from "../adr/adr.js";
import { findUnusedAssets } from "../query/unused.js";
import { dirname, join } from "node:path";
import { tracePath } from "../query/trace.js";
import { getOverview, searchAssets } from "../query/search.js";
import { indexProject as defaultIndexProject } from "../indexer/index-project.js";
import { ensureLiveIndex } from "../snapshot/snapshot.js";
import { loadConfig, configPathFor, type AddressableRoots } from "../config/project-config.js";
import type { AssetType, Origin } from "../indexer/types.js";
import { runVerification } from "../verification/run.js";
import { summarizeVerification } from "../verification/summary.js";
import {
  getAddressableInfo,
  listAddressableGroups,
  searchAddressables,
} from "../query/addressables.js";
import { SCHEMA_VERSION } from "../store/schema.js";

export interface ToolCtx {
  /** Path to the index SQLite file. */
  dbPath: string;
  /** Unity project root for index_project when no explicit path is given. */
  projectRoot?: string;
  /** Injectable for tests; defaults to the real indexer. */
  indexProject?: typeof defaultIndexProject;
}

type Args = Record<string, unknown>;

const LIST_LIMIT = 200;

/** Dispatch an MCP tool call to the shared query layer; returns JSON-able data. */
export async function runTool(ctx: ToolCtx, name: string, args: Args = {}): Promise<unknown> {
  // Restore the live index from a committed snapshot on first use (fresh clone).
  if (name !== "index_project") await ensureLiveIndex(ctx.dbPath);

  switch (name) {
    case "index_project": {
      const root = (args.path as string) ?? ctx.projectRoot;
      if (!root) return { error: "no-project", message: "provide `path` or configure a project root" };
      const index = ctx.indexProject ?? defaultIndexProject;
      return index(root, { dbPath: ctx.dbPath, force: args.force === true });
    }

    case "index_status":
      return withStore(ctx, (store) => ({
        dbPath: ctx.dbPath,
        schemaVersion: store.getMeta("schema_version"),
        projectRoot: store.getMeta("project_root"),
        indexedAt: store.getMeta("indexed_at"),
        assetCount: store.assetCount(),
        edgeCount: store.edgeCount(),
        unresolvedCount: store.unresolvedCount(),
        packagesLockMtime: store.getMeta("packages_lock_mtime"),
      }));

    case "verify_index": {
      if (typeof args.verifyJsonPath !== "string" || args.verifyJsonPath === "") {
        return { error: "missing-verify-json", message: "provide verifyJsonPath" };
      }
      try {
        const { report, reportPath } = await runVerification({
          dbPath: ctx.dbPath,
          verifyJsonPath: args.verifyJsonPath,
        });
        return summarizeVerification(report, reportPath);
      } catch (error) {
        return {
          error: "verification-failed",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }

    case "get_dependencies":
      return withStore(ctx, (store) =>
        subgraphSummary(getDependencies(store, String(args.asset ?? ""), depthOf(args)), args.asset),
      );

    case "find_references":
      return withStore(ctx, (store) =>
        subgraphSummary(findReferences(store, String(args.asset ?? ""), depthOf(args)), args.asset),
      );

    case "get_edges":
      return withStore(ctx, (store) => {
        const edges = getEdges(store, {
          from: args.from as string | undefined,
          to: args.to as string | undefined,
          kind: args.kind as string | undefined,
          limit: args.limit as number | undefined,
        });
        return {
          total: edges.length,
          note: "each row is one reference site: ref_kind + YAML property (context) + fileId",
          edges,
        };
      });

    case "trace_path":
      return withStore(ctx, (store) => {
        const path = tracePath(store, String(args.from ?? ""), String(args.to ?? ""));
        if (!path) return { error: "no-path", from: args.from, to: args.to };
        return { hops: path.edges.length, chain: path.nodes.map((n) => n.path) };
      });

    case "find_unused_assets":
      return withStore(ctx, (store) => {
        const mode: AddressableRoots =
          (args.addressableRoots as AddressableRoots | undefined) ??
          loadConfig(configPathFor(ctx.dbPath)).unused.addressableRoots;
        const unused = findUnusedAssets(store, {
          scope: args.scope as string | undefined,
          includeScripts: args.includeScripts === true,
          addressableRoots: mode,
        });
        return {
          total: unused.length,
          totalBytes: unused.reduce((s, n) => s + (n.fileSize ?? 0), 0),
          addressableRoots: mode,
          note:
            mode === "off"
              ? "Addressable entries NOT counted as roots — expect over-reporting if the project uses Addressables"
              : "Addressable entries counted as roots (code-based Resources.Load refs still not tracked)",
          assets: unused.slice(0, LIST_LIMIT).map((n) => ({
            path: n.path,
            type: n.assetType,
            bytes: n.fileSize,
          })),
        };
      });

    case "search_assets":
      return withStore(ctx, (store) => {
        const results = searchAssets(store, {
          name: args.name as string | undefined,
          type: args.type as AssetType | undefined,
          pathPrefix: args.pathPrefix as string | undefined,
          origin: args.origin as Origin | undefined,
          minRefs: args.minRefs as number | undefined,
          maxRefs: args.maxRefs as number | undefined,
          limit: args.limit as number | undefined,
        });
        return {
          total: results.length,
          assets: results.slice(0, LIST_LIMIT).map((n) => ({
            path: n.path,
            type: n.assetType,
            origin: n.origin,
          })),
        };
      });

    case "get_addressable_info":
      return withCurrentStore(ctx, (store) =>
        getAddressableInfo(store, String(args.asset ?? "")),
      );

    case "search_addressables":
      return withCurrentStore(ctx, (store) =>
        searchAddressables(store, {
          query: args.query as string | undefined,
          group: args.group as string | undefined,
          label: args.label as string | undefined,
          pathPrefix: args.pathPrefix as string | undefined,
          type: args.type as AssetType | undefined,
          reachableOnlyBecauseAddressable: args.reachableOnlyBecauseAddressable as boolean | undefined,
          limit: args.limit as number | undefined,
        }),
      );

    case "list_addressable_groups":
      return withCurrentStore(ctx, (store) => {
        const groups = listAddressableGroups(store);
        return { total: groups.length, groups };
      });

    case "get_overview":
      return withStore(ctx, (store) => getOverview(store));

    case "export_graph_json":
      return withStoreAsync(ctx, async (store) => {
        const out = (args.out as string | undefined) ?? join(dirname(ctx.dbPath), "graph.json");
        const g = await writeGraphJson(store, out);
        return { path: out, ...g.meta };
      });

    case "manage_adr": {
      const adrDir = join(dirname(ctx.dbPath), "adrs");
      const action = String(args.action ?? "");
      const fields = {
        title: args.title as string,
        status: args.status as string | undefined,
        context: args.context as string | undefined,
        decision: args.decision as string | undefined,
        consequences: args.consequences as string | undefined,
      };
      switch (action) {
        case "create":
          if (!fields.title) return { error: "missing-title" };
          return createAdr(adrDir, fields);
        case "list":
          return { adrs: await listAdrs(adrDir) };
        case "get":
          return (await getAdr(adrDir, Number(args.id))) ?? { error: "not-found", id: args.id };
        case "update":
          return (await updateAdr(adrDir, Number(args.id), fields)) ?? { error: "not-found", id: args.id };
        default:
          return { error: "unknown-action", action, valid: ["create", "list", "get", "update"] };
      }
    }

    default:
      return { error: "unknown-tool", name };
  }
}

function depthOf(args: Args): number {
  const d = args.depth;
  return typeof d === "number" ? d : 1;
}

function withStore<T>(ctx: ToolCtx, fn: (store: GraphStore) => T): T | { error: string; message: string } {
  if (!existsSync(ctx.dbPath)) {
    return noIndexError(ctx);
  }
  const store = GraphStore.open(ctx.dbPath);
  try {
    return fn(store);
  } finally {
    store.close();
  }
}

function withCurrentStore<T>(
  ctx: ToolCtx,
  fn: (store: GraphStore) => T,
): T | { error: string; message: string; expected?: number; actual?: number | null } {
  if (!existsSync(ctx.dbPath)) {
    return noIndexError(ctx);
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

async function withStoreAsync<T>(
  ctx: ToolCtx,
  fn: (store: GraphStore) => Promise<T>,
): Promise<T | { error: string; message: string }> {
  if (!existsSync(ctx.dbPath)) {
    return noIndexError(ctx);
  }
  const store = GraphStore.open(ctx.dbPath);
  try {
    return await fn(store);
  } finally {
    store.close();
  }
}

function noIndexError(ctx: ToolCtx): { error: string; message: string } {
  return { error: "no-index", message: `no index at ${ctx.dbPath} — run index_project first` };
}

function subgraphSummary(sub: Subgraph | null, asset: unknown): unknown {
  if (!sub) return { error: "not-found", asset };
  return {
    root: sub.root.path,
    total: sub.nodes.length - 1,
    edges: sub.edges.length,
    nodes: sub.nodes
      .filter((n) => n.guid !== sub.root.guid)
      .slice(0, LIST_LIMIT)
      .map((n) => ({ path: n.path, type: n.assetType, origin: n.origin, distance: n.distance })),
  };
}
