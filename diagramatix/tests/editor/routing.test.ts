/**
 * Editor routing — characterisation net (first cut).
 *
 * Drives the REAL editor reducer (MOVE_ELEMENT → re-route) and asserts the
 * routing invariants (orthogonal, attached, clear of obstacles). Baselines pin
 * fresh-layout routing; the move cases exercise re-routing + obstacle avoidance.
 * Where the obstacle-avoidance gaps exist, they surface here as concrete cases.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import type { DiagramData } from "@/app/lib/diagram/types";
import { findRoutingViolations } from "./_helpers/routing";

const build = (e: AiElement[], c: AiConnection[]) => layoutBpmnDiagram(e, c);
const move = (s: DiagramData, id: string, x: number, y: number): DiagramData =>
  reducer(s, { type: "MOVE_ELEMENT", payload: { id, x, y } } satisfies Action);

const LINEAR: { elements: AiElement[]; connections: AiConnection[] } = {
  elements: [
    { id: "s", type: "start-event", label: "Start" },
    { id: "a", type: "task", label: "A" },
    { id: "b", type: "task", label: "B" },
    { id: "c", type: "task", label: "C" },
    { id: "e", type: "end-event", label: "End" },
  ],
  connections: [
    { sourceId: "s", targetId: "a" },
    { sourceId: "a", targetId: "b" },
    { sourceId: "b", targetId: "c" },
    { sourceId: "c", targetId: "e" },
  ],
};

const GATEWAY: { elements: AiElement[]; connections: AiConnection[] } = {
  elements: [
    { id: "s", type: "start-event", label: "Start" },
    { id: "g", type: "gateway", label: "OK?" },
    { id: "a", type: "task", label: "Approve" },
    { id: "b", type: "task", label: "Reject" },
    { id: "m", type: "gateway", label: "" },
    { id: "e", type: "end-event", label: "End" },
  ],
  connections: [
    { sourceId: "s", targetId: "g" },
    { sourceId: "g", targetId: "a", label: "Yes" },
    { sourceId: "g", targetId: "b", label: "No" },
    { sourceId: "a", targetId: "m" },
    { sourceId: "b", targetId: "m" },
    { sourceId: "m", targetId: "e" },
  ],
};

describe("editor routing — characterisation", () => {
  it("baseline — fresh layouts route cleanly", () => {
    for (const sc of [LINEAR, GATEWAY]) {
      const data = build(sc.elements, sc.connections);
      const v = findRoutingViolations(data);
      expect(v, `\n  - ${v.join("\n  - ")}`).toEqual([]);
    }
  });

  it("re-route — moving a task DOWN keeps its connectors clean", () => {
    const data0 = build(LINEAR.elements, LINEAR.connections);
    const b = data0.elements.find((e) => e.id === "b")!;
    const data1 = move(data0, "b", b.x, b.y + 220);
    const v = findRoutingViolations(data1);
    expect(v, `\n  - ${v.join("\n  - ")}`).toEqual([]);
  });

  it("re-route — moving a task UP and back keeps its connectors clean", () => {
    const data0 = build(LINEAR.elements, LINEAR.connections);
    const c = data0.elements.find((e) => e.id === "c")!;
    const data1 = move(data0, "c", c.x, c.y - 180);
    const v = findRoutingViolations(data1);
    expect(v, `\n  - ${v.join("\n  - ")}`).toEqual([]);
  });

  it("obstacle — moving a branch task across the diagram re-routes around obstacles", () => {
    const data0 = build(GATEWAY.elements, GATEWAY.connections);
    // Drag "Approve" left, past the gateway, into the start column.
    const s = data0.elements.find((e) => e.id === "s")!;
    const data1 = move(data0, "a", s.x - 40, s.y + 140);
    const v = findRoutingViolations(data1);
    expect(v, `\n  - ${v.join("\n  - ")}`).toEqual([]);
  });
});
