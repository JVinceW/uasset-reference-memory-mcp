import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * A directory is a project scope if it already holds an index, or if it looks
 * like a Unity project root. `.asset-memory` is checked first so a project that
 * has been indexed is recognised even when run from an unusual layout.
 */
export function isProjectRoot(dir: string, exists: (p: string) => boolean = existsSync): boolean {
  if (exists(join(dir, ".asset-memory"))) return true;
  return exists(join(dir, "Assets")) && exists(join(dir, "ProjectSettings"));
}

/**
 * Walk up from `startDir` to the filesystem root and return the first project
 * scope found, or null. This is how the CLI's cwd default becomes usable from a
 * subdirectory, the same way git resolves `.git`.
 */
export function findProjectRoot(
  startDir: string,
  exists: (p: string) => boolean = existsSync,
): string | null {
  let dir = startDir;
  for (;;) {
    if (isProjectRoot(dir, exists)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null; // reached the filesystem root
    dir = parent;
  }
}
