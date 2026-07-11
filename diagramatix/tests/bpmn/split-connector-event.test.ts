/**
 * Split a sequence connector by dropping an INTERMEDIATE EVENT on it (T0705).
 * Same operation as dropping a Task/Gateway on a connector — the connector is
 * replaced by source→event and event→target, and the event carries the chosen
 * trigger type. Pins that the reducer supports intermediate-event splits.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { reducer } from "@/app/hooks/useDiagram";
import { recomputeAllConnectors } from "@/app/lib/diagram/routing";
import type { DiagramData } from "@/app/lib/diagram/types";

const LINEAR = {
  elements: [
    { id: "s", type: "start-event", label: "S" },
    { id: "a", type: "task", label: "A" },
    { id: "b", type: "task", label: "B" },
    { id: "e", type: "end-event", label: "E" },
  ] as AiElement[],
  connections: [
    { sourceId: "s", targetId: "a" }, { sourceId: "a", targetId: "b" }, { sourceId: "b", targetId: "e" },
  ] as AiConnection[],
};

describe("split a sequence connector with an intermediate event (T0705)", () => {
  it("replaces A→B with A→event and event→B, carrying the trigger type", () => {
    const d0 = layoutBpmnDiagram(LINEAR.elements, LINEAR.connections);
    const conn = d0.connectors.find((c) => c.sourceId === "a" && c.targetId === "b")!;
    expect(conn.type).toBe("sequence");
    const mid = conn.waypoints[Math.floor(conn.waypoints.length / 2)];

    const d = reducer(d0, {
      type: "SPLIT_CONNECTOR",
      payload: { symbolType: "intermediate-event", position: { x: mid.x, y: mid.y }, connectorId: conn.id, eventType: "message" },
    });

    // A new intermediate event was created, carrying the chosen trigger type.
    const events = d.elements.filter((el) => el.type === "intermediate-event");
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("message");
    const evId = events[0].id;

    // The original connector is gone; two new ones bridge A→event→B.
    expect(d.connectors.some((c) => c.id === conn.id)).toBe(false);
    expect(d.connectors.some((c) => c.sourceId === "a" && c.targetId === evId)).toBe(true);
    expect(d.connectors.some((c) => c.sourceId === evId && c.targetId === "b")).toBe(true);
    // Net connector count unchanged (one removed, two added, but A→B replaced).
    expect(d.connectors.length).toBe(d0.connectors.length + 1);
  });
});

/**
 * Intermediate events are NOT sequence-flow routing obstacles (T0706). Like a
 * gateway, an event sits ON the flow (e.g. after splitting a connector), so a
 * sequence flow must pass straight through / attach to it, never detour around.
 */
describe("intermediate events don't force sequence flows to detour (T0706)", () => {
  const mid = (t: string): DiagramData => ({
    elements: [
      { id: "c", type: "task", x: 100, y: 200, width: 100, height: 60, label: "C", properties: {} },
      { id: "d", type: "task", x: 500, y: 200, width: 100, height: 60, label: "D", properties: {} },
      { id: "m", type: t, x: 280, y: 210, width: 40, height: 40, label: "M", properties: {} },
    ],
    connectors: [{
      id: "cd", type: "sequence", sourceId: "c", targetId: "d", sourceSide: "right", targetSide: "left",
      directionType: "directed", routingType: "rectilinear",
      waypoints: [{ x: 150, y: 230 }, { x: 200, y: 230 }, { x: 500, y: 230 }, { x: 550, y: 230 }],
    }],
  } as unknown as DiagramData);

  const bows = (d: DiagramData) =>
    recomputeAllConnectors(d.connectors, d.elements)[0].waypoints.some((p) => Math.abs(p.y - 230) > 2);

  it("a flow passing an unconnected intermediate event stays straight (like a gateway)", () => {
    expect(bows(mid("intermediate-event")), "flow should not detour around an intermediate event").toBe(false);
    expect(bows(mid("gateway")), "gateway control — also straight").toBe(false);
  });

  it("a flow still detours around a task in its path (obstacle behaviour preserved)", () => {
    expect(bows(mid("task")), "tasks remain obstacles").toBe(true);
  });
});
