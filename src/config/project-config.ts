import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type AddressableRoots = "auto" | "on" | "off";

export interface ProjectConfig {
  unused: {
    /** Whether to treat Addressable entries as roots: auto (if present) | on | off. */
    addressableRoots: AddressableRoots;
  };
}

export const DEFAULT_CONFIG: ProjectConfig = {
  unused: { addressableRoots: "auto" },
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
  const unused = (raw as { unused?: { addressableRoots?: unknown } })?.unused;
  const roots = unused?.addressableRoots;
  const addressableRoots = VALID_ROOTS.includes(roots as AddressableRoots)
    ? (roots as AddressableRoots)
    : DEFAULT_CONFIG.unused.addressableRoots;
  return { unused: { addressableRoots } };
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
