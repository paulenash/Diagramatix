/**
 * OCEL 2.0 object-centric parse: instead of flattening onto one object type,
 * project EVERY object type to its own normalised table (state derived from a
 * time-varying status attribute), and extract the object-to-object relationships
 * that become the Domain Diagram. Verified against a spec-shaped OCEL 2.0 log.
 */
import { describe, it, expect } from "vitest";
import { parseOcelObjectCentric } from "@/app/lib/mining/formats/ocel";
import { buildEventLog } from "@/app/lib/mining/parseEventLog";
import type { LogMapping } from "@/app/lib/mining/types";

// A minimal OCEL 2.0 JSON: an Order comprising an Item, each with a time-varying
// `status` attribute; events carry E2O relationships and the Order carries an O2O.
const OCEL2 = JSON.stringify({
  objectTypes: [
    { name: "order", attributes: [{ name: "status", type: "string" }] },
    { name: "item", attributes: [{ name: "status", type: "string" }] },
  ],
  eventTypes: [
    { name: "place order", attributes: [] },
    { name: "pick item", attributes: [] },
    { name: "ship order", attributes: [] },
  ],
  objects: [
    {
      id: "o1", type: "order",
      attributes: [
        { name: "status", time: "2023-01-01T09:00:00Z", value: "placed" },
        { name: "status", time: "2023-01-01T11:00:00Z", value: "shipped" },
      ],
      relationships: [{ objectId: "i1", qualifier: "comprises" }],
    },
    {
      id: "i1", type: "item",
      attributes: [
        { name: "status", time: "2023-01-01T09:00:00Z", value: "ordered" },
        { name: "status", time: "2023-01-01T10:00:00Z", value: "picked" },
      ],
      relationships: [],
    },
  ],
  events: [
    { id: "e1", type: "place order", time: "2023-01-01T09:00:00Z", attributes: [{ name: "resource", value: "alice" }], relationships: [{ objectId: "o1", qualifier: "order" }, { objectId: "i1", qualifier: "item" }] },
    { id: "e2", type: "pick item", time: "2023-01-01T10:00:00Z", attributes: [], relationships: [{ objectId: "i1", qualifier: "item" }] },
    { id: "e3", type: "ship order", time: "2023-01-01T11:00:00Z", attributes: [], relationships: [{ objectId: "o1", qualifier: "order" }] },
  ],
});

describe("OCEL 2.0 object-centric parse (T0686)", () => {
  const oc = parseOcelObjectCentric(OCEL2);

  it("projects every object type, not just the most-referenced one", () => {
    expect(oc.objectTypes).toEqual(expect.arrayContaining(["order", "item"]));
    expect(Object.keys(oc.perType).sort()).toEqual(["item", "order"]);
    expect(oc.perType.order.cases).toBe(1);
    expect(oc.perType.item.cases).toBe(1);
  });

  it("derives each object's state from its status attribute effective at event time", () => {
    const order = oc.perType.order;
    expect(order.stateAttr).toBe("status");
    expect(order.mapping.state).toBe("state");
    // Order's events (place order @09:00, ship order @11:00) → states placed, shipped.
    const log = buildEventLog(order.headers, order.rows, order.mapping as LogMapping);
    expect(log.variants).toHaveLength(1);
    expect(log.variants[0].states).toEqual(["placed", "shipped"]);   // effective-at-time, not last-value
    expect(log.variants[0].events).toEqual(["place order", "ship order"]);

    const item = buildEventLog(oc.perType.item.headers, oc.perType.item.rows, oc.perType.item.mapping as LogMapping);
    expect(item.variants[0].states).toEqual(["ordered", "picked"]);
  });

  it("extracts object-to-object relationships (the Domain Diagram edges)", () => {
    expect(oc.o2o).toEqual([{ fromType: "order", toType: "item", qualifier: "comprises", count: 1 }]);
  });

  it("returns empty structures for invalid JSON", () => {
    const bad = parseOcelObjectCentric("not json");
    expect(bad.objectTypes).toEqual([]);
    expect(bad.o2o).toEqual([]);
  });
});
