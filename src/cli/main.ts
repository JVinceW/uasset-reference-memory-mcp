#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { parseArgs } from "./parse-args.js";
import { indexProject } from "../indexer/index-project.js";
import { exportSnapshot, importSnapshot } from "../snapshot/snapshot.js";
import { writeGraphJson } from "../snapshot/json-export.js";
import { GraphStore } from "../store/graph-store.js";
import { isMainModule } from "../util/is-main.js";
import { runVerification } from "../verification/run.js";
import { summarizeVerification } from "../verification/summary.js";

const VERSION: string | null = (() => {
  try {
    return (createRequire(import.meta.url)("../../package.json") as { version: string }).version;
  } catch {
    return null;
  }
})();

const HELP = `unity-asset-reference-mcp-index — Unity asset reference graph CLI

Usage:
  unity-asset-reference-mcp-index index    [projectRoot] [--force] [--snapshot] [--db <path>] [--unity <ver>]
  unity-asset-reference-mcp-index snapshot    [projectRoot] [--db <path>]              # export a shareable snapshot
  unity-asset-reference-mcp-index restore     [projectRoot] [--db <path>]              # rebuild the live index from a snapshot
  unity-asset-reference-mcp-index export-json [projectRoot] [--db <path>] [--out <p>]  # write a git-diffable graph.json
  unity-asset-reference-mcp-index verify-index [projectRoot] --verify <verify.json> [--db <path>] [--out <p>]

Snapshots (index.db.br + artifact.json) are compressed and meant to be committed;
the live index.db is meant to be gitignored. See the README for the .gitignore split.`;

function projectGitCommit(projectRoot: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);

  if (args.command === "help") {
    console.log(HELP);
    return 0;
  }

  if (args.command === "restore") {
    if (!existsSync(`${dirname(args.dbPath)}/index.db.br`)) {
      console.error(`no snapshot (index.db.br) next to ${args.dbPath}`);
      return 1;
    }
    await importSnapshot(args.dbPath);
    console.log(`Restored live index from snapshot -> ${args.dbPath}`);
    return 0;
  }

  if (args.command === "export-json") {
    if (!existsSync(args.dbPath)) {
      console.error(`no index at ${args.dbPath} — run 'index' first`);
      return 1;
    }
    const out = args.out ?? `${dirname(args.dbPath)}/graph.json`;
    const store = GraphStore.open(args.dbPath);
    try {
      const g = await writeGraphJson(store, out);
      console.log(`Wrote ${out}`);
      console.log(`  ${g.assets.length} assets, ${g.edges.length} edges, ${g.unresolved.length} unresolved, ${g.addressables.length} addressable`);
    } finally {
      store.close();
    }
    return 0;
  }

  if (args.command === "verify-index") {
    if (!args.verifyJsonPath) {
      console.error("verify-index requires --verify <verify.json>");
      return 1;
    }
    try {
      const { report, reportPath } = await runVerification({
        dbPath: args.dbPath,
        verifyJsonPath: args.verifyJsonPath,
        reportPath: args.out,
      });
      const summary = summarizeVerification(report, reportPath);
      console.log(`Verification ${summary.status}`);
      console.log(`  Unity dependencies: ${summary.unityDependencyCount}`);
      console.log(`  indexed dependencies: ${summary.indexedDependencyCount}`);
      console.log(`  matched: ${summary.matchedCount}`);
      console.log(`  missed: ${summary.missedEdgeCount}`);
      console.log(`  extra: ${summary.extraEdgeCount}`);
      console.log(`  unresolved: ${summary.unresolvedAssetCount + summary.unresolvedDependencyCount}`);
      console.log(`  report: ${summary.reportPath}`);
      return 0;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  }

  if (args.command === "snapshot") {
    if (!existsSync(args.dbPath)) {
      console.error(`no index at ${args.dbPath} — run 'index' first`);
      return 1;
    }
    const a = await exportSnapshot(args.dbPath, {
      toolVersion: VERSION ?? undefined,
      gitCommit: projectGitCommit(args.projectRoot) ?? undefined,
    });
    const pct = ((1 - a.compressed_size / a.original_size) * 100).toFixed(0);
    console.log(`Snapshot written next to ${args.dbPath}`);
    console.log(`  ${(a.compressed_size / 1024).toFixed(0)} KB compressed (${pct}% smaller), ${a.asset_count} assets`);
    return 0;
  }

  // index
  await mkdir(dirname(args.dbPath), { recursive: true });
  const started = Date.now();
  const s = await indexProject(args.projectRoot, {
    dbPath: args.dbPath,
    force: args.force,
    unityVersion: args.unityVersion,
  });
  const ms = Date.now() - started;

  console.log(`Indexed ${args.projectRoot}`);
  console.log(`  assets:     ${s.assetCount}`);
  console.log(`  edges:      ${s.edgeCount}`);
  console.log(`  unresolved: ${s.unresolvedCount}`);
  console.log(`  changes:    +${s.added} ~${s.updated} -${s.removed} =${s.unchanged}`);
  console.log(`  warnings:   ${s.warnings.length}`);
  for (const w of s.warnings.slice(0, 10)) console.log(`    [${w.kind}] ${w.path}`);
  if (s.warnings.length > 10) console.log(`    ... and ${s.warnings.length - 10} more`);
  console.log(`  db:         ${args.dbPath}  (${ms} ms)`);

  if (args.snapshot) {
    const a = await exportSnapshot(args.dbPath, {
      toolVersion: VERSION ?? undefined,
      gitCommit: projectGitCommit(args.projectRoot) ?? undefined,
    });
    console.log(`  snapshot:   ${(a.compressed_size / 1024).toFixed(0)} KB (index.db.br)`);
  }
  return 0;
}

if (isMainModule(import.meta.url)) {
  main()
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
