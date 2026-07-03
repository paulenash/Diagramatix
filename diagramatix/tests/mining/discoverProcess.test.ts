/**
 * Process discovery: variants → directly-follows graph → a well-formed BPMN plan
 * with exclusive gateways at branch/merge points, ready for layoutBpmnDiagram and
 * the simulator. Guards the DFG counts, gateway placement, loop handling,
 * referential integrity, and frequency filtering.
 */
import { describe, it, expect } from "vitest";
import { buildDfg, discoverProcess, edgeKey } from "@/app/lib/mining/discoverProcess";
import type { Variant } from "@/app/lib/mining/types";

// A branching log: Create→Submit→{Approve ×5 | Reject ×2}.
const BRANCHING: Variant[] = [
  { events: ["Create", "Submit", "Approve"], states: ["Draft", "Pending", "Approved"], count: 5 },
  { events: ["Create", "Submit", "Reject"], states: ["Draft", "Pending", "Rejected"], count: 2 },
];

const refIntegrityOk = (plan: { elements: { id: string }[]; connections: { sourceId: string; targetId: string }[] }) => {
  const ids = new Set(plan.elements.map((e) => e.id));
  return plan.connections.every((c) => ids.has(c.sourceId) && ids.has(c.targetId));
};

describe("process discovery", () => {
  it("T0589 — buildDfg aggregates directly-follows counts, starts and ends", () => {
    const d = buildDfg(BRANCHING);
    expect(d.nodes.get("Create")).toBe(7);
    expect(d.nodes.get("Submit")).toBe(7);
    expect(d.nodes.get("Approve")).toBe(5);
    expect(d.edges.get(edgeKey("Create", "Submit"))).toBe(7);
    expect(d.edges.get(edgeKey("Submit", "Approve"))).toBe(5);
    expect(d.edges.get(edgeKey("Submit", "Reject"))).toBe(2);
    expect(d.starts.get("Create")).toBe(7);
    expect(d.ends.get("Approve")).toBe(5);
    expect(d.ends.get("Reject")).toBe(2);
  });

  it("T0590 — a branch becomes an exclusive split gateway; merges before End; refs resolve", () => {
    const { plan } = discoverProcess(BRANCHING);
    const byType = (t: string) => plan.elements.filter((e) => e.type === t);
    expect(byType("task").map((e) => e.label).sort()).toEqual(["Approve", "Create", "Reject", "Submit"]);
    expect(byType("start-event")).toHaveLength(1);
    expect(byType("end-event")).toHaveLength(1);
    // Submit splits (→Approve/Reject); Approve+Reject merge into End → 2 gateways.
    expect(byType("gateway")).toHaveLength(2);
    expect(byType("gateway").every((g) => g.gatewayType === "exclusive")).toBe(true);
    expect(refIntegrityOk(plan)).toBe(true);
    // edge labels carry the frequency (for the discovered-diagram overlay).
    expect(plan.connections.some((c) => c.label === "5")).toBe(true);
  });

  it("T0591 — a loop stays well-formed (back-edge + gateways), refs resolve", () => {
    const loop: Variant[] = [{ events: ["A", "B", "A", "C"], states: ["s0", "s1", "s2", "s3"], count: 3 }];
    const { plan } = discoverProcess(loop);
    expect(plan.elements.filter((e) => e.type === "task").map((e) => e.label).sort()).toEqual(["A", "B", "C"]);
    expect(plan.elements.some((e) => e.type === "gateway")).toBe(true); // A branches (→B, →C)
    expect(refIntegrityOk(plan)).toBe(true);
  });

  it("T0592 — edgeThreshold trims rare directly-follows edges", () => {
    const full = discoverProcess(BRANCHING, { edgeThreshold: 0 }).plan.connections.length;
    const trimmed = discoverProcess(BRANCHING, { edgeThreshold: 0.5 }).plan.connections.length; // drops Submit→Reject (2 < 3.5)
    expect(trimmed).toBeLessThan(full);
  });
});
