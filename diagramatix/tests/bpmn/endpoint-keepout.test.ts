/**
 * T5242 — Paul's capture 2026-10-05, “new diagram from phone image 1” (an AI-generated diagram):
 *   • R8.42 (a new RED rule): a message flow never attaches inside an edge-mounted intermediate event (EMIE) on the same
 *     boundary — it started under the “No response in 2 business days” timer on the task's top edge;
 *   • on the intermediate event “Customer details confirmed” the flows were ordered the wrong way round: on its top face
 *     the sequence flow sat RIGHT of the message and its horizontal run crossed the message's vertical drop; on its left
 *     face the loop-back climbed through the corner of the flow arriving on the same face. The other way round neither
 *     touches. The crossing counter could not see a line passing through a CORNER of another route.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { findLayoutViolations } from "@/app/lib/diagram/checks/layoutViolations";
import { spreadEndpoints } from "@/app/lib/diagram/endpointSpread";
import { healEndpoints } from "@/app/lib/diagram/spreadPass";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import { EMPTY_DIAGRAM, type Connector, type DiagramData, type DiagramElement, type Point, type Side } from "@/app/lib/diagram/types";

const fixture = JSON.parse(readFileSync("tests/fixtures/endpoint-heal/phone-image-1-copy.json", "utf8"));
const stored = fixture.diagrams[0].data as DiagramData & { aiGeneration: { plan: { elements: never[]; connections: never[] } } };
const regenerate = () => {
  const g = layoutBpmnDiagram(stored.aiGeneration.plan.elements, stored.aiGeneration.plan.connections);
  return { elements: g.elements, connectors: g.connectors } as DiagramData;
};
const insideEvent = (d: DiagramData) => findLayoutViolations(d).filter((v) => v.startsWith("message attaches inside an edge-mounted event"));
const get = (d: DiagramData, id: string) => d.connectors.find((c) => c.id === id)!;
const off = (c: Connector, role: "source" | "target") => (role === "source" ? c.sourceOffsetAlong : c.targetOffsetAlong) ?? 0.5;

/** Do two routes cross (anywhere but at their own ends)? Closed segments, so a line through a corner counts. */
function routesCross(a: Point[], b: Point[]): boolean {
  const ends = [a[0], a[a.length - 1], b[0], b[b.length - 1]];
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) {
    const p1 = a[i - 1], p2 = a[i], p3 = b[j - 1], p4 = b[j];
    const rx = p2.x - p1.x, ry = p2.y - p1.y, sx = p4.x - p3.x, sy = p4.y - p3.y, den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((p3.x - p1.x) * sy - (p3.y - p1.y) * sx) / den, u = ((p3.x - p1.x) * ry - (p3.y - p1.y) * rx) / den;
    if (t < 0 || t > 1 || u < 0 || u > 1) continue;
    const m = { x: p1.x + t * rx, y: p1.y + t * ry };
    if (!ends.some((e) => Math.abs(e.x - m.x) < 0.75 && Math.abs(e.y - m.y) < 0.75)) return true;
  }
  return false;
}
const visible = (c: Connector) => c.waypoints.slice(c.sourceInvisibleLeader ? 1 : 0, c.targetInvisibleLeader ? -1 : undefined);

describe("T5242 R8.42 — a message never attaches inside an edge-mounted event", () => {
  it("the check flags Paul's stored diagram: the message from “Request customer onboarding” starts under the timer", () => {
    expect(insideEvent(stored).join("; ")).toMatch(/conn-t4-pC-14 on t4, under bt1/);
  });
  it("regenerating that plan: the message attaches clear of the event, and nothing else in the diagram breaks the rule", () => {
    expect(insideEvent(regenerate())).toEqual([]);
  });
  it("opening the stored diagram repairs it (heal on load moves the message out from under the event)", () => {
    const r = healEndpoints(stored);
    expect(r.changedIds).toContain("conn-t4-pC-14");
    expect(insideEvent(r.data)).toEqual([]);
  });

  const host = (): DiagramElement[] => [
    { id: "t", type: "task", x: 300, y: 200, width: 102, height: 65, label: "T", properties: {} } as DiagramElement,
    { id: "ev", type: "intermediate-event", x: 333, y: 182, width: 36, height: 36, label: "Timer", boundaryHostId: "t", properties: {} } as DiagramElement,   // on the top edge, centred
    { id: "P", type: "pool", x: 0, y: 0, width: 1000, height: 100, label: "Customer", properties: { poolType: "black-box" } } as DiagramElement,
  ];
  const msg = (id: string, extra: Partial<Connector> = {}): Connector =>
    ({ id, type: "messageBPMN", sourceId: "t", targetId: "P", sourceSide: "top", targetSide: "bottom", directionType: "directed", routingType: "rectilinear", waypoints: [], ...extra }) as Connector;

  it("the allocator moves a LONE message at the middle of the face clear of the event — to the nearer side — and 3 px beyond it", () => {
    const r = spreadEndpoints(host(), [msg("m")]);
    expect(r.changedIds).toEqual(["m"]);
    const x = 300 + off(get({ ...EMPTY_DIAGRAM, elements: host(), connectors: r.connectors } as DiagramData, "m"), "source") * 102;
    const evLo = 333, evHi = 369;
    expect(x <= evLo - 3 + 0.01 || x >= evHi + 3 - 0.01).toBe(true);
  });
  it("a message already clear of the event is left alone", () => {
    expect(spreadEndpoints(host(), [msg("m", { sourceOffsetAlong: 0.1 })]).changedIds).toEqual([]);
  });
  it("a message the person did not touch (frozen) is not moved, even under the event", () => {
    expect(spreadEndpoints(host(), [msg("m")], { frozen: new Set(["m"]) }).changedIds).toEqual([]);
  });
  it("in the editor: drawing a message from that edge lands clear of the event", () => {
    const d = { ...EMPTY_DIAGRAM, elements: host(), connectors: [] } as DiagramData;
    const out = reducer(d, { type: "ADD_CONNECTOR", payload: { sourceId: "t", targetId: "P", connectorType: "messageBPMN", directionType: "directed", routingType: "rectilinear", sourceSide: "top", targetSide: "bottom" } } as Action);
    expect(insideEvent(out)).toEqual([]);
  });
});

describe("T5242 the order on the intermediate event is the one that does not cross", () => {
  const d = regenerate();
  it("top face: the sequence flow from “Chase customer for details” is left of the message, and they do not cross", () => {
    const seq = get(d, "conn-t5-ie1-10"), mes = get(d, "conn-pC-ie1-15");
    expect(off(seq, "target")).toBeLessThan(off(mes, "target"));
    expect(routesCross(visible(seq), visible(mes))).toBe(false);
  });
  it("left face: the loop-back leaves ABOVE the flow that arrives, and they do not cross", () => {
    const into = get(d, "conn-t4-ie1-8"), loop = get(d, "conn-ie1-t1-11");
    expect(off(loop, "source")).toBeLessThan(off(into, "target"));
    expect(routesCross(visible(into), visible(loop))).toBe(false);
  });
  it("and Paul's STORED diagram had them the wrong way round (so the test above is a real test)", () => {
    const seq = get(stored, "conn-t5-ie1-10"), mes = get(stored, "conn-pC-ie1-15");
    expect(off(seq, "target")).toBeGreaterThan(off(mes, "target"));
    expect(routesCross(visible(seq), visible(mes))).toBe(true);
  });
  it("a loop-back leaving the face another flow arrives on is placed without leaving anything unresolved", () => {
    // Two flows on one face: the arriving one has a corner at x=1404; the leaving one climbs along x=1404.
    const els = [
      { id: "src", type: "task", x: 1000, y: 380, width: 102, height: 65, label: "S", properties: {} },
      { id: "ev", type: "intermediate-event", x: 1422, y: 404, width: 36, height: 36, label: "E", properties: {} },
      { id: "far", type: "task", x: 100, y: 800, width: 102, height: 65, label: "F", properties: {} },
    ] as DiagramElement[];
    const cs = [
      { id: "in", type: "sequence", sourceId: "src", targetId: "ev", sourceSide: "right", targetSide: "left", directionType: "directed", routingType: "rectilinear", waypoints: [] },
      { id: "loop", type: "sequence", sourceId: "ev", targetId: "far", sourceSide: "left", targetSide: "left", directionType: "directed", routingType: "rectilinear", waypoints: [] },
    ] as Connector[];
    const r = spreadEndpoints(els, cs);
    expect(r.unresolved).toEqual([]);
  });
});

describe("T5242 R8.42 is written down", () => {
  const seed = readFileSync("scripts/seed-diagram-rules.cjs", "utf8");
  const sql = readFileSync("scripts/sql/patch-rule-r8-42-message-clear-of-emie.sql", "utf8");
  it("in the seeded BPMN rules, Group 8, after R8.41, and in an idempotent patch that says the same thing", () => {
    expect(seed.indexOf("R8.42:")).toBeGreaterThan(seed.indexOf("R8.41:"));
    const at = seed.indexOf("R8.42:");
    const text = JSON.parse(`"${seed.slice(at, seed.indexOf('"', at))}"`) as string;
    expect(sql).toContain(text.trim());
    expect(sql).toContain("AND rules NOT LIKE '%R8.42:%'");
    expect(sql).toContain("LIKE 'Group 8: Auto-Layout Placement%'");
    expect(sql).not.toContain("DELETE FROM");
  });
  it("the code names the rule", () => {
    expect(readFileSync("app/lib/diagram/endpointSpread.ts", "utf8")).toContain("R8.42");
    expect(readFileSync("app/lib/diagram/checks/layoutViolations.ts", "utf8")).toContain("R8.42");
  });
});
