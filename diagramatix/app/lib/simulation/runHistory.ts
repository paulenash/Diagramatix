/**
 * Run History pruning. Named/pinned runs are kept forever (they're the curated
 * history); unnamed/unpinned runs are transient and trimmed to the most recent
 * few per scenario so storage stays bounded. Pure so the route can stay thin and
 * the policy is unit-tested.
 */

export interface PrunableRun {
  id: string;
  pinned: boolean;
  startedAt: Date | string;
}

/** Ids of the unpinned runs to delete: everything older than the newest
 *  `keepUnpinned` unpinned runs. Pinned runs are never returned. */
export function runIdsToPrune(runs: PrunableRun[], keepUnpinned = 5): string[] {
  const unpinned = runs
    .filter((r) => !r.pinned)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  return unpinned.slice(keepUnpinned).map((r) => r.id);
}
