import type { Overview } from "./apiTypes";

export interface GraphSource {
  getOverview(): Promise<Overview>;
}
