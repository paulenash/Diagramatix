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
});
