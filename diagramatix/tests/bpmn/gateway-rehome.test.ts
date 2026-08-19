/**
 * R8.01 cross-lane fan: a decision gateway whose branches ALL live in other
 * lanes (none in the decision's own lane) — plus its paired merge — is RE-HOMED
 * to the MIDDLE branch's lane and aligned vertically with that middle element,
 * instead of being clamped to its (upstream) lane above the branches.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

type Out = ReturnType<typeof layoutBpmnDiagram>;
const byId = (o: Out, id: string) => o.elements.find((x) => x.id === id)!;
const cy = (o: Out, id: string) => { const e = byId(o, id); return e.y + e.height / 2; };

// s → g(decision) fans to sp1/sp2/sp3 in three OTHER lanes → m(merge) → e
const els: AiElement[] = [
  { id: "p", type: "pool", label: "P", poolType: "white-box", lanes: [{ id: "lA", name: "A" }, { id: "lB", name: "B" }, { id: "lC", name: "C" }, { id: "lD", name: "D" }] },
  { id: "s", type: "start-event", label: "S", pool: "p", lane: "lA" },
  { id: "g", type: "gateway", label: "Pick", pool: "p", lane: "lA" },
  { id: "sp1", type: "subprocess", label: "Branch B", pool: "p", lane: "lB" },
  { id: "sp2", type: "subprocess", label: "Branch C", pool: "p", lane: "lC" },
  { id: "sp3", type: "subprocess", label: "Branch D", pool: "p", lane: "lD" },
  { id: "m", type: "gateway", label: "Join", pool: "p", lane: "lA" },
  { id: "e", type: "end-event", label: "E", pool: "p", lane: "lA" },
];
const conns: AiConnection[] = [
  { sourceId: "s", targetId: "g" },
  { sourceId: "g", targetId: "sp1" }, { sourceId: "g", targetId: "sp2" }, { sourceId: "g", targetId: "sp3" },
  { sourceId: "sp1", targetId: "m" }, { sourceId: "sp2", targetId: "m" }, { sourceId: "sp3", targetId: "m" },
  { sourceId: "m", targetId: "e" },
];

describe("cross-lane gateway re-home (R8.01)", () => {
  it("T0971 — fully cross-lane decision + merge re-home to the middle branch's lane, level with it", () => {
    const o = layoutBpmnDiagram(els, conns);
    // sp2 (Branch C) is the middle of the three branch lanes.
    expect(byId(o, "sp2").parentId).toBe("lC");
    // Decision + merge are re-homed to that middle lane…
    expect(byId(o, "g").parentId).toBe("lC");
    expect(byId(o, "m").parentId).toBe("lC");
    // …and aligned vertically with the middle branch element.
    expect(Math.abs(cy(o, "g") - cy(o, "sp2"))).toBeLessThan(2);
    expect(Math.abs(cy(o, "m") - cy(o, "sp2"))).toBeLessThan(2);
  });
});

// Partial cross-lane fork/join (R8.24): the decision lives in one lane with
// ONE branch staying in it and the others fanning DOWN into lower lanes, while
// the paired merge lives in a DIFFERENT (upper) lane — exactly the shape that
// let later lane-centring pull the merge back to its own band, above the
// decision. R8.24 re-levels the merge onto the decision as the final step.
const els2: AiElement[] = [
  { id: "p", type: "pool", label: "Company", poolType: "white-box", lanes: [{ id: "lFO", name: "Front Office" }, { id: "lSales", name: "Sales" }, { id: "lFin", name: "Finance" }, { id: "lMkt", name: "Marketing" }] },
  { id: "s", type: "start-event", label: "Received", pool: "p", lane: "lFO" },
  { id: "pre", type: "task", label: "Determine Type", pool: "p", lane: "lSales" },
  { id: "g", type: "gateway", label: "Type?", pool: "p", lane: "lSales" },
  { id: "b1", type: "task", label: "Sales", pool: "p", lane: "lSales" },
  { id: "b2", type: "task", label: "Invoice", pool: "p", lane: "lFin" },
  { id: "b3", type: "task", label: "General", pool: "p", lane: "lMkt" },
  { id: "m", type: "gateway", label: "", pool: "p", lane: "lFO" },
  { id: "post", type: "task", label: "Send Response", pool: "p", lane: "lFO" },
  { id: "e", type: "end-event", label: "Sent", pool: "p", lane: "lFO" },
];
const conns2: AiConnection[] = [
  { sourceId: "s", targetId: "pre" }, { sourceId: "pre", targetId: "g" },
  { sourceId: "g", targetId: "b1" }, { sourceId: "g", targetId: "b2" }, { sourceId: "g", targetId: "b3" },
  { sourceId: "b1", targetId: "m" }, { sourceId: "b2", targetId: "m" }, { sourceId: "b3", targetId: "m" },
  { sourceId: "m", targetId: "post" }, { sourceId: "post", targetId: "e" },
];

describe("partial cross-lane merge levelling (R8.24)", () => {
  it("T2827 — a merge in another lane is drawn level (same centre-Y) with its paired decision", () => {
    const o = layoutBpmnDiagram(els2, conns2);
    // The merge must sit on the decision's centre-Y even though it belongs to a
    // different (upper) lane — no lane-band snap-back is allowed to diverge them.
    expect(Math.abs(cy(o, "m") - cy(o, "g"))).toBeLessThan(2);
  });
});
