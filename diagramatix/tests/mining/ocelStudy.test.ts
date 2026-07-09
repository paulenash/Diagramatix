/**
 * The OCEL study orchestrator: one mined lifecycle (variants + discovered state
 * machine) per object type, reusing the single-entity pipeline, with the object
 * model kept for the Domain Diagram. End-to-end over a spec-shaped OCEL 2.0 log.
 */
import { describe, it, expect } from "vitest";
import { buildOcelStudy } from "@/app/lib/mining/ocelStudy";
import { buildDomainFromOcel } from "@/app/lib/mining/buildDomainFromOcel";

const OCEL2 = JSON.stringify({
  objectTypes: [
    { name: "order", attributes: [{ name: "status", type: "string" }] },
    { name: "item", attributes: [{ name: "status", type: "string" }] },
  ],
  eventTypes: [{ name: "place order", attributes: [] }, { name: "pick item", attributes: [] }, { name: "ship order", attributes: [] }],
  objects: [
    { id: "o1", type: "order", attributes: [
      { name: "status", time: "2023-01-01T09:00:00Z", value: "placed" },
      { name: "status", time: "2023-01-01T11:00:00Z", value: "shipped" }], relationships: [{ objectId: "i1", qualifier: "comprises" }] },
    { id: "i1", type: "item", attributes: [
      { name: "status", time: "2023-01-01T09:00:00Z", value: "ordered" },
      { name: "status", time: "2023-01-01T10:00:00Z", value: "picked" }], relationships: [] },
  ],
  events: [
    { id: "e1", type: "place order", time: "2023-01-01T09:00:00Z", attributes: [{ name: "resource", value: "alice" }], relationships: [{ objectId: "o1", qualifier: "order" }, { objectId: "i1", qualifier: "item" }] },
    { id: "e2", type: "pick item", time: "2023-01-01T10:00:00Z", attributes: [], relationships: [{ objectId: "i1", qualifier: "item" }] },
    { id: "e3", type: "ship order", time: "2023-01-01T11:00:00Z", attributes: [], relationships: [{ objectId: "o1", qualifier: "order" }] },
  ],
});

describe("buildOcelStudy (T0688)", () => {
  it("mines one lifecycle (variants + discovered SM) per object type", () => {
    const plan = buildOcelStudy(OCEL2);
    expect(plan.types.map((t) => t.objectType).sort()).toEqual(["item", "order"]);
    const order = plan.types.find((t) => t.objectType === "order")!;
    expect(order.stateAttr).toBe("status");
    expect(order.log.variants[0].states).toEqual(["placed", "shipped"]);       // status-derived lifecycle
    // A discovered state machine with state nodes + transitions was produced.
    expect(order.smData.elements.some((e) => e.type === "state")).toBe(true);
    expect(order.smData.connectors.length).toBeGreaterThan(0);
    // Frequency badges carried through (transitionCount on connectors).
    expect(order.smData.connectors.every((c) => typeof c.transitionCount === "number")).toBe(true);
  });

  it("only mines the selected types, and the domain ties them together with SM links", () => {
    const plan = buildOcelStudy(OCEL2, { selectedTypes: ["order"] });
    expect(plan.types.map((t) => t.objectType)).toEqual(["order"]);
    // The domain still knows both types (from the parse) — build it with a link for order.
    const domain = buildDomainFromOcel(plan.oc, { linkedByType: { order: "sm-order" } });
    const order = domain.elements.find((e) => e.label === "order")!;
    expect(order.properties.linkedDiagramId).toBe("sm-order");
    expect(domain.connectors.filter((c) => c.type === "uml-association")).toHaveLength(1);
  });
});
