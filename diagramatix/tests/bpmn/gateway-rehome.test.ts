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
