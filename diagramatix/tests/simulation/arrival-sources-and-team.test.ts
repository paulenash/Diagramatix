import { describe, it, expect } from "vitest";
import { arrivalSourcesOf, isArrivalSource } from "@/app/lib/simulation/arrivalSources";
import { autofillSimulation } from "@/app/lib/simulation/autofill";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import { getSimParams } from "@/app/lib/diagram/simParams";
import type { DiagramData } from "@/app/lib/diagram/types";

/**
 * T2851 — a start event INSIDE an expanded subprocess is not an arrival source
 * (the assembler makes it a pass-through delay), so Fill missing must not give
 * it an arrival rate and the panel must not list it.
 *
 * T2852 — an AUTO-FILLED team follows its element when the element is re-homed
 * to another lane (e.g. its own lane was deleted), while a hand-set team is
 * left alone.
 */
const epDiagram: DiagramData = {
  viewport: { x: 0, y: 0, zoom: 1 },
  elements: [
    { id: "P", type: "pool", x: 0, y: 0, width: 900, height: 400, label: "Co", properties: {} },
    { id: "L", type: "lane", parentId: "P", x: 40, y: 0, width: 860, height: 400, label: "Sales", properties: {} },
    { id: "realStart", type: "start-event", parentId: "L", x: 60, y: 40, width: 40, height: 40, label: "Message arrives", properties: {} },
    { id: "ep", type: "subprocess-expanded", parentId: "L", x: 200, y: 20, width: 400, height: 200, label: "Repeat", properties: {} },
    // Unlabelled by design (T2844) — and NOT an arrival: the EP body is entered
    // by a token that already exists.
    { id: "epStart", type: "start-event", parentId: "ep", x: 230, y: 60, width: 40, height: 40, label: "", properties: {} },
    { id: "epTask", type: "task", parentId: "ep", x: 320, y: 55, width: 90, height: 50, label: "Read", properties: {} },
  ],
  connectors: [],
} as unknown as DiagramData;

describe("arrival sources", () => {
  it("excludes a start event inside an expanded subprocess", () => {
    const ids = arrivalSourcesOf(epDiagram).map((e) => e.id);
    expect(ids).toEqual(["realStart"]);
  });

  it("excludes boundary events", () => {
    const byId = new Map(epDiagram.elements.map((e) => [e.id, e]));
    const boundary = { id: "b", type: "start-event", boundaryHostId: "epTask", x: 0, y: 0, width: 40, height: 40, label: "", properties: {} } as never;
    expect(isArrivalSource(boundary, byId)).toBe(false);
  });

  it("Fill missing gives no arrival rate to an EP-internal start event", () => {
    const { data } = autofillSimulation(epDiagram);
    expect(getSimParams(data.elements.find((e) => e.id === "epStart")!).arrival).toBeUndefined();
    expect(getSimParams(data.elements.find((e) => e.id === "realStart")!).arrival).toBeDefined();
  });
});

describe("stale team after a lane is deleted", () => {
  // Two lanes; the task lives in "Exception Team" with an AUTO-filled team.
  const twoLanes = (autofilled: boolean): DiagramData => ({
    viewport: { x: 0, y: 0, zoom: 1 },
    elements: [
      { id: "P", type: "pool", x: 0, y: 0, width: 600, height: 200, label: "Co", properties: {} },
      { id: "sales", type: "lane", parentId: "P", x: 40, y: 0, width: 560, height: 100, label: "Sales Team", properties: {} },
      { id: "exc", type: "lane", parentId: "P", x: 40, y: 100, width: 560, height: 100, label: "Exception Team", properties: {} },
      { id: "t", type: "task", parentId: "exc", x: 200, y: 125, width: 90, height: 50, label: "Handle Error",
        properties: { sim: { teamId: "Exception Team", ...(autofilled ? { autofilled: ["teamId"] } : {}) } } },
    ],
    connectors: [],
  } as unknown as DiagramData);

  const del = (d: DiagramData, id: string) => reducer(d, { type: "DELETE_ELEMENT", payload: { id } } as Action);

  it("an auto-filled team follows the task into the surviving lane", () => {
    const after = del(twoLanes(true), "exc");
    const t = after.elements.find((e) => e.id === "t")!;
    expect(t.parentId, "re-homed into the surviving lane").toBe("sales");
    expect(getSimParams(t).teamId, "auto team re-derived from the new lane").toBe("Sales Team");
  });

  it("a hand-set team is NOT rewritten — assigning across lanes is legitimate", () => {
    const after = del(twoLanes(false), "exc");
    const t = after.elements.find((e) => e.id === "t")!;
    expect(t.parentId).toBe("sales");
    expect(getSimParams(t).teamId, "manual team preserved").toBe("Exception Team");
  });
});
