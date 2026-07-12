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

/**
 * Drop an EXISTING Activity onto a connector to INSERT it into the flow, with
 * PARALLEL halves (T0725). An existing task dropped so it overlaps A→B divides
 * the connector into A→task and task→B; the task is SNAPPED onto the connector
 * line so the incoming and outgoing halves run in the same direction (left in /
 * right out) instead of doglegging around an element dropped slightly off-line.
 */
describe("insert an existing activity onto a connector, halves parallel (T0725)", () => {
  it("snaps the dropped task onto the line so A→F and F→B are parallel", () => {
    const d0 = {
      elements: [
        { id: "a", type: "task", x: 100, y: 200, width: 100, height: 60, label: "A", properties: {} },
        { id: "b", type: "task", x: 500, y: 200, width: 100, height: 60, label: "B", properties: {} },
        // Dropped OVERLAPPING the A→B line (y 230) but with its centre BELOW it
        // (centre y 245) — the split must pull it back onto the line.
        { id: "f", type: "task", x: 300, y: 215, width: 100, height: 60, label: "F", properties: {} },
      ],
      connectors: [{
        id: "ab", type: "sequence", sourceId: "a", targetId: "b", sourceSide: "right", targetSide: "left",
        directionType: "directed", routingType: "rectilinear",
        waypoints: [{ x: 150, y: 230 }, { x: 200, y: 230 }, { x: 500, y: 230 }, { x: 550, y: 230 }],
      }],
    } as unknown as DiagramData;

    const d = reducer(d0, { type: "MOVE_END", payload: { id: "f" } });

    // Original connector gone; two new halves bridge A→F→B.
    expect(d.connectors.some((c) => c.id === "ab")).toBe(false);
    const af = d.connectors.find((c) => c.sourceId === "a" && c.targetId === "f");
    const fb = d.connectors.find((c) => c.sourceId === "f" && c.targetId === "b");
    expect(af).toBeTruthy();
    expect(fb).toBeTruthy();

    // Parallel halves: F's incoming side faces A (left), outgoing faces B (right)
    // — opposite sides ⇒ the two straight segments are collinear/parallel.
    expect(af!.targetSide).toBe("left");
    expect(fb!.sourceSide).toBe("right");
    expect(af!.targetSide).toBe(({ left: "right", right: "left", top: "bottom", bottom: "top" } as const)[fb!.sourceSide]);

    // F was snapped onto the connector line (centre y pulled from 245 back to 230).
    const f = d.elements.find((e) => e.id === "f")!;
    expect(f.y + f.height / 2).toBeCloseTo(230, 5);
  });

  it("still splits when obstacle avoidance has bent the live connector AROUND the element (T0726)", () => {
    // While dragging a task onto a connector the router (tasks are obstacles)
    // bends that connector AROUND the task, so by drop time its LIVE waypoints
    // detour above the element and no longer overlap it. The split must detect
    // the connector against its obstacle-FREE route (straight A→B), not the
    // bent live path.
    const d0 = {
      elements: [
        { id: "a", type: "task", x: 100, y: 200, width: 100, height: 60, label: "A", properties: {} },
        { id: "b", type: "task", x: 500, y: 200, width: 100, height: 60, label: "B", properties: {} },
        // F is centred on the straight A→B line (y 230) at x 300–400.
        { id: "f", type: "task", x: 300, y: 200, width: 100, height: 60, label: "F", properties: {} },
      ],
      connectors: [{
        id: "ab", type: "sequence", sourceId: "a", targetId: "b", sourceSide: "right", targetSide: "left",
        directionType: "directed", routingType: "rectilinear",
        // Detour ABOVE F (y 150) — does NOT intersect F's box (y 200–260), so a
        // naive live-waypoint test would find no overlap and skip the split.
        waypoints: [
          { x: 150, y: 230 }, { x: 200, y: 230 }, { x: 250, y: 230 }, { x: 250, y: 150 },
          { x: 450, y: 150 }, { x: 450, y: 230 }, { x: 500, y: 230 }, { x: 550, y: 230 },
        ],
      }],
    } as unknown as DiagramData;

    const d = reducer(d0, { type: "MOVE_END", payload: { id: "f" } });

    // The bent connector is gone; A→F and F→B bridge the flow through F.
    expect(d.connectors.some((c) => c.id === "ab")).toBe(false);
    expect(d.connectors.some((c) => c.sourceId === "a" && c.targetId === "f")).toBe(true);
    expect(d.connectors.some((c) => c.sourceId === "f" && c.targetId === "b")).toBe(true);
  });

  it("splits even when the bent connector has >=9 waypoints (router preserves those interiors) (T0728)", () => {
    // THE real-world failure. A longer / cross-lane connector that obstacle
    // avoidance bent around the task can have >=9 waypoints. recomputeAllConnectors
    // treats a >=9-waypoint rectilinear route as a hand-customised route and
    // PRESERVES its interior — so recomputing "as if the task weren't there" does
    // NOT straighten it, and a detection that leans on that recompute never finds
    // the task (this is exactly what users saw: "obstacle avoidance prevents it").
    // Detection instead computes a FRESH obstacle-free route per candidate, which
    // ignores the preservation rule, so the split fires.
    const d0 = {
      elements: [
        { id: "a", type: "task", x: 100, y: 200, width: 100, height: 60, label: "A", properties: {} },
        { id: "b", type: "task", x: 600, y: 200, width: 100, height: 60, label: "B", properties: {} },
        // F sits ON the straight A→B line (y 230); the live route detours around it.
        { id: "f", type: "task", x: 350, y: 200, width: 100, height: 60, label: "F", properties: {} },
      ],
      connectors: [{
        id: "ab", type: "sequence", sourceId: "a", targetId: "b", sourceSide: "right", targetSide: "left",
        directionType: "directed", routingType: "rectilinear",
        // 9-waypoint route detouring BELOW F — does not overlap F, and because
        // N>=9 the router would preserve this exact interior on recompute.
        waypoints: [
          { x: 150, y: 230 }, { x: 200, y: 230 }, { x: 300, y: 230 }, { x: 300, y: 300 },
          { x: 500, y: 300 }, { x: 500, y: 230 }, { x: 560, y: 230 }, { x: 600, y: 230 }, { x: 650, y: 230 },
        ],
      }],
    } as unknown as DiagramData;

    const d = reducer(d0, { type: "MOVE_END", payload: { id: "f" } });

    expect(d.connectors.some((c) => c.id === "ab")).toBe(false);
    expect(d.connectors.some((c) => c.sourceId === "a" && c.targetId === "f")).toBe(true);
    expect(d.connectors.some((c) => c.sourceId === "f" && c.targetId === "b")).toBe(true);
  });
});
