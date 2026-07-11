/**
 * Edge-mounted event detach repositioning (T0714). Unchecking "Edge-mounted"
 * (SET_EVENT_BOUNDARY hostId=null) repositions the event by kind + host:
 *   • Start / End on an Expanded Subprocess → move INSIDE the EP + re-parent to it.
 *   • Intermediate (or any event on a plain Activity) → move OUTSIDE the host,
 *     into the host's own container.
 */
import { describe, it, expect } from "vitest";
import { reducer } from "@/app/hooks/useDiagram";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const EP = { id: "ep", type: "subprocess-expanded", x: 100, y: 100, width: 200, height: 150, label: "EP", properties: {} };

const base = (evt: DiagramElement): DiagramData => ({
  elements: [EP as DiagramElement, evt],
  connectors: [],
  viewport: { x: 0, y: 0, zoom: 1 },
});

const centre = (e: DiagramElement) => ({ x: e.x + e.width / 2, y: e.y + e.height / 2 });
const insideEP = (e: DiagramElement) => {
  const c = centre(e);
  return c.x > EP.x && c.x < EP.x + EP.width && c.y > EP.y && c.y < EP.y + EP.height;
};

describe("detach edge-mounted event (T0714)", () => {
  it("moves a START event INSIDE its EP and re-parents it to the EP", () => {
    // Start event mounted on the EP's top edge (centre on the boundary).
    const start: DiagramElement = { id: "s", type: "start-event", x: 182, y: 82, width: 36, height: 36, label: "S", properties: {}, boundaryHostId: "ep" };
    const d = reducer(base(start), { type: "SET_EVENT_BOUNDARY", payload: { id: "s", hostId: null } });
    const s = d.elements.find((e) => e.id === "s")!;
    expect(s.boundaryHostId).toBeUndefined();
    expect(s.parentId).toBe("ep");        // became an internal element of the EP
    expect(insideEP(s)).toBe(true);        // sits inside the EP body
  });

  it("moves an INTERMEDIATE event OUTSIDE its EP, into the EP's container", () => {
    // Intermediate event mounted on the EP's right edge.
    const mid: DiagramElement = { id: "m", type: "intermediate-event", x: 282, y: 157, width: 36, height: 36, label: "M", properties: {}, boundaryHostId: "ep" };
    const d = reducer(base(mid), { type: "SET_EVENT_BOUNDARY", payload: { id: "m", hostId: null } });
    const m = d.elements.find((e) => e.id === "m")!;
    expect(m.boundaryHostId).toBeUndefined();
    expect(m.parentId).not.toBe("ep");     // NOT parented to the EP
    expect(insideEP(m)).toBe(false);       // sits outside the EP body
  });

  it("attaches a free intermediate event onto a host boundary (Edge-mounted checked)", () => {
    // Event far from the EP; SET_EVENT_BOUNDARY(hostId) snaps it onto the edge.
    const mid: DiagramElement = { id: "m", type: "intermediate-event", x: 500, y: 500, width: 36, height: 36, label: "M", properties: {} };
    const d = reducer(base(mid), { type: "SET_EVENT_BOUNDARY", payload: { id: "m", hostId: "ep" } });
    const m = d.elements.find((e) => e.id === "m")!;
    expect(m.boundaryHostId).toBe("ep");
    // Centre snapped onto the EP boundary (on one of its four edges).
    const c = centre(m);
    const onEdge = Math.abs(c.x - EP.x) < 2 || Math.abs(c.x - (EP.x + EP.width)) < 2
      || Math.abs(c.y - EP.y) < 2 || Math.abs(c.y - (EP.y + EP.height)) < 2;
    expect(onEdge).toBe(true);
  });
});
