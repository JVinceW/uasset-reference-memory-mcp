import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type AddressableRoots = "auto" | "on" | "off";

export interface ProjectConfig {
  unused: {
    /** Whether to treat Addressable entries as roots: auto (if present) | on | off. */
    addressableRoots: AddressableRoots;
  };
  scan: {
    /** User glob patterns to ignore (added to built-in rules unless disabled). */
    ignore: string[];
    /** Apply the built-in Unity ignore rules (dotfiles, ~-dirs, ...). */
    ignoreDefaults: boolean;
  };
}

export const DEFAULT_CONFIG: ProjectConfig = {
  unused: { addressableRoots: "auto" },
  scan: { ignore: [], ignoreDefaults: true },
};

const VALID_ROOTS: AddressableRoots[] = ["auto", "on", "off"];

/** Parse config JSON, merging over defaults and dropping invalid/unknown values. */
export function parseConfig(json: string): ProjectConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return DEFAULT_CONFIG;
  }
  const obj = raw as {
    unused?: { addressableRoots?: unknown };
    scan?: { ignore?: unknown; ignoreDefaults?: unknown };
  };

  const roots = obj?.unused?.addressableRoots;
  const addressableRoots = VALID_ROOTS.includes(roots as AddressableRoots)
    ? (roots as AddressableRoots)
    : DEFAULT_CONFIG.unused.addressableRoots;

  const ignore = Array.isArray(obj?.scan?.ignore)
    ? obj.scan.ignore.filter((p): p is string => typeof p === "string")
    : DEFAULT_CONFIG.scan.ignore;
  const ignoreDefaults =
    typeof obj?.scan?.ignoreDefaults === "boolean"
      ? obj.scan.ignoreDefaults
      : DEFAULT_CONFIG.scan.ignoreDefaults;

  return { unused: { addressableRoots }, scan: { ignore, ignoreDefaults } };
}

/** Load the project config next to the index db, or defaults if absent/invalid. */
export function loadConfig(configPath: string): ProjectConfig {
  try {
    return parseConfig(readFileSync(configPath, "utf8"));
  } catch {
    return DEFAULT_CONFIG;
  }
}

/** The config path co-located with the index db (`<dir>/config.json`). */
export function configPathFor(dbPath: string): string {
  return join(dirname(dbPath), "config.json");
}
