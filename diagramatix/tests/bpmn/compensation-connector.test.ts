/**
 * Interactive compensation wiring (app/hooks/useDiagram.ts ADD_CONNECTOR):
 * A connector drawn FROM an edge-mounted Intermediate Compensation event TO an
 * Activity (task / collapsed sub-process) is, per BPMN 2.0, an outgoing
 * Association (never a Sequence Flow) whose target IS the Compensation Activity.
 * So the reducer must coerce it to a directed associationBPMN AND stamp
 * isForCompensation onto the target activity (T2219).
 */
import { describe, it, expect } from "vitest";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import type { DiagramData, DiagramElement, ConnectorType } from "@/app/lib/diagram/types";

const el = (id: string, type: DiagramElement["type"], extra: Partial<DiagramElement> = {}): DiagramElement =>
  ({ id, type, x: 100, y: 100, width: 120, height: 80, label: id, properties: {}, ...extra });

const base = (elements: DiagramElement[]): DiagramData =>
  ({ elements, connectors: [], viewport: { x: 0, y: 0, zoom: 1 } });

const add = (sourceId: string, targetId: string, connectorType: ConnectorType): Action => ({
  type: "ADD_CONNECTOR",
  payload: {
    sourceId, targetId, connectorType,
    directionType: "non-directed", routingType: "direct",
    sourceSide: "right", targetSide: "left",
  },
});

// A sub-process host with an edge-mounted compensation catch event, plus a task.
const world = (): DiagramData => base([
  el("host", "subprocess-expanded"),
  el("comp", "intermediate-event", { eventType: "compensation", boundaryHostId: "host", x: 220, y: 160 }),
  el("handler", "task", { x: 400 }),
]);

describe("edge-mounted compensation event → activity", () => {
  it("coerces a drawn sequence flow to a directed Association", () => {
    const d = reducer(world(), add("comp", "handler", "sequence"));
    expect(d.connectors).toHaveLength(1);
    expect(d.connectors[0].type).toBe("associationBPMN");
    expect(d.connectors[0].directionType).toBe("open-directed");
    expect(d.connectors[0].routingType).toBe("rectilinear");
  });

  it("stamps the Compensation marker onto the target activity", () => {
    const d = reducer(world(), add("comp", "handler", "sequence"));
    const handler = d.elements.find((e) => e.id === "handler")!;
    expect(handler.properties?.isForCompensation).toBe(true);
  });

  it("does NOT stamp the marker when the source is a plain (non-compensation) event", () => {
    const world2 = base([
      el("host", "subprocess-expanded"),
      el("err", "intermediate-event", { eventType: "error", boundaryHostId: "host", x: 220, y: 160 }),
      el("handler", "task", { x: 400 }),
    ]);
    const d = reducer(world2, add("err", "handler", "sequence"));
    const handler = d.elements.find((e) => e.id === "handler")!;
    expect(handler.properties?.isForCompensation).toBeUndefined();
    // an error boundary event → handler is a normal sequence flow
    expect(d.connectors[0]?.type).toBe("sequence");
  });
});

describe("deleting the compensation association un-marks the target (T2221)", () => {
  it("clears isForCompensation when its association is deleted", () => {
    const drawn = reducer(world(), add("comp", "handler", "sequence"));
    expect(drawn.elements.find((e) => e.id === "handler")!.properties?.isForCompensation).toBe(true);
    const connId = drawn.connectors[0].id;
    const deleted = reducer(drawn, { type: "DELETE_CONNECTOR", payload: { id: connId } } as Action);
    const handler = deleted.elements.find((e) => e.id === "handler")!;
    expect(handler.properties?.isForCompensation).toBeUndefined();
    expect(deleted.connectors).toHaveLength(0);
  });
});

describe("a Compensation Activity has no sequence flow (T2221)", () => {
  const world2 = () => base([
    el("host", "subprocess-expanded"),
    el("comp", "intermediate-event", { eventType: "compensation", boundaryHostId: "host", x: 220, y: 160 }),
    el("handler", "task", { x: 400, properties: { isForCompensation: true } }),
    el("next", "task", { x: 600 }),
  ]);
  it("rejects a sequence FROM the compensation activity", () => {
    const d = reducer(world2(), add("handler", "next", "sequence"));
    expect(d.connectors).toHaveLength(0);
  });
  it("rejects a sequence TO the compensation activity", () => {
    const d = reducer(world2(), add("next", "handler", "sequence"));
    expect(d.connectors).toHaveLength(0);
  });
});

describe("compensation intermediate event defaults to Throwing (T2221)", () => {
  it("sets flowType throwing when eventType is set to compensation on an inline intermediate", () => {
    const start = base([el("ie", "intermediate-event", { x: 100 })]);
    const d = reducer(start, { type: "UPDATE_PROPERTIES", payload: { id: "ie", properties: { eventType: "compensation" } } } as Action);
    expect(d.elements[0].flowType).toBe("throwing");
  });
  it("does NOT force throwing on a boundary-mounted (catch) compensation event", () => {
    const start = base([el("ie", "intermediate-event", { x: 100, boundaryHostId: "host" })]);
    const d = reducer(start, { type: "UPDATE_PROPERTIES", payload: { id: "ie", properties: { eventType: "compensation" } } } as Action);
    expect(d.elements[0].flowType).toBeUndefined();
  });
});
