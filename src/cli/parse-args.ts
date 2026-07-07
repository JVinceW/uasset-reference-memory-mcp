import { isAbsolute, join, resolve } from "node:path";

export interface CliArgs {
  command: "index" | "help";
  projectRoot: string;
  dbPath: string;
  force: boolean;
  unityVersion?: string;
}

/** Parse `index [root] [--force] [--db <path>] [--unity <version>]`. */
export function parseArgs(argv: string[], cwd = process.cwd()): CliArgs {
  if (argv[0] !== "index") {
    return { command: "help", projectRoot: cwd, dbPath: "", force: false };
  }

  let force = false;
  let dbPath: string | undefined;
  let unityVersion: string | undefined;
  let root: string | undefined;

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--force") force = true;
    else if (arg === "--db") dbPath = argv[++i];
    else if (arg === "--unity") unityVersion = argv[++i];
    else if (!arg.startsWith("--")) root = arg;
  }

  const projectRoot = root ? (isAbsolute(root) ? root : resolve(cwd, root)) : cwd;
  return {
    command: "index",
    projectRoot,
    dbPath: dbPath ?? join(projectRoot, ".asset-memory", "index.db"),
    force,
    unityVersion,
  };
}
