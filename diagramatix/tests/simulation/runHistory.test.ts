/**
 * Run History pruning policy: named/pinned runs are kept forever; unpinned runs
 * trim to the most recent few. T0549-T0550.
 */
import { describe, it, expect } from "vitest";
import { runIdsToPrune } from "@/app/lib/simulation/runHistory";

const run = (id: string, min: number, pinned = false) => ({ id, pinned, startedAt: new Date(2026, 0, 1, 0, min) });

describe("runIdsToPrune", () => {
  it("T0549 — keeps the newest N unpinned, prunes older unpinned, never touches pinned", () => {
    const runs = [
      run("new1", 10), run("new2", 9), run("new3", 8), run("old1", 3), run("old2", 2),
      run("pinnedOld", 1, true),
    ];
    const prune = runIdsToPrune(runs, 3);
    expect(prune.sort()).toEqual(["old1", "old2"]); // newest 3 unpinned kept, pinnedOld untouched
    expect(prune).not.toContain("pinnedOld");
  });

  it("T0550 — nothing to prune when unpinned count is within the keep limit", () => {
    const runs = [run("a", 5), run("b", 4, true), run("c", 3)];
    expect(runIdsToPrune(runs, 5)).toEqual([]);
  });
});
