import { describe, expect, test } from "vitest";
import { summarizeVerification } from "./summary.js";
import type { VerificationReport } from "./verify.js";

function report(): VerificationReport {
  const missedEdges = Array.from({ length: 11 }, (_, index) => ({
    fromGuid: `from-${index}`,
    toGuid: `to-${index}`,
    fromPath: `Assets/${index}.prefab`,
    toPath: `Assets/${index}.mat`,
    refKind: "USES_MATERIAL" as const,
    sourceAssetType: "Prefab" as const,
    sourceOrigin: "project" as const,
  }));
  return {
    unityVersion: "2022.3.0f1",
    exportedAt: "2026-07-12T00:00:00.000Z",
    verifiedAt: "2026-07-12T00:01:00.000Z",
    unityDependencyCount: 11,
    indexedDependencyCount: 0,
    matchedCount: 0,
    coveragePercent: 0,
    missedEdges,
    extraEdges: [],
    groups: [{ sourceAssetType: "Prefab", sourceOrigin: "project", refKind: "USES_MATERIAL", matchedCount: 0, missedEdgeCount: 11, extraEdgeCount: 0 }],
    unresolvedAssets: [],
    unresolvedDependencies: [],
    guidMismatches: [],
  };
}

describe("summarizeVerification", () => {
  test("returns a bounded preview and points clients to the full report", () => {
    const summary = summarizeVerification(report(), "C:/Project/.asset-memory/verify-report.json");

    expect(summary).toMatchObject({
      status: "differences-found",
      reportPath: "C:/Project/.asset-memory/verify-report.json",
      missedEdgeCount: 11,
      sampleLimit: 10,
      fullDetailsInReport: true,
    });
    expect(summary.samples.missedEdges).toHaveLength(10);
    expect(summary.groups).toHaveLength(1);
  });
});
