/**
 * Animate! reveal ordering: pools → lanes → flow elements (BFS/DFS from start
 * events) with each connector appearing once both endpoints are present.
 */
import { describe, it, expect } from "vitest";
import { buildAnimationOrder } from "@/app/lib/diagram/animateOrder";
import type { DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";

const el = (id: string, type: string, x: number, y: number, parentId?: string): DiagramElement =>
  ({ id, type, x, y, width: type === "task" ? 100 : 40, height: type === "task" ? 65 : 40, label: id, properties: {}, ...(parentId ? { parentId } : {}) } as unknown as DiagramElement);
const cn = (s: string, t: string): Connector => ({ id: `${s}-${t}`, sourceId: s, targetId: t, type: "sequence" } as unknown as Connector);

// Pool/Lane with a start → gateway → (A, B) → (E1, E2) branch.
const DATA: DiagramData = {
  viewport: { x: 0, y: 0, zoom: 1 },
  elements: [
    el("P", "pool", 0, 0),
    el("L", "lane", 36, 0, "P"),
    el("s", "start-event", 60, 180, "L"),
    el("g", "gateway", 160, 180, "L"),
    el("a", "task", 280, 100, "L"),
    el("b", "task", 280, 260, "L"),
    el("e1", "end-event", 440, 115, "L"),
    el("e2", "end-event", 440, 275, "L"),
  ],
  connectors: [cn("s", "g"), cn("g", "a"), cn("g", "b"), cn("a", "e1"), cn("b", "e2")],
} as DiagramData;

describe("Animate! reveal order", () => {
  it("T0651 — pools→lanes→flow; connectors appear only after both endpoints; complete + unique", () => {
    const order = buildAnimationOrder(DATA, "bfs");
    const at = (id: string) => order.indexOf(id);
    // containers first
    expect(order[0]).toBe("P");
    expect(order[1]).toBe("L");
    // flow follows control-flow order
    expect(at("s")).toBeLessThan(at("g"));
    expect(at("g")).toBeLessThan(at("a"));
    expect(at("g")).toBeLessThan(at("b"));
    // a connector only after BOTH its endpoints
    for (const c of DATA.connectors) {
      expect(at(c.id)).toBeGreaterThan(at(c.sourceId));
      expect(at(c.id)).toBeGreaterThan(at(c.targetId));
    }
    // complete + unique (8 elements + 5 connectors)
    expect(order.length).toBe(13);
    expect(new Set(order).size).toBe(13);
  });

  it("T0652 — BFS reveals both branches before descending; DFS descends one branch first", () => {
    const bfs = buildAnimationOrder(DATA, "bfs");
    const dfs = buildAnimationOrder(DATA, "dfs");
    // BFS: both gateway targets (a, b) before either end event.
    expect(bfs.indexOf("b")).toBeLessThan(bfs.indexOf("e1"));
    // DFS: dives down the first branch (a → e1) before visiting b.
    expect(dfs.indexOf("e1")).toBeLessThan(dfs.indexOf("b"));
  });
});
