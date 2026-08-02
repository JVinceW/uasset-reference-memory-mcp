export interface Overview {
  totalAssets: number;
  edgeCount: number;
  unresolvedCount: number;
  typeCounts?: Record<string, number>;
  originCounts?: Record<string, number>;
}
