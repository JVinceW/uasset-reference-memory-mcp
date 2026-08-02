import type {
  AssetNode,
  EdgeDetail,
  EdgeFilters,
  Neighborhood,
  Overview,
  SearchFilters,
  UnusedFilters,
} from "./apiTypes";

export interface GraphSource {
  getOverview(): Promise<Overview>;
  searchAssets(filters: SearchFilters): Promise<AssetNode[]>;
  resolveAsset(ref: string): Promise<AssetNode>;
  getNeighborhood(ref: string, dir: "deps" | "refs", depth: number): Promise<Neighborhood>;
  getEdges(filters: EdgeFilters): Promise<EdgeDetail[]>;
  tracePath(from: string, to: string): Promise<Neighborhood>;
  getUnused(filters: UnusedFilters): Promise<AssetNode[]>;
}
