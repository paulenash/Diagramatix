/**
 * Inter-pool gap = 1.5 × Task height (POOL_GAP = 98), and message-flow labels
 * sit in the gap, centred on their connector — recomputed from FINAL routed
 * geometry (R05.09) so the restack that shrinks the gap can't leave them stale
 * (Paul, 2026-07-29).
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

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

  it("T1058 — each message label is centred on its connector and lands inside an inter-pool gap band", () => {
    const out = layoutBpmnDiagram(els, conns);
    const pools = out.elements.filter((e) => e.type === "pool").sort((a, b) => a.y - b.y);
    const bands = pools.slice(1).map((p, i) => ({ top: pools[i].y + pools[i].height, bot: p.y }));
    const msgs = out.connectors.filter((c) => c.type === "messageBPMN");
    expect(msgs.length, "three message flows").toBe(3);
    for (const c of msgs) {
      const wps = c.waypoints;
      expect(wps.length, "message has leader waypoints").toBeGreaterThanOrEqual(4);
      // Centred horizontally on the (vertical) connector.
      expect(Math.abs((c as any).labelOffsetX ?? 0), `"${c.label}" centred`).toBeLessThanOrEqual(1);
      // Label Y (anchor = leader midpoint, matching the renderer) falls in a gap.
      const anchorY = (wps[1].y + wps[wps.length - 2].y) / 2;
      const absY = anchorY + ((c as any).labelOffsetY ?? 0);
      const inGap = bands.some((b) => absY >= b.top - 12 && absY <= b.bot + 12);
      expect(inGap, `"${c.label}" label (y=${Math.round(absY)}) must be in an inter-pool gap`).toBe(true);
    }
  });
});
