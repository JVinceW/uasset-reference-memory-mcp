import type {
  AssetNode,
  AssetDetail,
  EdgeDetail,
  EdgeFilters,
  GraphFilters,
  IndexStatus,
  Neighborhood,
  Overview,
  RootTrace,
  SearchFilters,
  UnusedFilters,
} from "./apiTypes";

export interface GraphSource {
  getIndexStatus(): Promise<IndexStatus>;
  getOverview(): Promise<Overview>;
  searchAssets(filters: SearchFilters): Promise<AssetNode[]>;
  resolveAsset(ref: string): Promise<AssetNode>;
  getAssetDetail(ref: string): Promise<AssetDetail>;
  getGraph(filters: GraphFilters): Promise<Neighborhood>;
  getNeighborhood(ref: string, dir: "deps" | "refs", depth: number): Promise<Neighborhood>;
  getEdges(filters: EdgeFilters): Promise<EdgeDetail[]>;
  tracePath(from: string, to: string): Promise<Neighborhood>;
  getRootTrace(ref: string, dir: "deps" | "refs", depth: number, limit: number): Promise<RootTrace>;
  getUnused(filters: UnusedFilters): Promise<AssetNode[]>;
}
