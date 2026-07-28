/**
 * Inter-pool gap = 1.5 × Task height (POOL_GAP = 98) — snug around the message
 * labels, restacked after the final lane hug so a shrinking white-box pool can't
 * balloon the gap to the black-box pool below it (Paul, 2026-07-29).
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

const POOL_GAP = 98;

// A white-box process pool with a few tasks (so the lane hug shrinks it), plus a
// customer (external, above) and an IT system (below) exchanging messages.
const els: AiElement[] = [
  { id: "cust", type: "pool", label: "Customer", poolType: "black-box", isSystem: false },
  { id: "p", type: "pool", label: "Company", poolType: "white-box" },
  { id: "sys", type: "pool", label: "CRM", poolType: "black-box", isSystem: true },
  { id: "s", type: "start-event", label: "Start", pool: "p" },
  { id: "t1", type: "task", label: "Receive Request", pool: "p" },
  { id: "t2", type: "task", label: "Process", pool: "p" },
  { id: "e", type: "end-event", label: "End", pool: "p" },
];
const conns: AiConnection[] = [
  { sourceId: "s", targetId: "t1" }, { sourceId: "t1", targetId: "t2" }, { sourceId: "t2", targetId: "e" },
  { sourceId: "cust", targetId: "t1", type: "message", label: "Request" },
  { sourceId: "t2", targetId: "sys", type: "message", label: "Save record" },
];

describe("Inter-pool gap = 1.5 × Task height", () => {
  it("T1057 — every vertical gap between stacked pools equals POOL_GAP (no ballooning)", () => {
    const out = layoutBpmnDiagram(els, conns);
    const pools = out.elements.filter((e) => e.type === "pool").sort((a, b) => a.y - b.y);
    expect(pools.length, "three pools").toBe(3);
    for (let i = 0; i < pools.length - 1; i++) {
      const gap = pools[i + 1].y - (pools[i].y + pools[i].height);
      expect(Math.round(gap), `gap ${pools[i].label}→${pools[i + 1].label} must be POOL_GAP`).toBe(POOL_GAP);
    }
  });

  it("T1058 — a message label sits in the gap, centred on its connector (offsetX≈0)", () => {
    const out = layoutBpmnDiagram(els, conns);
    const msg = out.connectors.filter((c) => c.type === "messageBPMN" || c.type === "message");
    expect(msg.length, "two message connectors").toBeGreaterThanOrEqual(2);
    for (const c of msg) {
      // Layout centres the label horizontally on the (vertical) connector.
      expect(Math.abs((c as any).labelOffsetX ?? 0), `"${c.label}" label centred on connector`).toBeLessThanOrEqual(1);
    }
  });
});
