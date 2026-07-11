import { isAbsolute, join, resolve } from "node:path";

export type CliCommand = "index" | "snapshot" | "restore" | "export-json" | "verify-index" | "help";

export interface CliArgs {
  command: CliCommand;
  projectRoot: string;
  dbPath: string;
  force: boolean;
  /** For `index`: also export a shared snapshot after building. */
  snapshot: boolean;
  /** Output path override (e.g. for `export-json`). */
  out?: string;
  /** Unity Editor dependency export required by `verify-index`. */
  verifyJsonPath?: string;
  unityVersion?: string;
}

const COMMANDS = new Set(["index", "snapshot", "restore", "export-json", "verify-index"]);

/**
 * Parse a CLI command with its project root and path overrides.
 */
export function parseArgs(argv: string[], cwd = process.cwd()): CliArgs {
  const command = argv[0];
  if (!command || !COMMANDS.has(command)) {
    return { command: "help", projectRoot: cwd, dbPath: "", force: false, snapshot: false };
  }

  let force = false;
  let snapshot = false;
  let dbPath: string | undefined;
  let out: string | undefined;
  let verifyJsonPath: string | undefined;
  let unityVersion: string | undefined;
  let root: string | undefined;

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--force") force = true;
    else if (arg === "--snapshot") snapshot = true;
    else if (arg === "--db") dbPath = argv[++i];
    else if (arg === "--out") out = argv[++i];
    else if (arg === "--verify") verifyJsonPath = argv[++i];
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
    out,
    verifyJsonPath,
    unityVersion,
  };
}
