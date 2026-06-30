/**
 * R8.16 — event labels must not overlap other elements or other event labels.
 * B33 (checkEventLabelOverlap) is the detector; the layout's label-nudge pass is
 * the fix. This lays out an event-rich diagram with long labels (an event-based
 * split/merge plus a boundary event) and asserts B33 stays clean afterwards.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { checkEventLabelOverlap } from "@/app/lib/diagram/checks/diagramChecks";

const els: AiElement[] = [
  { id: "s", type: "start-event", label: "Order Received" },
  { id: "g", type: "gateway", gatewayType: "event-based", label: "" },
  { id: "ev1", type: "intermediate-event", label: "Payment Confirmed Within Window" },
  { id: "ev2", type: "intermediate-event", label: "Payment Timeout Occurred" },
  { id: "t1", type: "task", label: "Ship Order" },
  { id: "t2", type: "task", label: "Cancel Order" },
  { id: "m", type: "gateway", gatewayType: "event-based", label: "" },
  { id: "e", type: "end-event", label: "Order Closed" },
  { id: "be", type: "intermediate-event", label: "Escalation Raised", boundaryHost: "t1" },
];
const conns: AiConnection[] = [
  { sourceId: "s", targetId: "g" },
  { sourceId: "g", targetId: "ev1" }, { sourceId: "g", targetId: "ev2" },
  { sourceId: "ev1", targetId: "t1" }, { sourceId: "ev2", targetId: "t2" },
  { sourceId: "t1", targetId: "m" }, { sourceId: "t2", targetId: "m" },
  { sourceId: "m", targetId: "e" },
];

describe("Event label nudge (R8.16 / B33)", () => {
  it("T0530 — laid-out event labels stay clear of elements and each other", () => {
    const out = layoutBpmnDiagram(els, conns);
    const v = checkEventLabelOverlap(out);
    expect(v, `event-label overlaps remained:\n  - ${v.map((x) => x.message).join("\n  - ")}`).toEqual([]);
  });
});
