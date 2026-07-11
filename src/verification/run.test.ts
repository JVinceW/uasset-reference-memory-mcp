import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { GraphStore } from "../store/graph-store.js";
import { parseVerificationExport, runVerification } from "./run.js";
import type { AssetNode, Edge } from "../indexer/types.js";

const guid = (value: string) => value.repeat(32);
const dirs: string[] = [];

function node(overrides: Partial<AssetNode> & Pick<AssetNode, "guid" | "path">): AssetNode {
  return {
    name: overrides.path.slice(overrides.path.lastIndexOf("/") + 1),
    assetType: "Prefab",
    origin: "project",
    packageId: null,
    fileSize: 1,
    mtime: 1,
    isBinary: false,
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("runVerification", () => {
  test("writes the complete report before recording verify_last_run", async () => {
    const dir = await mkdtemp(join(tmpdir(), "verification-"));
    dirs.push(dir);
    const dbPath = join(dir, "index.db");
    const verifyPath = join(dir, "verify.json");
    const reportPath = join(dir, "verify-report.json");
    const store = GraphStore.open(dbPath);
    const source = node({ guid: guid("a"), path: "Assets/Player.prefab" });
    const target = node({ guid: guid("b"), path: "Assets/Body.mat", assetType: "Material" });
    const edge: Edge = {
      fromGuid: source.guid,
      toGuid: target.guid,
      refKind: "USES_MATERIAL",
      fileId: null,
      context: "m_Materials",
      count: 2,
    };
    store.upsertNodes([source, target]);
    store.insertEdges([edge]);
    store.close();
    await writeFile(verifyPath, JSON.stringify({
      schemaVersion: 1,
      unityVersion: "2022.3.0f1",
      exportedAt: "2026-07-12T00:00:00.000Z",
      assets: [{
        path: source.path,
        guid: source.guid,
        dependencies: [{ path: target.path, guid: target.guid }],
      }],
    }));

    const result = await runVerification({ dbPath, verifyJsonPath: verifyPath, reportPath, verifiedAt: "2026-07-12T00:01:00.000Z" });

    expect(result.reportPath).toBe(reportPath);
    expect(JSON.parse(await readFile(reportPath, "utf8"))).toMatchObject({ matchedCount: 1, missedEdges: [], extraEdges: [] });
    const reopened = GraphStore.open(dbPath);
    expect(reopened.getMeta("verify_last_run")).toBe("2026-07-12T00:01:00.000Z");
    reopened.close();
  });

  test("rejects an exportedAt value without a timestamp", () => {
    expect(() => parseVerificationExport(JSON.stringify({
      schemaVersion: 1,
      unityVersion: "2022.3.0f1",
      exportedAt: "2026-07-12",
      assets: [],
    }))).toThrow(/ISO-8601 timestamp/);
  });

  test("rejects malformed exports and dependencies without GUIDs", () => {
    expect(() => parseVerificationExport("not json")).toThrow(/not valid JSON/);
    expect(() => parseVerificationExport(JSON.stringify({
      schemaVersion: 1,
      unityVersion: "2022.3.0f1",
      exportedAt: "2026-07-12T00:00:00.000Z",
      assets: [{ path: "Assets/Player.prefab", guid: guid("a"), dependencies: [{ path: "Assets/Body.mat" }] }],
    }))).toThrow(/dependencies\[0\]\.guid/);
  });
});
