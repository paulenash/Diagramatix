import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { reducer } from "@/app/hooks/useDiagram";

/**
 * Nudging an element must never restructure the process.
 *
 * Paul, 2026-09-04, on V22.10. He moved the task "Refer reserve discrepancy to
 * reserving analyst" slightly left — "just an attempt to slightly improve the
 * look of the group" — and the SAVED diagram came back rewired:
 *
 *     DELETED:  Record nil reserve balance -> Reserve position finalised
 *     ADDED:    Record nil reserve balance -> Refer reserve discrepancy
 *     ADDED:    Refer reserve discrepancy  -> Reserve position finalised
 *
 * Auto-fuse had spliced the task into the branch it was dragged across. That
 * task was ALREADY in the flow — an exception path in, its own flow out to the
 * merge — so the splice did not move it, it added it a second time, and its
 * outgoing edge to the merge then existed TWICE. An activity with two inbound
 * and two outbound sequence flows is not drawable BPMN without a gateway.
 *
 * THE SHAPE MATTERS, and a simpler fixture does not reproduce it. Dragging an
 * element onto a connector it is an ENDPOINT of was already refused; what was
 * missing is the case where the element has its own flow ELSEWHERE and is
 * dragged across an unrelated branch. Paul: "I have seen the improper firing of
 * the drop on a connector feature for a while."
 *
 *     start → gw ─┬─ upper ─────────────┬→ merge → end
 *                 └─ lower ─────────────┘
 *     evt → refer ──────────────────────┘        (refer's own path to merge)
 *
 * Dragging `refer` across `lower → merge` is the V22.10 move exactly.
 */
const SHAPE = {
  elements: [
    { id: "s", type: "start-event", label: "Start" },
    { id: "gw", type: "gateway", label: "Which?", gatewayType: "exclusive" },
    { id: "upper", type: "task", label: "Upper" },
    { id: "lower", type: "task", label: "Lower" },
    { id: "evt", type: "intermediate-event", label: "Rejected", eventType: "error", boundaryHost: "upper", boundarySide: "bottom" },
    { id: "refer", type: "task", label: "Refer" },
    { id: "merge", type: "gateway", label: "Done", gatewayType: "exclusive" },
    { id: "e", type: "end-event", label: "End" },
  ] as AiElement[],
  connections: [
    { sourceId: "s", targetId: "gw" },
    { sourceId: "gw", targetId: "upper", label: "up" },
    { sourceId: "gw", targetId: "lower", label: "down" },
    { sourceId: "upper", targetId: "merge" },
    { sourceId: "lower", targetId: "merge" },
    { sourceId: "evt", targetId: "refer" },
    { sourceId: "refer", targetId: "merge" },
    { sourceId: "merge", targetId: "e" },
  ] as AiConnection[],
};

/** Drag `id` onto the middle of the `lower → merge` connector and end the move. */
function dragOntoLowerMerge(data: ReturnType<typeof layoutBpmnDiagram>, id: string) {
  const lm = data.connectors.find((c) => c.sourceId === "lower" && c.targetId === "merge")!;
  const mid = lm.waypoints[Math.floor(lm.waypoints.length / 2)];
  const el = data.elements.find((e) => e.id === id)!;
  const from = { x: el.x, y: el.y };
  const moved = {
    ...data,
    elements: data.elements.map((e) => e.id === id
      ? { ...e, x: mid.x - e.width / 2, y: mid.y - e.height / 2 }
      : e),
  };
  return reducer(moved, { type: "MOVE_END", payload: { id, fromX: from.x, fromY: from.y } });
}

const seq = (d: { connectors: { type: string; sourceId: string; targetId: string }[] }) =>
  d.connectors.filter((c) => c.type === "sequence");

describe("auto-fuse declines to restructure the flow", () => {
  const d0 = layoutBpmnDiagram(SHAPE.elements, SHAPE.connections);

  it("T3224 does not splice an element that is ALREADY in the flow", () => {
    const before = seq(d0).length;
    const d = dragOntoLowerMerge(d0, "refer");
    expect(seq(d)).toHaveLength(before);
    // The branch it was dragged across is intact...
    expect(seq(d).filter((c) => c.sourceId === "lower" && c.targetId === "merge")).toHaveLength(1);
    // ...and `refer` did not gain a second edge to the merge.
    expect(seq(d).filter((c) => c.sourceId === "refer" && c.targetId === "merge")).toHaveLength(1);
  });

  it("T3225 an activity never ends up with two outbound sequence flows", () => {
    // The V22.10 corruption, stated as the property that actually matters.
    const d = dragOntoLowerMerge(d0, "refer");
    for (const el of d.elements.filter((x) => x.type === "task")) {
      expect(seq(d).filter((c) => c.sourceId === el.id).length, `${el.label} outbound`).toBeLessThanOrEqual(1);
      expect(seq(d).filter((c) => c.targetId === el.id).length, `${el.label} inbound`).toBeLessThanOrEqual(1);
    }
  });

  it("T3226 negative control — a LOOSE element is still spliced in", () => {
    // The guards must not disable the feature: an element with no sequence flow
    // dropped on a line is exactly what auto-fuse is for.
    const withLoose = layoutBpmnDiagram(
      [...SHAPE.elements, { id: "loose", type: "task", label: "Loose" } as AiElement],
      SHAPE.connections,
    );
    const d = dragOntoLowerMerge(withLoose, "loose");
    expect(d.connectors.some((c) => c.sourceId === "lower" && c.targetId === "loose")).toBe(true);
    expect(d.connectors.some((c) => c.sourceId === "loose" && c.targetId === "merge")).toBe(true);
    expect(d.connectors.some((c) => c.sourceId === "lower" && c.targetId === "merge")).toBe(false);
  });
});
