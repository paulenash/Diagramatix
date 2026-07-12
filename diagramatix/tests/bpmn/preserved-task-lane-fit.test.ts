/**
 * Preserved (image import) layout — task sizing + lane containment (T0738).
 *
 *  1. Tasks/subprocesses are sized to their TEXT, not the (often oversized)
 *     drawn image box — they grow only if the label needs it.
 *  2. A lane-assigned flow element whose drawn box straddles a lane boundary is
 *     clamped fully INSIDE its assigned lane (the plan's lane is authoritative).
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { autoSizeForType } from "@/app/lib/diagram/textMetrics";

// Two lanes tiled top/bottom. tBig is drawn huge but has a short label. tStr is
// assigned to the LOWER lane but drawn straddling the boundary (top pokes up).
const ELS: AiElement[] = [
  { id: "p1", type: "pool", label: "Ops", poolType: "white-box", bounds: { x: 0.05, y: 0.05, w: 0.9, h: 0.7 } },
  { id: "l1", type: "lane", label: "Top", parentPool: "p1", bounds: { x: 0.05, y: 0.05, w: 0.9, h: 0.35 } },
  { id: "l2", type: "lane", label: "Bottom", parentPool: "p1", bounds: { x: 0.05, y: 0.40, w: 0.9, h: 0.35 } },
  // Short label, drawn as a large box → should shrink to fit "OK".
  { id: "tBig", type: "task", label: "OK", pool: "p1", lane: "l1", bounds: { x: 0.20, y: 0.10, w: 0.35, h: 0.22 } },
  // Assigned to l2 but drawn straddling the l1/l2 boundary (top at y≈0.36).
  { id: "tStr", type: "task", label: "Send Back to Requester", pool: "p1", lane: "l2", bounds: { x: 0.55, y: 0.36, w: 0.14, h: 0.10 } },
];
const CONNS: AiConnection[] = [{ sourceId: "tBig", targetId: "tStr" }];

describe("preserved layout — task sizing + lane containment (T0738)", () => {
  const d = layoutBpmnDiagram(ELS, CONNS, { preservePositions: true, imageAspect: { w: 1000, h: 1000 } });
  const g = (id: string) => d.elements.find((e) => e.id === id)!;

  it("ran the preserved path", () => {
    expect(d.relaxedLayout).toBe(true);
  });

  it("sizes a task to its TEXT, not the oversized drawn box", () => {
    const t = g("tBig");
    const fit = autoSizeForType("task", "OK", 12, false);
    // Matches the text-fit size (small), NOT the huge drawn box (~0.35×1600 wide).
    expect(t.width).toBeCloseTo(fit.w, 0);
    expect(t.height).toBeCloseTo(fit.h, 0);
    expect(t.width).toBeLessThan(160);
    expect(t.height).toBeLessThan(90);
  });

  it("clamps a straddling task fully inside its assigned lane", () => {
    const t = g("tStr"), l2 = g("l2");
    expect(t.parentId).toBe("l2");
    expect(t.y).toBeGreaterThanOrEqual(l2.y);
    expect(t.y + t.height).toBeLessThanOrEqual(l2.y + l2.height);
    // And it does NOT cross up into the lane above (l1).
    const l1 = g("l1");
    expect(t.y).toBeGreaterThanOrEqual(l1.y + l1.height);
  });

  it("no flow element straddles a lane boundary", () => {
    const lanes = d.elements.filter((e) => e.type === "lane");
    const flow = d.elements.filter((e) => ["task", "gateway", "start-event", "end-event", "intermediate-event"].includes(e.type));
    for (const f of flow) {
      const crosses = lanes.some((l) => f.y < l.y && f.y + f.height > l.y);
      expect(crosses, `${f.label} straddles a lane boundary`).toBe(false);
    }
  });
});
