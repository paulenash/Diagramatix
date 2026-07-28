/**
 * Issue 4 (2026-07-29): a connector FROM a Decision gateway attaches to the
 * target's nearest VERTICAL boundary (left/right) — never top/bottom — so every
 * branch reads horizontally out of the gateway. Previously an above/below EVENT
 * target got a top/bottom attachment via the generic R3.06 sideFacing rule.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

const els: AiElement[] = [
  { id: "p", type: "pool", label: "P", poolType: "white-box" },
  { id: "s", type: "start-event", label: "S", pool: "p" },
  { id: "d", type: "gateway", gatewayType: "exclusive", label: "Choose?", pool: "p" },
  { id: "e1", type: "end-event", label: "End A", pool: "p" },
  { id: "e2", type: "end-event", label: "End B", pool: "p" },
  { id: "e3", type: "end-event", label: "End C", pool: "p" },
];
const conns: AiConnection[] = [
  { sourceId: "s", targetId: "d" },
  { sourceId: "d", targetId: "e1" }, { sourceId: "d", targetId: "e2" }, { sourceId: "d", targetId: "e3" },
];

describe("Issue 4 — decision-gateway connectors attach on a vertical boundary", () => {
  it("T1063 — every decision→event connector enters the target on left or right (never top/bottom)", () => {
    const out = layoutBpmnDiagram(els, conns);
    const branches = out.connectors.filter((c) => c.sourceId === "d");
    expect(branches.length, "three branches").toBe(3);
    for (const c of branches) {
      expect(["left", "right"], `${c.targetId} tgtSide=${c.targetSide} must be vertical`).toContain(c.targetSide);
    }
  });
});
