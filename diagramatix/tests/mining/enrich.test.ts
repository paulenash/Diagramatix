/**
 * Enrich a sparse log from the project's models: teams from the Process Diagram's
 * lanes, states from the reference State Machine's transitions (activity → target).
 */
import { describe, it, expect } from "vitest";
import { enrichResources, enrichStates, activityLaneMap, activityStateMap } from "@/app/lib/mining/enrich";
import { buildEventLog } from "@/app/lib/mining/parseEventLog";
import type { DiagramData } from "@/app/lib/diagram/types";
import type { LogMapping } from "@/app/lib/mining/types";

const el = (id: string, type: string, label: string, parentId?: string): DiagramData["elements"][number] =>
  ({ id, type, label, x: 0, y: 0, width: 80, height: 40, properties: {}, ...(parentId ? { parentId } : {}) } as DiagramData["elements"][number]);
const cn = (id: string, s: string, t: string, label: string): DiagramData["connectors"][number] =>
  ({ id, sourceId: s, targetId: t, label, type: "transition", sourceSide: "right", targetSide: "left", directionType: "directed", routingType: "orthogonal", sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [] } as unknown as DiagramData["connectors"][number]);

const BPMN: DiagramData = {
  elements: [
    el("p", "pool", "Process"), el("hd", "lane", "Help Desk Team", "p"), el("l1", "lane", "Level 1 Support", "p"),
    el("t1", "task", "Log Request", "hd"), el("t2", "task", "Deal with Support Level 1 Request", "l1"),
  ],
  connectors: [],
} as DiagramData;

const SM: DiagramData = {
  elements: [el("lo", "state", "Logged"), el("as", "state", "Assessed")],
  connectors: [cn("c1", "x", "lo", "Log Request"), cn("c2", "lo", "as", "Assess Request")],
} as DiagramData;

describe("log enrichment from project models", () => {
  it("T2243 — activityLaneMap / activityStateMap read the model", () => {
    expect(activityLaneMap(BPMN)).toEqual({ "Log Request": "Help Desk Team", "Deal with Support Level 1 Request": "Level 1 Support" });
    expect(activityStateMap(SM)).toEqual({ "Log Request": "Logged", "Assess Request": "Assessed" });
  });

  it("T2244 — resources fill from lanes; exact + fuzzy match", () => {
    const e = enrichResources(["Log Request", "Deal Level 1 Request", "Mystery step"], BPMN);
    expect(e.map["Log Request"]).toBe("Help Desk Team");
    expect(e.map["Deal Level 1 Request"]).toBe("Level 1 Support");   // fuzzy
    expect(e.rows.find((r) => r.activity === "Log Request")!.exact).toBe(true);
    expect(e.rows.find((r) => r.activity === "Deal Level 1 Request")!.exact).toBe(false);
    expect(e.unmatched).toEqual(["Mystery step"]);
  });

  it("T2245 — states fill from the State Machine transitions", () => {
    const e = enrichStates(["Log Request", "Assess Request"], SM);
    expect(e.map).toEqual({ "Log Request": "Logged", "Assess Request": "Assessed" });
  });

  it("T2246 — buildEventLog uses activityResource when no resource column", () => {
    const log = buildEventLog(
      ["case", "activity", "timestamp"],
      [["1", "Log Request", "1700000000000"], ["1", "Assess Request", "1700000600000"]],
      { caseId: "case", activity: "activity", timestamp: "timestamp", activityResource: { "Log Request": "Help Desk Team" } } as LogMapping,
    );
    const logReq = log.events.find((e) => e.activity === "Log Request")!;
    expect(logReq.resource).toBe("Help Desk Team");
    // Unmapped activity → no resource.
    expect(log.events.find((e) => e.activity === "Assess Request")!.resource).toBeUndefined();
  });
});
