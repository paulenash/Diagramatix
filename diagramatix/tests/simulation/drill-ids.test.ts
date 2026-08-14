/**
 * Namespaced-id → visible-box mapping shared by the replay + heatmap drill-down
 * views, and the correctness claim behind splicing them: without the splice a
 * linked subprocess contributes no load, so per-team utilisation is understated
 * and the reported bottleneck can name the wrong team.
 */
import { describe, it, expect } from "vitest";
import { drillPrefix, isWithinDrill, visibleNodeId } from "@/app/lib/simulation/drillIds";
import { spliceLinkedSubprocesses } from "@/app/lib/simulation/spliceLinks";
import { assembleFromDiagram } from "@/app/lib/simulation/assemble";
import { runMonteCarlo } from "@/app/lib/simulation/runner";
import { DEFAULT_RUN_CONFIG } from "@/app/lib/simulation/types";
import type { DiagramData } from "@/app/lib/diagram/types";

describe("drillPrefix", () => {
  it("is empty at the top level and separator-terminated below it", () => {
    expect(drillPrefix([])).toBe("");
    expect(drillPrefix(["sub1"])).toBe("sub1~");
    expect(drillPrefix(["sub1", "sub2"])).toBe("sub1~sub2~");
  });
});

describe("visibleNodeId", () => {
  it("passes a plain node through at the top level", () => {
    expect(visibleNodeId("task9")).toBe("task9");
  });

  it("rolls a spliced node up to its outermost subprocess at the top level", () => {
    expect(visibleNodeId("sub1~task9")).toBe("sub1");
    expect(visibleNodeId("sub1~sub2~task9")).toBe("sub1");
  });

  it("strips the drill prefix when inside a subprocess", () => {
    expect(visibleNodeId("sub1~task9", "sub1~")).toBe("task9");
  });

  it("rolls deeper splices up to the subprocess visible at this level", () => {
    expect(visibleNodeId("sub1~sub2~task9", "sub1~")).toBe("sub2");
    expect(visibleNodeId("sub1~sub2~task9", "sub1~sub2~")).toBe("task9");
  });

  it("returns null for a node in a different branch than the one being viewed", () => {
    expect(visibleNodeId("sub2~task9", "sub1~")).toBeNull();
    expect(visibleNodeId("task9", "sub1~")).toBeNull();
  });

  it("returns null rather than an empty box id for a malformed id", () => {
    expect(visibleNodeId("~task9")).toBeNull();
    expect(visibleNodeId("sub1~", "sub1~")).toBeNull();
  });

  it("a prefix that only partially matches a longer id is not a match", () => {
    // "sub10~t" must not be treated as living inside "sub1".
    expect(visibleNodeId("sub10~t", "sub1~")).toBeNull();
  });

  it("isWithinDrill agrees with visibleNodeId", () => {
    expect(isWithinDrill("sub1~task9", "sub1~")).toBe(true);
    expect(isWithinDrill("sub2~task9", "sub1~")).toBe(false);
  });
});

// ── The reason the heatmap must splice ──────────────────────────────────────

const task = (id: string, label: string, team: string, mins: number) => ({
  id, type: "task" as const, label, x: 0, y: 0, width: 100, height: 60,
  properties: { sim: { teamId: team, cycleTime: { kind: "fixed", value: mins } } },
});

/** Parent: start → linked subprocess → end. The child does all the real work,
 *  on the SAME team as nothing else in the parent — so if the child is skipped,
 *  that team looks idle. */
function parentAndChild(): { parent: DiagramData; child: DiagramData; byId: Map<string, DiagramData> } {
  const parent = {
    elements: [
      { id: "start", type: "start-event", label: "In", x: 0, y: 0, width: 40, height: 40,
        properties: { sim: { arrival: { kind: "fixed", value: 10 } } } },
      { id: "sub1", type: "subprocess", label: "Do the work", x: 100, y: 0, width: 120, height: 70,
        properties: { linkedDiagramId: "child" } },
      { id: "end", type: "end-event", label: "Out", x: 300, y: 0, width: 40, height: 40, properties: {} },
    ],
    connectors: [
      { id: "c1", sourceId: "start", targetId: "sub1", waypoints: [] },
      { id: "c2", sourceId: "sub1", targetId: "end", waypoints: [] },
    ],
  } as unknown as DiagramData;
  const child = {
    elements: [
      { id: "cstart", type: "start-event", label: "s", x: 0, y: 0, width: 40, height: 40, properties: {} },
      task("cwork", "Heavy step", "Specialists", 9),
      { id: "cend", type: "end-event", label: "e", x: 200, y: 0, width: 40, height: 40, properties: {} },
    ],
    connectors: [
      { id: "cc1", sourceId: "cstart", targetId: "cwork", waypoints: [] },
      { id: "cc2", sourceId: "cwork", targetId: "cend", waypoints: [] },
    ],
  } as unknown as DiagramData;
  return { parent, child, byId: new Map([["parent", parent], ["child", child]]) };
}

const run = (data: DiagramData) => runMonteCarlo(
  assembleFromDiagram(data, { teamCapacities: { Specialists: 1 } }),
  { ...DEFAULT_RUN_CONFIG, horizon: 2000, warmUp: 200, replications: 3, seed: 1, collectQueues: true },
).stats;

describe("heatmap must splice linked subprocesses", () => {
  it("without splicing, the child's team carries no load at all", () => {
    const { parent } = parentAndChild();
    const stats = run(parent);
    // The team that does all the work is invisible — this is the bug.
    expect(stats.perTeam.Specialists?.utilization.mean ?? 0).toBe(0);
  });

  it("with splicing, the child's team is loaded and becomes the bottleneck", () => {
    const { parent, byId } = parentAndChild();
    const stats = run(spliceLinkedSubprocesses(parent, "parent", byId));

    const util = stats.perTeam.Specialists?.utilization.mean ?? 0;
    expect(util).toBeGreaterThan(0.5);
    const bottleneck = Object.entries(stats.perTeam)
      .sort((a, b) => b[1].utilization.mean - a[1].utilization.mean)[0]?.[0];
    expect(bottleneck).toBe("Specialists");
  });

  it("the child's nodes arrive namespaced, and roll up onto the parent's box", () => {
    const { parent, byId } = parentAndChild();
    const stats = run(spliceLinkedSubprocesses(parent, "parent", byId));

    const inner = Object.keys(stats.perNode).find((id) => id === "sub1~cwork");
    expect(inner).toBeDefined();
    // At the top level that node has no box of its own — it reports at "sub1".
    expect(visibleNodeId(inner!, "")).toBe("sub1");
    // Drilled in, it is itself.
    expect(visibleNodeId(inner!, "sub1~")).toBe("cwork");
  });
});
