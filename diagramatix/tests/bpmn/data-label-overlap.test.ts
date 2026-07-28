/**
 * R8.23 — data-artifact label de-overlap. Two data objects/stores that each
 * picked a slot relative to their own element can sit close enough that their
 * (wider-than-box) labels collide ("Credit Report" + "Assessment Summary" in the
 * repro). After layout, no two SAME-LANE data artifacts may have overlapping
 * label footprints (box widened by the label overhang).
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

// Two adjacent tasks in one lane, each producing an output data object, plus a
// third — the kind of cluster that made labels collide.
const els: AiElement[] = [
  { id: "p", type: "pool", label: "P", poolType: "white-box" },
  { id: "s", type: "start-event", label: "Start", pool: "p" },
  { id: "t1", type: "task", label: "Assess Credit", pool: "p" },
  { id: "t2", type: "task", label: "Summarise", pool: "p" },
  { id: "t3", type: "task", label: "Decide", pool: "p" },
  { id: "e", type: "end-event", label: "End", pool: "p" },
  { id: "d1", type: "data-object", label: "Credit Report", pool: "p" },
  { id: "d2", type: "data-object", label: "Assessment Summary", pool: "p" },
  { id: "d3", type: "data-object", label: "Decision Record", pool: "p" },
];
const conns: AiConnection[] = [
  { sourceId: "s", targetId: "t1" }, { sourceId: "t1", targetId: "t2" },
  { sourceId: "t2", targetId: "t3" }, { sourceId: "t3", targetId: "e" },
  { sourceId: "t1", targetId: "d1" }, { sourceId: "t2", targetId: "d2" }, { sourceId: "t3", targetId: "d3" },
];

describe("R8.23 — data-artifact label de-overlap", () => {
  it("T1056 — no two same-lane data artifacts have overlapping label footprints", () => {
    const out = layoutBpmnDiagram(els, conns);
    const PAD = 34, BELOW = 16;
    const arts = out.elements.filter((e) => e.type === "data-object" || e.type === "data-store");
    const foot = (e: any) => ({ l: e.x - PAD, r: e.x + e.width + PAD, t: e.y, b: e.y + e.height + BELOW });
    for (let i = 0; i < arts.length; i++) {
      for (let j = i + 1; j < arts.length; j++) {
        if (arts[i].parentId !== arts[j].parentId) continue;
        const A = foot(arts[i]), B = foot(arts[j]);
        const xOv = Math.min(A.r, B.r) - Math.max(A.l, B.l);
        const yOv = Math.min(A.b, B.b) - Math.max(A.t, B.t);
        expect(xOv > 0 && yOv > 0, `"${arts[i].label}" and "${arts[j].label}" label footprints overlap`).toBe(false);
      }
    }
  });
});
