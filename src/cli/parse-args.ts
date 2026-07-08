import { isAbsolute, join, resolve } from "node:path";

export type CliCommand = "index" | "snapshot" | "restore" | "help";

export interface CliArgs {
  command: CliCommand;
  projectRoot: string;
  dbPath: string;
  force: boolean;
  /** For `index`: also export a shared snapshot after building. */
  snapshot: boolean;
  unityVersion?: string;
}

const COMMANDS = new Set(["index", "snapshot", "restore"]);

/**
 * Parse `<index|snapshot|restore> [root] [--force] [--snapshot] [--db <path>]
 * [--unity <version>]`.
 */
export function parseArgs(argv: string[], cwd = process.cwd()): CliArgs {
  const command = argv[0];
  if (!command || !COMMANDS.has(command)) {
    return { command: "help", projectRoot: cwd, dbPath: "", force: false, snapshot: false };
  }

  let force = false;
  let snapshot = false;
  let dbPath: string | undefined;
  let unityVersion: string | undefined;
  let root: string | undefined;

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--force") force = true;
    else if (arg === "--snapshot") snapshot = true;
    else if (arg === "--db") dbPath = argv[++i];
    else if (arg === "--unity") unityVersion = argv[++i];
    else if (!arg.startsWith("--")) root = arg;
  }

  const projectRoot = root ? (isAbsolute(root) ? root : resolve(cwd, root)) : cwd;
  return {
    command: command as CliCommand,
    projectRoot,
    dbPath: dbPath ?? join(projectRoot, ".asset-memory", "index.db"),
    force,
    snapshot,
    unityVersion,
  };
}
