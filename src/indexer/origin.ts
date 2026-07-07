import type { Origin } from "./types.js";

/**
 * Minimal origin classification by path prefix (US-001).
 *
 * US-004 refines this with `package_id` parsing and pre-seeded `builtin` nodes;
 * here we only distinguish user assets from package assets. `builtin` nodes are
 * synthetic (not produced from a path) and so are never returned here.
 */
export function classifyOrigin(projectRelPath: string): Origin {
  if (
    projectRelPath === "Packages" ||
    projectRelPath.startsWith("Packages/") ||
    projectRelPath === "Library/PackageCache" ||
    projectRelPath.startsWith("Library/PackageCache/")
  ) {
    return "package";
  }
  return "project";
}
