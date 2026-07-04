/**
 * State-machine Layout red-rule guards (DiagramRules Group 3, code-enforced).
 * layoutGenericDiagram("state-machine") dispatches to the dedicated
 * layoutStateMachine, which must satisfy:
 *   S3.01 initial top-left, finals bottom-right
 *   S3.02 states flow left-to-right (progression)
 *   S3.04 transition connection points not shared (≥10px apart on a node side)
 *   S3.05 reciprocal transitions (A↔B) don't cross
 *   S3.06 transition labels separated vertically by ≥ ½ label height
 */
import { describe, it, expect } from "vitest";
import { layoutGenericDiagram } from "@/app/lib/diagram/genericLayout";
import type { DiagramData } from "@/app/lib/diagram/types";

const INIT = "__init", FINAL = "__final";
const T = (s: string, t: string, l: string) => ({ sourceId: s, targetId: t, label: l, type: "transition" });
const SM = {
  elements: [
    { id: INIT, type: "initial-state", label: "" }, { id: FINAL, type: "final-state", label: "" },
    { id: "received", type: "state", label: "Received" }, { id: "in-progress", type: "state", label: "In Progress" },
    { id: "on-hold", type: "state", label: "On Hold" }, { id: "approved", type: "state", label: "Approved" },
    { id: "ready", type: "state", label: "Ready to Pay" }, { id: "paid", type: "state", label: "Paid" },
    { id: "cancelled", type: "state", label: "Cancelled" },
  ],
  connections: [
    T(INIT, "received", "Receive"), T("received", "in-progress", "Begin"),
    T("in-progress", "on-hold", "Hold"), T("on-hold", "in-progress", "Resume"),   // reciprocal pair
    T("in-progress", "approved", "Approve"), T("approved", "ready", "Schedule"), T("ready", "paid", "Pay"),
    T("in-progress", "cancelled", "Cancel"), T("on-hold", "cancelled", "Cancel"),
    T("paid", FINAL, ""), T("cancelled", FINAL, ""),
  ],
};
const layout = (): DiagramData => layoutGenericDiagram(SM, "state-machine");
const el = (d: DiagramData, id: string) => d.elements.find((e) => e.id === id)!;

// proper segment intersection (endpoints touching does not count)
function segCross(a: {x:number;y:number}, b: {x:number;y:number}, c: {x:number;y:number}, e: {x:number;y:number}): boolean {
  const o = (p: {x:number;y:number}, q: {x:number;y:number}, r: {x:number;y:number}) => Math.sign((q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y));
  const d1 = o(a, b, c), d2 = o(a, b, e), d3 = o(c, e, a), d4 = o(c, e, b);
  return d1 !== d2 && d3 !== d4 && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0;
}

describe("state-machine layout red rules", () => {
  it("T0620 — S3.01/S3.02: initial top-left, finals bottom-right, left-to-right flow", () => {
    const d = layout();
    const minX = Math.min(...d.elements.map((e) => e.x)), minY = Math.min(...d.elements.map((e) => e.y));
    const maxX = Math.max(...d.elements.map((e) => e.x + e.width)), maxY = Math.max(...d.elements.map((e) => e.y + e.height));
    const init = el(d, INIT), fin = el(d, FINAL);
    expect(init.x).toBe(minX);                              // leftmost
    expect(init.y).toBe(minY);                              // topmost → top-left
    expect(fin.x + fin.width).toBeGreaterThanOrEqual(maxX - 1); // rightmost
    expect(fin.y + fin.height).toBeGreaterThanOrEqual(maxY - 1); // bottom → bottom-right
    // S3.02: progression — every non-initial state sits right of the initial.
    for (const e of d.elements) if (e.id !== INIT) expect(e.x).toBeGreaterThan(init.x);
  });

  it("T0621 — S3.04: transition connection points on a node side are ≥10px apart", () => {
    const d = layout();
    const groups = new Map<string, { x: number; y: number }[]>();
    for (const c of d.connectors) {
      const w = c.waypoints; if (!w || w.length < 2) continue;
      (groups.get(`${c.sourceId}|${c.sourceSide}`) ?? groups.set(`${c.sourceId}|${c.sourceSide}`, []).get(`${c.sourceId}|${c.sourceSide}`)!).push(w[0]);
      (groups.get(`${c.targetId}|${c.targetSide}`) ?? groups.set(`${c.targetId}|${c.targetSide}`, []).get(`${c.targetId}|${c.targetSide}`)!).push(w[w.length - 1]);
    }
    for (const pts of groups.values()) {
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it("T0622 — S3.05: reciprocal transitions (In Progress ↔ On Hold) do not cross", () => {
    const d = layout();
    const fwd = d.connectors.find((c) => c.sourceId === "in-progress" && c.targetId === "on-hold")!;
    const bwd = d.connectors.find((c) => c.sourceId === "on-hold" && c.targetId === "in-progress")!;
    const seg = (c: typeof fwd) => [c.waypoints[0], c.waypoints[c.waypoints.length - 1]] as const;
    const [a, b] = seg(fwd), [p, q] = seg(bwd);
    expect(segCross(a, b, p, q)).toBe(false);
  });

  it("T0623 — S3.06: horizontally-overlapping transition labels are ≥ ½ label height apart", () => {
    const d = layout();
    const L = d.connectors.filter((c) => c.label && c.waypoints.length >= 2).map((c) => {
      const w = c.waypoints, a = w[0], b = w[w.length - 1];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + (c.labelOffsetY ?? 0), w: Math.max(30, c.label!.length * 6) };
    });
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const horizOverlap = Math.abs(L[i].x - L[j].x) < (L[i].w + L[j].w) / 2;
      if (horizOverlap) expect(Math.abs(L[i].y - L[j].y)).toBeGreaterThanOrEqual(21 - 0.01); // label height (14) + ½
    }
  });
});
