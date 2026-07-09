/**
 * The Domain Diagram backbone from an OCEL object model: object types become
 * uml-class entities (with their attributes), object-to-object relationships
 * become associations, and each entity links to its discovered state machine.
 */
import { describe, it, expect } from "vitest";
import { parseOcelObjectCentric } from "@/app/lib/mining/formats/ocel";
import { buildDomainFromOcel } from "@/app/lib/mining/buildDomainFromOcel";

const OCEL2 = JSON.stringify({
  objectTypes: [
    { name: "order", attributes: [{ name: "status", type: "string" }] },
    { name: "item", attributes: [{ name: "status", type: "string" }] },
  ],
  eventTypes: [{ name: "place order", attributes: [] }, { name: "pick item", attributes: [] }],
  objects: [
    { id: "o1", type: "order", attributes: [{ name: "status", time: "2023-01-01T09:00:00Z", value: "placed" }], relationships: [{ objectId: "i1", qualifier: "comprises" }] },
    { id: "i1", type: "item", attributes: [{ name: "status", time: "2023-01-01T09:00:00Z", value: "ordered" }], relationships: [] },
  ],
  events: [
    { id: "e1", type: "place order", time: "2023-01-01T09:00:00Z", attributes: [], relationships: [{ objectId: "o1", qualifier: "order" }, { objectId: "i1", qualifier: "item" }] },
    { id: "e2", type: "pick item", time: "2023-01-01T10:00:00Z", attributes: [], relationships: [{ objectId: "i1", qualifier: "item" }] },
  ],
});

describe("buildDomainFromOcel (T0687)", () => {
  const oc = parseOcelObjectCentric(OCEL2);

  it("makes an entity per object type with its attributes, and an association per O2O", () => {
    const data = buildDomainFromOcel(oc);
    const classes = data.elements.filter((e) => e.type === "uml-class");
    expect(classes.map((c) => c.label).sort()).toEqual(["item", "order"]);
    // The order entity carries its status attribute.
    const order = classes.find((c) => c.label === "order")!;
    expect((order.properties.attributes as { name: string }[]).some((a) => a.name === "status")).toBe(true);
    // The comprises O2O → one association between order and item.
    const assoc = data.connectors.filter((c) => c.type === "uml-association");
    expect(assoc).toHaveLength(1);
    expect(assoc[0].label).toBe("comprises");
    const idOf = (label: string) => classes.find((c) => c.label === label)!.id;
    expect(assoc[0].sourceId).toBe(idOf("order"));
    expect(assoc[0].targetId).toBe(idOf("item"));
  });

  it("links each entity to its discovered state machine when ids are supplied", () => {
    const data = buildDomainFromOcel(oc, { linkedByType: { order: "sm-order", item: "sm-item" } });
    const order = data.elements.find((e) => e.label === "order")!;
    const item = data.elements.find((e) => e.label === "item")!;
    expect(order.properties.linkedDiagramId).toBe("sm-order");
    expect(item.properties.linkedDiagramId).toBe("sm-item");
  });
});
