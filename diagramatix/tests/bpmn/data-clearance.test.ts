/**
 * Issue 2 (2026-07-29): a Data Object / Store (and its whole label) must clear
 * ALL other elements on the diagram, not just its own EP — e.g. a data object
 * overlapping a Start event. After layout no data artifact's footprint (box +
 * label overhang) may overlap a non-associated flow element.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

// A start event with a task immediately after it whose INPUT data object is
// placed upper-left (toward the start) — the classic start-event overlap.
const els: AiElement[] = [
  { id: "p", type: "pool", label: "P", poolType: "white-box" },
  { id: "s", type: "start-event", label: "Start", pool: "p" },
  { id: "t1", type: "task", label: "Register Application", pool: "p" },
  { id: "t2", type: "task", label: "Review", pool: "p" },
  { id: "d1", type: "data-object", label: "Application Form", pool: "p" },
  { id: "d2", type: "data-store", label: "Records DB", pool: "p" },
  { id: "e", type: "end-event", label: "End", pool: "p" },
];
const conns: AiConnection[] = [
  { sourceId: "s", targetId: "t1" }, { sourceId: "t1", targetId: "t2" }, { sourceId: "t2", targetId: "e" },
  { sourceId: "d1", targetId: "t1" }, { sourceId: "t2", targetId: "d2" },
];

describe("Issue 2 — data artifacts clear all elements", () => {
  it("T1067 — no data artifact footprint overlaps a non-associated flow element", () => {
    const out = layoutBpmnDiagram(els, conns);
    const FLOW = new Set(["task", "subprocess", "subprocess-expanded", "start-event", "end-event", "intermediate-event", "gateway"]);
    const isArt = (t: string) => t === "data-object" || t === "data-store";
    const connList = out.connectors;
    const assoc = (id: string) => { const c = connList.find((x) => x.sourceId === id || x.targetId === id); return c ? (c.sourceId === id ? c.targetId : c.sourceId) : undefined; };
    const labelH = (e: any) => Math.max(1, (e.label ?? "").split("\n").length) * 14 + 6;
    const foot = (e: any) => isArt(e.type)
      ? { l: e.x - 34, r: e.x + e.width + 34, t: e.y, b: e.y + e.height + labelH(e) }
      : { l: e.x, r: e.x + e.width, t: e.y, b: e.y + e.height };
    const ov = (a: any, b: any) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
    for (const art of out.elements.filter((e) => isArt(e.type))) {
      const a = assoc(art.id);
      for (const o of out.elements) {
        if (o.id === art.id || o.id === a || o.boundaryHostId) continue;
        if (!FLOW.has(o.type)) continue;
        expect(ov(foot(art), foot(o)), `"${art.label}" overlaps "${o.label}"`).toBe(false);
      }
    }
  });
});
