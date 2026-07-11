import type { VerificationEdge, VerificationGroup, VerificationReport } from "./verify.js";

export const DEFAULT_SAMPLE_LIMIT = 10;

export interface VerificationSummary {
  status: "clean" | "differences-found";
  unityVersion: string;
  exportedAt: string;
  verifiedAt: string;
  reportPath: string;
  unityDependencyCount: number;
  indexedDependencyCount: number;
  matchedCount: number;
  coveragePercent: number | null;
  missedEdgeCount: number;
  extraEdgeCount: number;
  unresolvedAssetCount: number;
  unresolvedDependencyCount: number;
  guidMismatchCount: number;
  groups: VerificationGroup[];
  samples: {
    missedEdges: VerificationEdge[];
    extraEdges: VerificationEdge[];
  };
  sampleLimit: number;
  fullDetailsInReport: true;
}

export function summarizeVerification(
  report: VerificationReport,
  reportPath: string,
  sampleLimit = DEFAULT_SAMPLE_LIMIT,
): VerificationSummary {
  const hasDifferences =
    report.missedEdges.length > 0 ||
    report.extraEdges.length > 0 ||
    report.unresolvedAssets.length > 0 ||
    report.unresolvedDependencies.length > 0 ||
    report.guidMismatches.length > 0;
  return {
    status: hasDifferences ? "differences-found" : "clean",
    unityVersion: report.unityVersion,
    exportedAt: report.exportedAt,
    verifiedAt: report.verifiedAt,
    reportPath,
    unityDependencyCount: report.unityDependencyCount,
    indexedDependencyCount: report.indexedDependencyCount,
    matchedCount: report.matchedCount,
    coveragePercent: report.coveragePercent,
    missedEdgeCount: report.missedEdges.length,
    extraEdgeCount: report.extraEdges.length,
    unresolvedAssetCount: report.unresolvedAssets.length,
    unresolvedDependencyCount: report.unresolvedDependencies.length,
    guidMismatchCount: report.guidMismatches.length,
    groups: report.groups,
    samples: {
      missedEdges: report.missedEdges.slice(0, sampleLimit),
      extraEdges: report.extraEdges.slice(0, sampleLimit),
    },
    sampleLimit,
    fullDetailsInReport: true,
  };
}
