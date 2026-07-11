/**
 * Image-import preserved layout (T0711). When `preservePositions` is set and
 * the plan carries normalised `bounds`, layoutBpmnDiagram reproduces the drawn
 * positions (scaled to canvas px, with parent-child nesting) and marks the
 * result `relaxedLayout: true`. When the geometry is missing it silently falls
 * back to the normal auto-stack layout (no relaxedLayout).
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

const withBounds: AiElement[] = [
  { id: "p", type: "pool", label: "Customer", poolType: "white-box", bounds: { x: 0.05, y: 0.10, w: 0.90, h: 0.35 } },
  { id: "a", type: "task", label: "A", pool: "p", bounds: { x: 0.10, y: 0.18, w: 0.10, h: 0.08 } },
  { id: "b", type: "task", label: "B", pool: "p", bounds: { x: 0.55, y: 0.18, w: 0.10, h: 0.08 } },
];
const conns: AiConnection[] = [{ sourceId: "a", targetId: "b" }];

describe("layoutBpmnPreserved reproduces drawn positions (T0711)", () => {
  it("scales normalised bounds to px, nests nodes in the pool, and sets relaxedLayout", () => {
    const d = layoutBpmnDiagram(withBounds, conns, {
      preservePositions: true,
      imageAspect: { w: 1000, h: 600 },
    });
    expect(d.relaxedLayout).toBe(true);

    const pool = d.elements.find((e) => e.id === "p")!;
    // START_X (50) + 0.05 * TARGET_W(1600) = 130.
    expect(pool.x).toBeCloseTo(130, 0);

    const a = d.elements.find((e) => e.id === "a")!;
    expect(a.parentId).toBe("p");
    // Node A sits inside the pool box (drawn membership preserved).
    expect(a.x).toBeGreaterThanOrEqual(pool.x);
    expect(a.x).toBeLessThanOrEqual(pool.x + pool.width);

    // A drawn to the LEFT of B stays left of B (horizontal order preserved).
    const b = d.elements.find((e) => e.id === "b")!;
    expect(a.x).toBeLessThan(b.x);

    // The connector was built.
    expect(d.connectors.some((c) => c.sourceId === "a" && c.targetId === "b")).toBe(true);
  });

  it("falls back to auto-stack when bounds are missing", () => {
    const noBounds = withBounds.map(({ bounds: _b, ...rest }) => rest) as AiElement[];
    const d = layoutBpmnDiagram(noBounds, conns, { preservePositions: true });
    expect(d.relaxedLayout).toBeUndefined();
    // Still produced a valid diagram via the normal engine.
    expect(d.elements.length).toBeGreaterThan(0);
  });

  it("routes connectors so their visible endpoints attach to the source & target (T0712)", () => {
    const d = layoutBpmnDiagram(withBounds, conns, { preservePositions: true, imageAspect: { w: 1000, h: 600 } });
    const a = d.elements.find((e) => e.id === "a")!;
    const b = d.elements.find((e) => e.id === "b")!;
    const c = d.connectors.find((x) => x.sourceId === "a" && x.targetId === "b")!;
    const wp = c.waypoints;
    // With invisible centre leaders: waypoints[1] = the attachment point on the
    // source boundary, waypoints[len-2] = the attachment point on the target.
    const srcEdge = wp[1];
    const tgtEdge = wp[wp.length - 2];
    const onRect = (p: { x: number; y: number }, e: { x: number; y: number; width: number; height: number }) =>
      p.x >= e.x - 1 && p.x <= e.x + e.width + 1 && p.y >= e.y - 1 && p.y <= e.y + e.height + 1;
    expect(onRect(srcEdge, a)).toBe(true); // touches source — not floating (regression: it used to float)
    expect(onRect(tgtEdge, b)).toBe(true); // touches target
  });
});

const withBoundary: AiElement[] = [
  { id: "p", type: "pool", label: "P", poolType: "white-box", bounds: { x: 0.05, y: 0.10, w: 0.90, h: 0.50 } },
  { id: "t", type: "task", label: "T", pool: "p", bounds: { x: 0.30, y: 0.25, w: 0.15, h: 0.12 } },
  // Drawn straddling the task's BOTTOM edge → an edge-mounted (boundary) event.
  { id: "be", type: "intermediate-event", label: "timer", pool: "p", boundaryHost: "t", bounds: { x: 0.36, y: 0.35, w: 0.03, h: 0.04 } },
];

const msgShare: AiElement[] = [
  { id: "sys", type: "pool", label: "System", poolType: "black-box", isSystem: true, bounds: { x: 0.05, y: 0.05, w: 0.90, h: 0.10 } },
  { id: "main", type: "pool", label: "Process", poolType: "white-box", bounds: { x: 0.05, y: 0.40, w: 0.90, h: 0.30 } },
  { id: "a", type: "task", label: "A", pool: "main", bounds: { x: 0.15, y: 0.50, w: 0.12, h: 0.08 } },
  { id: "b", type: "task", label: "B", pool: "main", bounds: { x: 0.55, y: 0.50, w: 0.12, h: 0.08 } },
];
const msgConns: AiConnection[] = [
  { sourceId: "a", targetId: "sys", type: "message" },
  { sourceId: "b", targetId: "sys", type: "message" },
];

describe("layoutBpmnPreserved message rules (T0716)", () => {
  it("two messages sharing a target element do NOT share an attachment point (Rule 4)", () => {
    const d = layoutBpmnDiagram(msgShare, msgConns, { preservePositions: true });
    const ca = d.connectors.find((c) => c.sourceId === "a" && c.targetId === "sys")!;
    const cb = d.connectors.find((c) => c.sourceId === "b" && c.targetId === "sys")!;
    expect(ca.type).toBe("messageBPMN");
    // Both attach to the shared pool's top or bottom …
    expect(["top", "bottom"]).toContain(ca.targetSide);
    expect(ca.targetSide).toBe(cb.targetSide);
    // … but at DIFFERENT offsets along that side (Rule 4).
    expect(ca.targetOffsetAlong).not.toBe(cb.targetOffsetAlong);
  });
});

describe("layoutBpmnPreserved Expanded Subprocess containment (T0719)", () => {
  const epScene: AiElement[] = [
    { id: "p", type: "pool", label: "Customer", poolType: "white-box", bounds: { x: 0.02, y: 0.10, w: 0.96, h: 0.60 } },
    { id: "ep", type: "subprocess-expanded", label: "Checkout", pool: "p", bounds: { x: 0.10, y: 0.20, w: 0.28, h: 0.34 } },
    { id: "a", type: "task", label: "Pick", pool: "p", parentSubprocess: "ep", bounds: { x: 0.14, y: 0.30, w: 0.09, h: 0.09 } },
    // End event drawn OUTSIDE the EP's (too-narrow) right edge — should be enclosed.
    { id: "fin", type: "end-event", label: "Done", pool: "p", parentSubprocess: "ep", bounds: { x: 0.40, y: 0.32, w: 0.03, h: 0.05 } },
    // Intermediate event sitting on the EP's right edge, NOT a child — edge-mount it.
    { id: "ie", type: "intermediate-event", label: "Timer", pool: "p", bounds: { x: 0.385, y: 0.34, w: 0.03, h: 0.04 } },
  ];

  it("parents EP children to the EP, grows the EP to enclose them, and edge-mounts a boundary event", () => {
    const d = layoutBpmnDiagram(epScene, [], { preservePositions: true });
    const ep = d.elements.find((e) => e.id === "ep")!;
    const a = d.elements.find((e) => e.id === "a")!;
    const fin = d.elements.find((e) => e.id === "fin")!;
    const ie = d.elements.find((e) => e.id === "ie")!;
    // Containment: children point at the EP (so routing treats it as a box, not obstacle).
    expect(a.parentId).toBe("ep");
    expect(fin.parentId).toBe("ep");
    // The EP grew to fully enclose its children (the End event is now inside).
    expect(fin.x + fin.width).toBeLessThanOrEqual(ep.x + ep.width + 0.5);
    expect(fin.x).toBeGreaterThanOrEqual(ep.x - 0.5);
    // The intermediate event on the edge became a boundary event.
    expect(ie.boundaryHostId).toBe("ep");
  });
});

describe("layoutBpmnPreserved mounts edge events on their host (T0713)", () => {
  it("sets boundaryHostId and snaps the event centre onto a host edge", () => {
    const d = layoutBpmnDiagram(withBoundary, [], { preservePositions: true });
    const be = d.elements.find((e) => e.id === "be")!;
    const t = d.elements.find((e) => e.id === "t")!;
    expect(be.boundaryHostId).toBe("t");
    const cx = be.x + be.width / 2, cy = be.y + be.height / 2;
    const onEdge = Math.abs(cx - t.x) < 2 || Math.abs(cx - (t.x + t.width)) < 2
      || Math.abs(cy - t.y) < 2 || Math.abs(cy - (t.y + t.height)) < 2;
    expect(onEdge).toBe(true);
  });
});
