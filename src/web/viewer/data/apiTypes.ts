export interface Overview {
  totalAssets: number;
  byType: Record<string, number>;
  byOrigin: Record<string, number>;
  edgeCount: number;
  unresolvedCount: number;
  brokenRefGuids: number;
  topReferenced: TopReferencedAsset[];
}

export interface TopReferencedAsset {
  path: string;
  name: string;
  refCount: number;
}

export interface IndexStatus {
  schemaVersion: string | null;
  expectedSchemaVersion: number;
  projectRoot: string | null;
  indexedAt: string | null;
  assetCount: number;
  edgeCount: number;
  unresolvedCount: number;
  addressableCount: number;
  packagesLockMtime: string | null;
  packageDiscoveryFingerprint: string | null;
  unityVersion: string | null;
}

export type AssetType =
  | "Prefab"
  | "Scene"
  | "Material"
  | "Texture"
  | "Script"
  | "Shader"
  | "AnimationClip"
  | "AnimatorController"
  | "ScriptableObject"
  | "Sprite"
  | "AudioClip"
  | "Font"
  | "Model"
  | "Folder"
  | "Other";

export type Origin = "project" | "package" | "builtin";

export interface AssetNode {
  guid: string;
  path: string;
  name: string;
  assetType: AssetType;
  origin: Origin;
  packageId: string | null;
  fileSize: number | null;
  mtime: number | null;
  isBinary: boolean;
}

export interface SearchFilters {
  name?: string;
  type?: AssetType;
  pathPrefix?: string;
  origin?: Origin;
  minRefs?: number;
  maxRefs?: number;
  limit?: number;
}

export interface CyNode {
  data: {
    id: string;
    label: string;
    type: AssetType;
    origin: Origin;
    path: string;
    distance: number;
    degree?: number;
    inbound?: number;
    outbound?: number;
  };
}

export interface CyEdge {
  data: {
    id: string;
    source: string;
    target: string;
    kind: string;
    context: string | null;
    fileId?: string | null;
    count?: number;
  };
}

export interface Neighborhood {
  rootId: string;
  nodes: CyNode[];
  edges: CyEdge[];
  totalCandidates?: number;
  truncated?: boolean;
}

export interface RootTrace extends Neighborhood {
  dir: "deps" | "refs";
  depth: number;
  byDistance: Record<string, number>;
}

export interface BrokenReference {
  fromGuid: string;
  fromPath: string | null;
  fromName: string | null;
  fromType: AssetType | null;
  fromOrigin: Origin | null;
  toGuid: string;
  context: string | null;
  count: number;
}

export interface EdgeDetail {
  from: string;
  to: string;
  refKind: string;
  context: string | null;
  fileId: string | null;
  count: number;
}

export interface EdgeFilters {
  from?: string;
  to?: string;
  kind?: string;
  limit?: number;
}

export interface AssetDetail {
  asset: AssetNode;
  inbound: EdgeDetail[];
  outbound: EdgeDetail[];
  inboundCount: number;
  outboundCount: number;
}

export interface GraphFilters {
  types?: AssetType[];
  origins?: Origin[];
  pathPrefix?: string;
  hideBuiltin?: boolean;
  limit?: number;
}

export interface UnusedFilters {
  scope?: string;
  includeScripts?: boolean;
  addressableRoots?: "auto" | "on" | "off";
}
