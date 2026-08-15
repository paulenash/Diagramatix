/**
 * ENG-09 — SWAP_LANES_VERTICAL must preserve the connectors array ORDER.
 * The reducer used to concatenate the rerouted subset in front of the
 * untouched connectors, silently changing draw order (z-order) after a swap.
 */
import { describe, it, expect } from "vitest";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import type { DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";

const el = (id: string, type: string, x: number, y: number, w: number, h: number, parentId?: string): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label: id, properties: {}, ...(parentId ? { parentId } : {}) } as DiagramElement);

const conn = (id: string, sourceId: string, targetId: string): Connector =>
  ({
    id, sourceId, targetId, type: "sequence",
    sourceSide: "bottom", targetSide: "top",
    directionType: "directed", routingType: "rectilinear",
    sourceInvisibleLeader: false, targetInvisibleLeader: false,
    waypoints: [{ x: 100, y: 70 }, { x: 100, y: 130 }],
  } as unknown as Connector);

function diagram(): DiagramData {
  return {
    elements: [
      el("pool", "pool", 0, 0, 400, 200),
      el("lane1", "lane", 0, 0, 400, 100, "pool"),
      el("lane2", "lane", 0, 100, 400, 100, "pool"),
      el("t1", "task", 40, 30, 120, 40, "lane1"),
      el("t2", "task", 40, 130, 120, 40, "lane2"),
    ],
    connectors: [conn("c1", "t1", "t2"), conn("c2", "t2", "t1"), conn("c3", "t1", "t2")],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

describe("SWAP_LANES_VERTICAL — connector draw order (ENG-09)", () => {
  it("keeps the connectors array in its original order after a swap", () => {
    const before = diagram();
    const act: Action = { type: "SWAP_LANES_VERTICAL", payload: { laneId: "lane2", direction: "up" } };
    const after = reducer(before, act);
    // The swap must have happened (lanes moved) but the connector ORDER holds.
    expect(after.connectors.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
  });
});
