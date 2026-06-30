/**
 * Expanded-Subprocess boundary resize — characterisation.
 *
 * Reported: dragging the OUTER EP's side or top boundary makes the whole element
 * drift on the canvas, and whether it happens depends on what's inside the EP and
 * on which edge. These tests drive the real reducer's RESIZE_ELEMENT on each edge
 * and assert that ONLY the dragged edge moves — the three other edges must stay
 * put (no drift). Two fixtures: a plain EP and an EP that contains a nested EP.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import type { DiagramData } from "@/app/lib/diagram/types";
import issueData from "./fixtures/ep-resize-issue.json";

const build = (e: AiElement[], c: AiConnection[]) => layoutBpmnDiagram(e, c);
const dispatch = (s: DiagramData, a: Action) => reducer(s, a);
const at = (d: DiagramData, id: string) => d.elements.find((e) => e.id === id)!;

// Plain EP: start → task → end inside.
const PLAIN = build(
  [
    { id: "ep", type: "subprocess-expanded", label: "Main Subprocess" },
    { id: "es", type: "start-event", label: "Start", parentSubprocess: "ep" },
    { id: "t1", type: "task", label: "Task 1", parentSubprocess: "ep" },
    { id: "ee", type: "end-event", label: "End", parentSubprocess: "ep" },
  ] as AiElement[],
  [{ sourceId: "es", targetId: "t1" }, { sourceId: "t1", targetId: "ee" }] as AiConnection[],
);

// EP that contains a NESTED EP (the reported shape).
const NESTED = build(
  [
    { id: "ep", type: "subprocess-expanded", label: "Main Subprocess" },
    { id: "es", type: "start-event", label: "Start", parentSubprocess: "ep" },
    { id: "t1", type: "task", label: "Task 1", parentSubprocess: "ep" },
    { id: "nep", type: "subprocess-expanded", label: "Handle Event", parentSubprocess: "ep" },
    { id: "ns", type: "start-event", label: "NS", parentSubprocess: "nep" },
    { id: "nt", type: "task", label: "NT", parentSubprocess: "nep" },
    { id: "nee", type: "end-event", label: "NE", parentSubprocess: "nep" },
    { id: "ee", type: "end-event", label: "End", parentSubprocess: "ep" },
  ] as AiElement[],
  [
    { sourceId: "es", targetId: "t1" }, { sourceId: "t1", targetId: "nep" }, { sourceId: "nep", targetId: "ee" },
    { sourceId: "ns", targetId: "nt" }, { sourceId: "nt", targetId: "nee" },
  ] as AiConnection[],
);

type Edge = "top" | "bottom" | "left" | "right";
const resize = (d: DiagramData, id: string, edge: Edge, delta: number): DiagramData => {
  const ep = at(d, id);
  const r = { x: ep.x, y: ep.y, width: ep.width, height: ep.height };
  if (edge === "top") { r.y = ep.y - delta; r.height = ep.height + delta; }
  if (edge === "bottom") { r.height = ep.height + delta; }
  if (edge === "left") { r.x = ep.x - delta; r.width = ep.width + delta; }
  if (edge === "right") { r.width = ep.width + delta; }
  return dispatch(d, { type: "RESIZE_ELEMENT", payload: { id, ...r } });
};

const TOL = 1.5;
// The edges that must NOT move for a given dragged edge.
const fixedEdges: Record<Edge, Array<"x" | "right" | "y" | "bottom">> = {
  top: ["x", "right", "bottom"],
  bottom: ["x", "right", "y"],
  left: ["y", "bottom", "right"],
  right: ["y", "bottom", "x"],
};
const edgeVal = (e: ReturnType<typeof at>, k: "x" | "right" | "y" | "bottom") =>
  k === "x" ? e.x : k === "right" ? e.x + e.width : k === "y" ? e.y : e.y + e.height;

function checkNoDrift(d0: DiagramData, edge: Edge, epId = "ep") {
  const before = at(d0, epId);
  const want = Object.fromEntries(fixedEdges[edge].map((k) => [k, edgeVal(before, k)]));
  const d1 = resize(d0, epId, edge, 40);
  const after = at(d1, epId);
  for (const k of fixedEdges[edge]) {
    expect(
      edgeVal(after, k as "x" | "right" | "y" | "bottom"),
      `dragging ${edge} edge drifted the ${k} edge: ${Math.round(want[k])} → ${Math.round(edgeVal(after, k as never))}`,
    ).toBeCloseTo(want[k], -Math.log10(TOL));
  }
}

describe("EP boundary resize — plain EP", () => {
  for (const edge of ["top", "bottom", "left", "right"] as Edge[]) {
    it(`${edge} edge: only that edge moves (no whole-element drift)`, () => checkNoDrift(PLAIN, edge));
  }
});

describe("EP boundary resize — EP containing a nested EP", () => {
  for (const edge of ["top", "bottom", "left", "right"] as Edge[]) {
    it(`${edge} edge: only that edge moves (no whole-element drift)`, () => checkNoDrift(NESTED, edge));
  }
});

// The reported diagram, loaded verbatim — outer EP "Main Subprocess" (yqlnygs5).
const ISSUE = issueData as unknown as DiagramData;
describe("EP boundary resize — reported diagram (Main Subprocess)", () => {
  for (const edge of ["top", "bottom", "left", "right"] as Edge[]) {
    it(`${edge} edge: only that edge moves (no whole-element drift)`, () => checkNoDrift(ISSUE, edge, "yqlnygs5"));
  }
});

// Incremental drag — 5 small steps, each re-reading the CURRENT rect (as the
// live handle does). Catches drift that ACCUMULATES across a drag.
describe("EP boundary resize — incremental drag does not accumulate drift", () => {
  for (const [name, d0, epId] of [["nested", NESTED, "ep"], ["reported", ISSUE, "yqlnygs5"]] as const) {
    for (const edge of ["top", "bottom", "left", "right"] as Edge[]) {
      it(`${name}/${edge}: 5×8px steps keep the other edges fixed`, () => {
        const before = at(d0, epId);
        const want = Object.fromEntries(fixedEdges[edge].map((k) => [k, edgeVal(before, k)]));
        let d = d0;
        for (let i = 0; i < 5; i++) d = resize(d, epId, edge, 8);
        const after = at(d, epId);
        for (const k of fixedEdges[edge]) {
          expect(edgeVal(after, k as never), `${name}: incremental ${edge} drift on ${k}`)
            .toBeCloseTo(want[k], -Math.log10(TOL));
        }
      });
    }
  }
});

// When an EP edge grows OUTWARD, the contents should stay put (the box grows
// around them, not the other way round).
describe("EP boundary resize — contents stay put when an edge grows outward", () => {
  for (const [name, d0, epId] of [["nested", NESTED, "ep"], ["reported", ISSUE, "yqlnygs5"]] as const) {
    const child0 = d0.elements.find((e) => e.parentId === epId && e.type === "task")!;
    for (const edge of ["top", "bottom", "left", "right"] as Edge[]) {
      it(`${name}/${edge}: child "${child0?.label?.replace(/\s+/g, " ")}" stays put`, () => {
        const cx0 = child0.x, cy0 = child0.y;
        const d1 = resize(d0, epId, edge, 40);
        const child1 = d1.elements.find((e) => e.id === child0.id)!;
        expect(child1.x, `${name}: child x drifted on ${edge}`).toBeCloseTo(cx0, -Math.log10(TOL));
        expect(child1.y, `${name}: child y drifted on ${edge}`).toBeCloseTo(cy0, -Math.log10(TOL));
      });
    }
  }
});
