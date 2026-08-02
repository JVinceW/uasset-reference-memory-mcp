import type { GraphSource } from "./GraphSource";
import type {
  AssetNode,
  EdgeDetail,
  EdgeFilters,
  Neighborhood,
  Overview,
  SearchFilters,
  UnusedFilters,
} from "./apiTypes";

export class HttpGraphSource implements GraphSource {
  async getOverview(): Promise<Overview> {
    return this.get("/api/overview", {});
  }

  async searchAssets(filters: SearchFilters): Promise<AssetNode[]> {
    return this.get("/api/search", filters);
  }

  async resolveAsset(ref: string): Promise<AssetNode> {
    return this.get("/api/resolve", { ref });
  }

  async getNeighborhood(ref: string, dir: "deps" | "refs", depth: number): Promise<Neighborhood> {
    return this.get("/api/neighborhood", { ref, dir, depth });
  }

  async getEdges(filters: EdgeFilters): Promise<EdgeDetail[]> {
    return this.get("/api/edges", filters);
  }

  async tracePath(from: string, to: string): Promise<Neighborhood> {
    return this.get("/api/trace", { from, to });
  }

  async getUnused(filters: UnusedFilters): Promise<AssetNode[]> {
    return this.get("/api/unused", filters);
  }

  private async get<T>(path: string, params: object): Promise<T> {
    const url = new URL(path, window.location.origin);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }

    const response = await fetch(url);
    const body = (await response.json()) as unknown;

    if (!response.ok) {
      const error = body && typeof body === "object" && "error" in body ? String(body.error) : response.statusText;
      throw new Error(error);
    }

    return body as T;
  }
}
