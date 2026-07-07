#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "./parse-args.js";
import { indexProject } from "../indexer/index-project.js";

const HELP = `asset-reference-mcp — index a Unity project's asset reference graph

Usage:
  asset-reference-mcp index [projectRoot] [options]

Options:
  --force            Rebuild the index from scratch (default is incremental)
  --db <path>        Output SQLite file (default: <projectRoot>/.asset-memory/index.db)
  --unity <version>  Record the Unity version in index_meta

Examples:
  asset-reference-mcp index .
  asset-reference-mcp index /path/to/UnityProject --force
`;

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);
  if (args.command === "help") {
    console.log(HELP);
    return 0;
  }

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
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main()
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
