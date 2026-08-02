import type { QueryDb } from "../query/db.js";
import { findReferences, getDependencies, resolveRef, type Subgraph } from "../query/traverse.js";
import { getEdges } from "../query/edges.js";
import { findUnusedAssets } from "../query/unused.js";
import { tracePath, type TracedPath } from "../query/trace.js";
import { getOverview, searchAssets } from "../query/search.js";
import type { AssetType, Origin } from "../indexer/types.js";
import {
  getAssetDetail,
  getBudgetedGraph,
  getIndexStatus,
  getRootTrace,
} from "../query/viewer.js";

export interface ApiResponse {
  status: number;
  body: unknown;
}

type Params = Record<string, string | undefined>;

/**
 * Pure request router for the viewer's JSON API. Maps a path + query params to
 * the shared query layer; returns a status and JSON-serializable body so it can
 * be tested without a live HTTP server.
 */
export function handleApi(db: QueryDb, pathname: string, params: Params): ApiResponse {
  switch (pathname) {
    case "/api/index-status":
      return ok(getIndexStatus(db));

    case "/api/overview":
      return ok(getOverview(db));

    case "/api/search":
      return ok(
        searchAssets(db, {
          name: params.name,
          type: params.type as AssetType | undefined,
          pathPrefix: params.pathPrefix,
          origin: params.origin as Origin | undefined,
          minRefs: intOrUndef(params.minRefs),
          maxRefs: intOrUndef(params.maxRefs),
          limit: intOrUndef(params.limit),
        }),
      );

    case "/api/resolve": {
      const r = resolveRef(db, params.ref ?? "");
      return r.node
        ? ok(r.node)
        : { status: 404, body: { error: r.reason, candidates: r.candidates ?? [] } };
    }

    case "/api/asset-detail": {
      const detail = getAssetDetail(db, params.ref ?? "", intOrUndef(params.limit) ?? 100);
      return detail
        ? ok(detail)
        : { status: 404, body: { error: "not-found" } };
    }

    case "/api/graph":
      return ok(
        getBudgetedGraph(db, {
          types: listParam(params.types) as AssetType[] | undefined,
          origins: listParam(params.origins) as Origin[] | undefined,
          pathPrefix: params.pathPrefix,
          hideBuiltin: boolParam(params.hideBuiltin),
          limit: intOrUndef(params.limit),
        }),
      );

    case "/api/neighborhood": {
      const ref = params.ref ?? "";
      const resolved = resolveRef(db, ref);
      if (!resolved.node) {
        return { status: 404, body: { error: resolved.reason, candidates: resolved.candidates ?? [] } };
      }
      const depth = intOrUndef(params.depth) ?? 1;
      const sub =
        params.dir === "refs"
          ? findReferences(db, ref, depth)
          : getDependencies(db, ref, depth);
      return ok(toCyElements(sub!));
    }

    case "/api/root-trace": {
      const dir = params.dir === "refs" ? "refs" : "deps";
      const trace = getRootTrace(
        db,
        params.ref ?? "",
        dir,
        intOrUndef(params.depth) ?? 5,
        intOrUndef(params.limit) ?? 320,
      );
      return trace
        ? ok(trace)
        : { status: 404, body: { error: "not-found" } };
    }

    case "/api/edges":
      return ok(
        getEdges(db, { from: params.from, to: params.to, kind: params.kind, limit: intOrUndef(params.limit) }),
      );

    case "/api/trace": {
      const path = tracePath(db, params.from ?? "", params.to ?? "");
      return path ? ok(pathToCyElements(path)) : { status: 404, body: { error: "no-path" } };
    }

    case "/api/unused":
      return ok(
        findUnusedAssets(db, {
          scope: params.scope,
          includeScripts: params.includeScripts === "true",
          addressableRoots: params.addressableRoots as "auto" | "on" | "off" | undefined,
        }),
      );

    default:
      return { status: 404, body: { error: "unknown-route" } };
  }
}

function ok(body: unknown): ApiResponse {
  return { status: 200, body };
}

function intOrUndef(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? undefined : n;
}

function listParam(v: string | undefined): string[] | undefined {
  const values = v?.split(",").map((item) => item.trim()).filter(Boolean);
  return values && values.length > 0 ? values : undefined;
}

function boolParam(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  return v === "true" || v === "1";
}

export interface CyElements {
  rootId: string;
  nodes: { data: Record<string, unknown> }[];
  edges: { data: Record<string, unknown> }[];
}

/** Serialize a traversal subgraph into Cytoscape node/edge element data. */
export function toCyElements(sub: Subgraph): CyElements {
  return {
    rootId: sub.root.guid,
    nodes: sub.nodes.map((n) => ({
      data: {
        id: n.guid,
        label: n.name,
        type: n.assetType,
        origin: n.origin,
        path: n.path,
        distance: n.distance,
      },
    })),
    edges: sub.edges.map((e) => ({
      data: {
        id: `${e.fromGuid}->${e.toGuid}:${e.refKind}:${e.context ?? ""}`,
        source: e.fromGuid,
        target: e.toGuid,
        kind: e.refKind,
        context: e.context,
        fileId: e.fileId,
        count: e.count,
      },
    })),
  };
}

function pathToCyElements(path: TracedPath): CyElements {
  return {
    rootId: path.nodes[0]?.guid ?? "",
    nodes: path.nodes.map((n, i) => ({
      data: { id: n.guid, label: n.name, type: n.assetType, origin: n.origin, path: n.path, distance: i },
    })),
    edges: path.edges.map((e) => ({
      data: {
        id: `${e.fromGuid}->${e.toGuid}`,
        source: e.fromGuid,
        target: e.toGuid,
        kind: e.refKind,
        context: e.context,
        fileId: e.fileId,
        count: e.count,
      },
    })),
  };
}
