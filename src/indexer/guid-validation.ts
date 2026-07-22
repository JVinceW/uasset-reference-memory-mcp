import type { AssetNode } from "./types.js";

export interface GuidCollision {
  guid: string;
  paths: string[];
}

export class DuplicateGuidError extends Error {
  constructor(public readonly collisions: GuidCollision[]) {
    super(formatDuplicateGuidMessage(collisions));
    this.name = "DuplicateGuidError";
  }
}

/** Reject ambiguous GUID identity before an index run can modify its database. */
export function assertUniqueAssetGuids(
  nodes: readonly AssetNode[],
  reserved: readonly AssetNode[] = [],
): void {
  const pathsByGuid = new Map<string, string[]>();
  for (const node of [...reserved, ...nodes]) {
    const paths = pathsByGuid.get(node.guid) ?? [];
    paths.push(node.path);
    pathsByGuid.set(node.guid, paths);
  }

  const collisions = [...pathsByGuid]
    .filter(([, paths]) => paths.length > 1)
    .map(([guid, paths]) => ({ guid, paths: [...paths].sort() }))
    .sort((a, b) => a.guid.localeCompare(b.guid));
  if (collisions.length > 0) throw new DuplicateGuidError(collisions);
}

function formatDuplicateGuidMessage(collisions: readonly GuidCollision[]): string {
  return `duplicate Unity asset GUIDs detected: ${collisions
    .map(({ guid, paths }) => `${guid} (${paths.join(", ")})`)
    .join("; ")}. Resolve the duplicate .meta GUIDs before indexing.`;
}
