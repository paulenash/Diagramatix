/**
 * State Machine — reproduce layout from an image (T0735).
 *
 * layoutStateMachinePreserved honours the geometry the AI transcribes from an
 * image: original positions (normalised bounds → px, aspect-preserving),
 * Composite-State NESTING (a child's `parent` → parentId, container grown to
 * enclose it), and connector BOUNDARY FACES (transition sourceSide/targetSide).
 * Falls back (returns null) when too few elements carry bounds.
 */
import { describe, it, expect } from "vitest";
import { layoutStateMachinePreserved } from "@/app/lib/diagram/stateMachineLayout";
import { layoutGenericDiagram } from "@/app/lib/diagram/genericLayout";

const PLAN = {
  elements: [
    { id: "i", type: "initial-state", label: "", bounds: { x: 0.04, y: 0.45, w: 0.03, h: 0.04 } },
    { id: "s1", type: "state", label: "Idle", bounds: { x: 0.12, y: 0.42, w: 0.14, h: 0.10 } },
    { id: "c1", type: "composite-state", label: "Running", bounds: { x: 0.35, y: 0.20, w: 0.40, h: 0.55 } },
    { id: "s2", type: "state", label: "Working", bounds: { x: 0.42, y: 0.32, w: 0.16, h: 0.10 }, parent: "c1" },
    { id: "f", type: "final-state", label: "", bounds: { x: 0.88, y: 0.46, w: 0.04, h: 0.05 } },
  ],
  connections: [
    { sourceId: "i", targetId: "s1", sourceSide: "right", targetSide: "left" },
    { sourceId: "s1", targetId: "s2", label: "start", sourceSide: "right", targetSide: "left" },
    { sourceId: "s2", targetId: "f", label: "done", sourceSide: "bottom", targetSide: "top" },
  ],
};

describe("layoutStateMachinePreserved (T0735)", () => {
  const d = layoutStateMachinePreserved(PLAN.elements as never, PLAN.connections as never, { w: 1000, h: 600 })!;
  const el = (id: string) => d.elements.find((e) => e.id === id)!;

  it("returns a layout when elements carry bounds", () => {
    expect(d).toBeTruthy();
    expect(d.elements).toHaveLength(5);
  });

  it("nests a child state inside its composite-state parent (parentId + enclosure)", () => {
    const s2 = el("s2"), c1 = el("c1");
    expect(s2.parentId).toBe("c1");
    // Container encloses the child.
    expect(c1.x).toBeLessThanOrEqual(s2.x);
    expect(c1.y).toBeLessThanOrEqual(s2.y);
    expect(c1.x + c1.width).toBeGreaterThanOrEqual(s2.x + s2.width);
    expect(c1.y + c1.height).toBeGreaterThanOrEqual(s2.y + s2.height);
  });

  it("keeps the original left-to-right placement (i < s1 < c1 < f)", () => {
    expect(el("i").x).toBeLessThan(el("s1").x);
    expect(el("s1").x).toBeLessThan(el("c1").x);
    expect(el("c1").x).toBeLessThan(el("f").x);
  });

  it("keeps pseudostates small (not scaled to the bounds width)", () => {
    expect(el("i").width).toBeLessThan(50);
    expect(el("f").width).toBeLessThan(50);
  });

  it("attaches each transition to the AI-declared boundary faces", () => {
    const c = (s: string, t: string) => d.connectors.find((k) => k.sourceId === s && k.targetId === t)!;
    expect(c("s1", "s2").sourceSide).toBe("right");
    expect(c("s1", "s2").targetSide).toBe("left");
    expect(c("s2", "f").sourceSide).toBe("bottom");
    expect(c("s2", "f").targetSide).toBe("top");
  });

  it("falls back (null) when too few elements carry bounds", () => {
    const sparse = {
      elements: [
        { id: "a", type: "state", label: "A", bounds: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } },
        { id: "b", type: "state", label: "B" },
        { id: "c", type: "state", label: "C" },
        { id: "e", type: "final-state", label: "" },
      ],
      connections: [],
    };
    expect(layoutStateMachinePreserved(sparse.elements as never, sparse.connections as never)).toBeNull();
  });

  it("layoutGenericDiagram routes a bounded state machine through the preserved path", () => {
    const out = layoutGenericDiagram(PLAN as never, "state-machine", { imageAspect: { w: 1000, h: 600 } });
    // Preserved path keeps the parent nesting (the generic grid would not).
    expect(out.elements.find((e) => e.id === "s2")!.parentId).toBe("c1");
  });
});
