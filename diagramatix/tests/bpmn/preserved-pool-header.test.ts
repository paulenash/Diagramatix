/**
 * Preserved (image import) layout — pools stay visible behind their lanes (T0737).
 *
 * snapImportedBounds snaps each lane's x/width to its parent pool's box, so the
 * lanes end up coinciding with the pool and the pool (with its name) renders
 * HIDDEN behind them — the lanes have the pool as a formal parent but it isn't
 * a visible container. layoutBpmnPreserved now gives the pool a left header
 * strip and insets the lanes so the pool shows and visibly encloses them.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

// Pool + two lanes drawn with COINCIDING boxes (same x/width) — the vendor-image
// case where the AI reports the pool box == the lanes' union.
const ELS: AiElement[] = [
  { id: "p1", type: "pool", label: "Amazon", poolType: "white-box", bounds: { x: 0.05, y: 0.10, w: 0.90, h: 0.60 } },
  { id: "l1", type: "lane", label: "Packages", parentPool: "p1", bounds: { x: 0.05, y: 0.10, w: 0.90, h: 0.30 } },
  { id: "l2", type: "lane", label: "Picker", parentPool: "p1", bounds: { x: 0.05, y: 0.40, w: 0.90, h: 0.30 } },
  { id: "t1", type: "task", label: "Scan", pool: "p1", lane: "l1", bounds: { x: 0.30, y: 0.18, w: 0.12, h: 0.08 } },
  { id: "t2", type: "task", label: "Pick", pool: "p1", lane: "l2", bounds: { x: 0.30, y: 0.48, w: 0.12, h: 0.08 } },
] as AiElement[];
const CONNS: AiConnection[] = [{ sourceId: "t1", targetId: "t2" }];

describe("preserved layout keeps the pool visible behind its lanes (T0737)", () => {
  const d = layoutBpmnDiagram(ELS, CONNS, { preservePositions: true, imageAspect: { w: 1000, h: 700 } });
  const g = (id: string) => d.elements.find((e) => e.id === id)!;

  it("ran the preserved (relaxed) path", () => {
    expect(d.relaxedLayout).toBe(true);
    expect(g("p1")).toBeTruthy();
  });

  it("gives the pool a visible header strip to the LEFT of its lanes", () => {
    const p = g("p1"), l1 = g("l1"), l2 = g("l2");
    const headerW = (p.properties?.poolHeaderWidth as number) ?? 0;
    expect(headerW).toBeGreaterThan(0);
    // Pool's left edge is header-width to the left of the lanes → header shows.
    expect(p.x).toBeLessThan(l1.x);
    expect(l1.x - p.x).toBeCloseTo(headerW, 0);
    // Both lanes start flush against the header (same content column).
    expect(l2.x).toBe(l1.x);
  });

  it("the pool visibly encloses every lane", () => {
    const p = g("p1"), l1 = g("l1"), l2 = g("l2");
    for (const l of [l1, l2]) {
      expect(p.x).toBeLessThanOrEqual(l.x);
      expect(p.x + p.width).toBeGreaterThanOrEqual(l.x + l.width);
      expect(p.y).toBeLessThanOrEqual(l.y);
      expect(p.y + p.height).toBeGreaterThanOrEqual(l.y + l.height);
    }
  });

  it("lanes keep the pool as their parent", () => {
    expect(g("l1").parentId).toBe("p1");
    expect(g("l2").parentId).toBe("p1");
  });
});
