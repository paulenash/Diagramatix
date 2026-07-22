/**
 * EXPERIMENTAL "Test" BPMN connector scheme (SuperAdmin-only) — bpmnTestConnectors.
 * Driven through the real layout engine with { mode: "test" }.
 *
 *   C1.1 Forward  → facing-side midpoints (offset 0.5).
 *   C1.2 Backward → TOP side of BOTH ends (offset 0.5).
 *   C2   Decision gateway diamond vertex (offset 0.5): up→top, down→bottom,
 *        level→facing side vertex; the single stem end → facing side vertex.
 *   Element positions + non-sequence connectors are UNCHANGED vs Normal.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

type Out = ReturnType<typeof layoutBpmnDiagram>;
const byId = (o: Out, id: string) => o.elements.find((x) => x.id === id)!;
const conn = (o: Out, s: string, t: string) => o.connectors.find((c) => c.sourceId === s && c.targetId === t)!;

// ── Gateway fixture: s → g(decision) → a/b/c → m(merge) → e ──
const gwEls: AiElement[] = [
  { id: "p", type: "pool", label: "P", poolType: "white-box", lanes: [{ id: "l", name: "L" }] },
  { id: "s", type: "start-event", label: "S", pool: "p", lane: "l" },
  { id: "g", type: "gateway", label: "Decision?", pool: "p", lane: "l" },
  { id: "a", type: "task", label: "A", pool: "p", lane: "l" },
  { id: "b", type: "task", label: "B", pool: "p", lane: "l" },
  { id: "c", type: "task", label: "C", pool: "p", lane: "l" },
  { id: "m", type: "gateway", label: "Merge", pool: "p", lane: "l" },
  { id: "e", type: "end-event", label: "E", pool: "p", lane: "l" },
];
const gwConns: AiConnection[] = [
  { sourceId: "s", targetId: "g" },
  { sourceId: "g", targetId: "a" }, { sourceId: "g", targetId: "b" }, { sourceId: "g", targetId: "c" },
  { sourceId: "a", targetId: "m" }, { sourceId: "b", targetId: "m" }, { sourceId: "c", targetId: "m" },
  { sourceId: "m", targetId: "e" },
];

// ── Linear fixture with a rework back-edge: s → t1 → t2 → t3 → e, t3 → t1 ──
const linEls: AiElement[] = [
  { id: "p", type: "pool", label: "P", poolType: "white-box", lanes: [{ id: "l", name: "L" }] },
  { id: "s", type: "start-event", label: "S", pool: "p", lane: "l" },
  { id: "t1", type: "task", label: "One", pool: "p", lane: "l" },
  { id: "t2", type: "task", label: "Two", pool: "p", lane: "l" },
  { id: "t3", type: "task", label: "Three", pool: "p", lane: "l" },
  { id: "e", type: "end-event", label: "E", pool: "p", lane: "l" },
];
const linConns: AiConnection[] = [
  { sourceId: "s", targetId: "t1" }, { sourceId: "t1", targetId: "t2" },
  { sourceId: "t2", targetId: "t3" }, { sourceId: "t3", targetId: "e" },
  { sourceId: "t3", targetId: "t1" }, // rework / back-edge
];

// ── Boundary-event fixture: a timer on task h's edge → escalation task ──
const beEls: AiElement[] = [
  { id: "p", type: "pool", label: "P", poolType: "white-box", lanes: [{ id: "l", name: "L" }] },
  { id: "s", type: "start-event", label: "S", pool: "p", lane: "l" },
  { id: "h", type: "task", label: "Host", pool: "p", lane: "l" },
  { id: "be", type: "intermediate-event", label: "Timer", pool: "p", lane: "l", boundaryHost: "h", boundarySide: "bottom" },
  { id: "esc", type: "task", label: "Escalate", pool: "p", lane: "l" },
  { id: "e", type: "end-event", label: "E", pool: "p", lane: "l" },
];
const beConns: AiConnection[] = [
  { sourceId: "s", targetId: "h" }, { sourceId: "h", targetId: "e" },
  { sourceId: "be", targetId: "esc" }, { sourceId: "esc", targetId: "e" },
];

const cxy = (o: Out, id: string) => { const e = byId(o, id); return { cx: e.x + e.width / 2, cy: e.y + e.height / 2 }; };

describe("Test-mode BPMN connectors (C1/C2)", () => {
  it("T0963 — C1.1 forward: facing-side midpoints, offset 0.5", () => {
    const o = layoutBpmnDiagram(linEls, linConns, { mode: "test" });
    const c = conn(o, "t1", "t2"); // t2 is to the right of t1
    expect(c.sourceSide).toBe("right");
    expect(c.targetSide).toBe("left");
    expect(c.sourceOffsetAlong).toBe(0.5);
    expect(c.targetOffsetAlong).toBe(0.5);
    // The visible endpoint (waypoint[1]) sits on the source's right face.
    const t1 = byId(o, "t1");
    expect(Math.abs(c.waypoints[1].x - (t1.x + t1.width))).toBeLessThan(1);
  });

  it("T0964 — C1.2 backward: TOP side on BOTH ends, offset 0.5", () => {
    const o = layoutBpmnDiagram(linEls, linConns, { mode: "test" });
    const c = conn(o, "t3", "t1"); // target left of source → back-edge
    expect(c.sourceSide).toBe("top");
    expect(c.targetSide).toBe("top");
    expect(c.sourceOffsetAlong).toBe(0.5);
    expect(c.targetOffsetAlong).toBe(0.5);
  });

  it("T0965 — C2.1/2.2/2.3 decision gateway vertex per branch position, offset 0.5", () => {
    const o = layoutBpmnDiagram(gwEls, gwConns, { mode: "test" });
    const g = byId(o, "g");
    const gc = cxy(o, "g");
    for (const tid of ["a", "b", "c"]) {
      const c = conn(o, "g", tid);
      const t = byId(o, tid);
      const overlapY = !(t.y >= g.y + g.height || t.y + t.height <= g.y);
      const tc = cxy(o, tid);
      const expected = overlapY ? (tc.cx >= gc.cx ? "right" : "left") : (tc.cy < gc.cy ? "top" : "bottom");
      expect(c.sourceSide, `branch g→${tid}`).toBe(expected);
      expect(c.sourceOffsetAlong).toBe(0.5);
    }
    // The stacked branches must actually exercise a top AND a bottom vertex.
    const sides = ["a", "b", "c"].map((t) => conn(o, "g", t).sourceSide);
    expect(sides).toContain("top");
    expect(sides).toContain("bottom");
  });

  it("T0966 — decision incoming = left vertex; merge stem outgoing = right vertex", () => {
    const o = layoutBpmnDiagram(gwEls, gwConns, { mode: "test" });
    const sg = conn(o, "s", "g"); // s is left of the decision gateway
    expect(sg.targetSide).toBe("left");
    expect(sg.targetOffsetAlong).toBe(0.5);
    const me = conn(o, "m", "e"); // merge → end (single stem, e to the right)
    expect(me.sourceSide).toBe("right");
    expect(me.sourceOffsetAlong).toBe(0.5);
  });

  it("T0967 — every test-mode sequence connector is orthogonal", () => {
    for (const o of [layoutBpmnDiagram(gwEls, gwConns, { mode: "test" }), layoutBpmnDiagram(linEls, linConns, { mode: "test" })]) {
      for (const c of o.connectors) {
        if (c.type !== "sequence") continue;
        expect(c.waypoints.length).toBeGreaterThanOrEqual(2);
        for (let i = 1; i < c.waypoints.length; i++) {
          const a = c.waypoints[i - 1], b = c.waypoints[i];
          const orth = Math.abs(a.x - b.x) < 1 || Math.abs(a.y - b.y) < 1;
          expect(orth, `segment ${i} of ${c.sourceId}→${c.targetId}`).toBe(true);
        }
      }
    }
  });

  it("T0968 — Normal path unchanged; Test keeps positions + non-sequence connectors", () => {
    const normal = layoutBpmnDiagram(gwEls, gwConns);
    const normalExplicit = layoutBpmnDiagram(gwEls, gwConns, { mode: "normal" });
    expect(normalExplicit).toEqual(normal); // omitted === "normal"
    const test = layoutBpmnDiagram(gwEls, gwConns, { mode: "test" });
    expect(test.elements).toEqual(normal.elements); // element positions untouched
    const nonSeq = (d: Out) => d.connectors.filter((c) => c.type !== "sequence");
    expect(nonSeq(test)).toEqual(nonSeq(normal)); // only sequence geometry changes
  });

  it("T0969 — C3 edge-mounted (boundary) event attaches at its OUTER face", () => {
    const o = layoutBpmnDiagram(beEls, beConns, { mode: "test" });
    const be = byId(o, "be"), h = byId(o, "h");
    expect(be.boundaryHostId, "sanity: mounted as a boundary event").toBe("h");
    const c = conn(o, "be", "esc");
    const dx = (be.x + be.width / 2) - (h.x + h.width / 2);
    const dy = (be.y + be.height / 2) - (h.y + h.height / 2);
    const outer = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "bottom" : "top");
    expect(c.sourceSide).toBe(outer);       // outer face, away from the host
    expect(c.sourceOffsetAlong).toBe(0.5);
  });
});
