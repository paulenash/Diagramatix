/**
 * R8.21 — global left-to-right flow enforcement.
 *
 * A wide element (e.g. an Expanded Subprocess) gets its same-lane successors
 * shifted right to clear it, but that displacement was NOT carried to CROSS-LANE
 * flow successors — so a decision pushed right past a wide EP ended up RIGHT of
 * the branch-target tasks it feeds in other lanes (reversing the flow). Every
 * non-loop sequence edge must run left-to-right (Paul, 2026-07-29). Repro shape:
 * a wide EP in the top lane pushes a decision right; the decision fans out to
 * three tasks in three OTHER lanes, which merge back in the top lane.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

const els: AiElement[] = [
  { id: "p", type: "pool", label: "P", poolType: "white-box", lanes: [
    { id: "A", name: "Assess" }, { id: "B", name: "Personal" }, { id: "C", name: "Home" }, { id: "D", name: "Commercial" },
  ] },
  { id: "s", type: "start-event", label: "Start", pool: "p", lane: "A" },
  // A wide Expanded Subprocess in lane A (several internal tasks → wide box).
  { id: "ep", type: "subprocess-expanded", label: "Do Checks", pool: "p", lane: "A" },
  { id: "es", type: "start-event", label: "", parentSubprocess: "ep" },
  { id: "c1", type: "task", label: "Check One", parentSubprocess: "ep" },
  { id: "c2", type: "task", label: "Check Two", parentSubprocess: "ep" },
  { id: "c3", type: "task", label: "Check Three", parentSubprocess: "ep" },
  { id: "c4", type: "task", label: "Check Four", parentSubprocess: "ep" },
  { id: "ee", type: "end-event", label: "", parentSubprocess: "ep" },
  // Decision in lane A fanning to three tasks in lanes B/C/D, then a merge in A.
  { id: "dec", type: "gateway", gatewayType: "exclusive", label: "Type?", pool: "p", lane: "A" },
  { id: "tB", type: "task", label: "Draft Personal", pool: "p", lane: "B" },
  { id: "tC", type: "task", label: "Draft Home", pool: "p", lane: "C" },
  { id: "tD", type: "task", label: "Draft Commercial", pool: "p", lane: "D" },
  { id: "mrg", type: "gateway", gatewayType: "exclusive", label: "", pool: "p", lane: "A" },
  { id: "e", type: "end-event", label: "End", pool: "p", lane: "A" },
];
const conns: AiConnection[] = [
  { sourceId: "s", targetId: "ep" }, { sourceId: "ep", targetId: "dec" },
  { sourceId: "es", targetId: "c1" }, { sourceId: "c1", targetId: "c2" }, { sourceId: "c2", targetId: "c3" }, { sourceId: "c3", targetId: "c4" }, { sourceId: "c4", targetId: "ee" },
  { sourceId: "dec", targetId: "tB" }, { sourceId: "dec", targetId: "tC" }, { sourceId: "dec", targetId: "tD" },
  { sourceId: "tB", targetId: "mrg" }, { sourceId: "tC", targetId: "mrg" }, { sourceId: "tD", targetId: "mrg" },
  { sourceId: "mrg", targetId: "e" },
];

const at = (out: ReturnType<typeof layoutBpmnDiagram>, id: string) => out.elements.find((e) => e.id === id)!;

describe("R8.21 — global left-to-right flow enforcement", () => {
  it("T1054 — cross-lane branch tasks land BETWEEN the decision and its merge (not left of the decision)", () => {
    const out = layoutBpmnDiagram(els, conns);
    const dec = at(out, "dec"), mrg = at(out, "mrg");
    for (const id of ["tB", "tC", "tD"]) {
      const t = at(out, id);
      expect(t.x, `${id} (x=${Math.round(t.x)}) must be right of the decision (right edge ${Math.round(dec.x + dec.width)})`).toBeGreaterThanOrEqual(dec.x + dec.width);
      expect(t.x + t.width, `${id} must be left of the merge (x=${Math.round(mrg.x)})`).toBeLessThanOrEqual(mrg.x + 1);
    }
    expect(mrg.x, "merge is right of the decision").toBeGreaterThan(dec.x);
  });

  it("T1055 — no non-loop sequence edge runs right-to-left", () => {
    const out = layoutBpmnDiagram(els, conns);
    const byId = new Map(out.elements.map((e) => [e.id, e]));
    const cx = (e: any) => e.x + e.width / 2;
    // The only edges allowed to go R→L would be loops (none in this acyclic fixture).
    for (const c of out.connectors) {
      if (c.type === "message") continue;
      const s = byId.get(c.sourceId), t = byId.get(c.targetId);
      if (!s || !t || /pool|lane/.test(s.type) || /pool|lane/.test(t.type)) continue;
      if (/data-object|data-store|text-annotation/.test(s.type) || /data-object|data-store|text-annotation/.test(t.type)) continue;
      expect(cx(t), `edge ${s.label || s.type}→${t.label || t.type} must be L→R`).toBeGreaterThanOrEqual(cx(s) - 1);
    }
  });
});
