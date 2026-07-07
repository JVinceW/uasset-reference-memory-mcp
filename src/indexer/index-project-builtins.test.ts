import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { indexProject } from "./index-project.js";
import { GraphStore } from "../store/graph-store.js";

const BUILTIN = "0000000000000000f000000000000000";

let root: string;
let dbPath: string;

async function write(rel: string, body: string): Promise<void> {
  await mkdir(join(root, rel, ".."), { recursive: true });
  await writeFile(join(root, rel), body);
}
function assetMeta(guid: string, importer = "NativeFormatImporter"): string {
  return `fileFormatVersion: 2\nguid: ${guid}\n${importer}:\n  externalObjects: {}\n`;
}

async function materialRefsBuiltin(): Promise<void> {
  await write(
    "Assets/Materials.meta",
    `fileFormatVersion: 2\nguid: ${"c".repeat(32)}\nfolderAsset: yes\nDefaultImporter:\n  externalObjects: {}\n`,
  );
  await write(
    "Assets/Materials/body.mat",
    ["%YAML 1.1", "--- !u!21 &1", "Material:", `  m_Shader: {fileID: 46, guid: ${BUILTIN}, type: 0}`].join(
      "\n",
    ),
  );
  await write("Assets/Materials/body.mat.meta", assetMeta("b".repeat(32)));
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "idx-builtins-"));
  dbPath = join(root, "index.db");
  await mkdir(join(root, "Assets"), { recursive: true });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("indexProject builtins", () => {
  test("resolves references to builtin sentinel guids instead of leaving them unresolved", async () => {
    await materialRefsBuiltin();
    const summary = await indexProject(root, { dbPath });

    expect(summary.unresolvedCount).toBe(0);
    expect(summary.edgeCount).toBe(1);

    const store = GraphStore.open(dbPath);
    expect(store.getNode(BUILTIN)?.origin).toBe("builtin");
    store.close();
  });

  test("keeps builtin nodes across an incremental re-index (never removed)", async () => {
    await materialRefsBuiltin();
    await indexProject(root, { dbPath });
    const summary = await indexProject(root, { dbPath });

    expect(summary.removed).toBe(0);
    const store = GraphStore.open(dbPath);
    expect(store.getNode(BUILTIN)).not.toBeNull();
    store.close();
  });

  test("records packages_lock_mtime when the lockfile is present", async () => {
    await materialRefsBuiltin();
    await write("Packages/packages-lock.json", '{"dependencies":{}}');
    await indexProject(root, { dbPath });

    const store = GraphStore.open(dbPath);
    expect(store.getMeta("packages_lock_mtime")).not.toBeNull();
    store.close();
  });
});
