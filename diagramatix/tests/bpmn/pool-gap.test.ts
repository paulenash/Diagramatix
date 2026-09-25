/**
 * Inter-pool gap = 1.5 × Task height (POOL_GAP = 98), and message-flow labels
 * sit in the gap — placed from the FINAL routed geometry so the restack that
 * shrinks the gap can't leave them stale (Paul, 2026-07-29).
 *
 * WHERE in the gap changed on 2026-09-25. The June rule (R05.05 / R05.09)
 * centred a generated label ON its line; Paul's rule now — "The message lable
 * should always be in the air gap between pools and attached closest to the
 * Pool meesage endpoint diagonally to the left or right", "Always — generated
 * too" — attaches it at the pool end, beside the line. messageLabel.ts.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { connectorLabelBox } from "@/app/lib/diagram/checks/layoutViolations";

const POOL_GAP = 98;

const els: AiElement[] = [
  { id: "cust", type: "pool", label: "Customer", poolType: "black-box", isSystem: false },
  { id: "p", type: "pool", label: "Company", poolType: "white-box" },
  { id: "sys", type: "pool", label: "CRM", poolType: "black-box", isSystem: true },
  { id: "s", type: "start-event", label: "Start", pool: "p" },
  { id: "t1", type: "task", label: "Receive Request", pool: "p" },
  { id: "t2", type: "task", label: "Process", pool: "p" },
  { id: "t3", type: "task", label: "Respond", pool: "p" },
  { id: "e", type: "end-event", label: "End", pool: "p" },
];
const conns: AiConnection[] = [
  { sourceId: "s", targetId: "t1" }, { sourceId: "t1", targetId: "t2" }, { sourceId: "t2", targetId: "t3" }, { sourceId: "t3", targetId: "e" },
  { sourceId: "cust", targetId: "t1", type: "message", label: "Request" },
  { sourceId: "t2", targetId: "sys", type: "message", label: "Save record" },
  { sourceId: "t3", targetId: "cust", type: "message", label: "Response" },
];

describe("Pool gap = 1.5 × Task height + message labels in the gap", () => {
  it("T1057 — every vertical gap between stacked pools equals POOL_GAP", () => {
    const out = layoutBpmnDiagram(els, conns);
    const pools = out.elements.filter((e) => e.type === "pool").sort((a, b) => a.y - b.y);
    expect(pools.length, "three pools").toBe(3);
    for (let i = 0; i < pools.length - 1; i++) {
      const gap = pools[i + 1].y - (pools[i].y + pools[i].height);
      expect(Math.round(gap), `gap ${pools[i].label}→${pools[i + 1].label}`).toBe(POOL_GAP);
    }
  });

  it("T1058 — each message label is in the air gap, attached at its pool end, beside (not on) its line", () => {
    const out = layoutBpmnDiagram(els, conns);
    const byId = new Map(out.elements.map((e) => [e.id, e] as const));
    const pools = out.elements.filter((e) => e.type === "pool").sort((a, b) => a.y - b.y);
    const msgs = out.connectors.filter((c) => c.type === "messageBPMN");
    expect(msgs.length, "three message flows").toBe(3);
    for (const c of msgs) {
      const wps = c.waypoints;
      expect(wps.length, "message has leader waypoints").toBeGreaterThanOrEqual(4);
      const vis = wps.slice(c.sourceInvisibleLeader ? 1 : 0, c.targetInvisibleLeader ? wps.length - 1 : wps.length);
      const fromPool = byId.get(c.sourceId)!.type === "pool";
      const pool = byId.get(fromPool ? c.sourceId : c.targetId)!;
      const at = fromPool ? vis[0] : vis[vis.length - 1];
      const other = fromPool ? vis[vis.length - 1] : vis[0];
      const below = other.y > at.y;
      const edge = below ? pool.y + pool.height : pool.y;
      const i = pools.findIndex((p) => p.id === pool.id);
      const across = pools[below ? i + 1 : i - 1];
      const farEdge = below ? across.y : across.y + across.height;
      // The box the canvas draws, not the stored numbers.
      const box = connectorLabelBox(c, out.elements)!;
      expect(box.y, `"${c.label}" inside the gap`).toBeGreaterThanOrEqual(Math.min(edge, farEdge));
      expect(box.y + box.h, `"${c.label}" inside the gap`).toBeLessThanOrEqual(Math.max(edge, farEdge));
      expect(below ? box.y - edge : edge - (box.y + box.h), `"${c.label}" 10px off its pool's edge`).toBeCloseTo(10, 6);
      const leftOfLine = box.x + box.w <= at.x;
      expect(leftOfLine || box.x >= at.x, `"${c.label}" not across its own line`).toBe(true);
      expect(leftOfLine ? at.x - (box.x + box.w) : box.x - at.x, `"${c.label}" 6px off its line`).toBeCloseTo(6, 6);
    }
  });
});
