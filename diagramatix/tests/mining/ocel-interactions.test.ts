/**
 * OCEL interaction-weighting layer: events touching ≥2 object types are
 * synchronisation points between their lifecycles. These weight the Domain
 * Diagram associations (count → multiplicity + line thickness), add DASHED
 * behavioural edges where two types share events but declare no O2O, and tag the
 * per-type state machines with "⇄ also touches X" transition notes.
 */
import { describe, it, expect } from "vitest";
import { parseOcelObjectCentric } from "@/app/lib/mining/formats/ocel";
import { buildDomainFromOcel } from "@/app/lib/mining/buildDomainFromOcel";
import { buildOcelStudy } from "@/app/lib/mining/ocelStudy";

// Order comprises Item (structural O2O). A Customer shares the "place order"
// event with both but declares NO relationship → behavioural interactions only.
const OCEL2 = JSON.stringify({
  objectTypes: [
    { name: "order", attributes: [{ name: "status", type: "string" }] },
    { name: "item", attributes: [{ name: "status", type: "string" }] },
    { name: "customer", attributes: [{ name: "name", type: "string" }] },
  ],
  eventTypes: [{ name: "place order" }, { name: "pick item" }, { name: "ship order" }],
  objects: [
    { id: "o1", type: "order", attributes: [{ name: "status", time: "2023-01-01T09:00:00Z", value: "placed" }, { name: "status", time: "2023-01-01T11:00:00Z", value: "shipped" }], relationships: [{ objectId: "i1", qualifier: "comprises" }] },
    { id: "i1", type: "item", attributes: [{ name: "status", time: "2023-01-01T09:00:00Z", value: "ordered" }], relationships: [] },
    { id: "c1", type: "customer", attributes: [{ name: "name", time: "2023-01-01T09:00:00Z", value: "Acme" }], relationships: [] },
  ],
  events: [
    { id: "e1", type: "place order", time: "2023-01-01T09:00:00Z", attributes: [], relationships: [{ objectId: "o1" }, { objectId: "i1" }, { objectId: "c1" }] },
    { id: "e2", type: "pick item", time: "2023-01-01T10:00:00Z", attributes: [], relationships: [{ objectId: "i1" }] },
    { id: "e3", type: "ship order", time: "2023-01-01T11:00:00Z", attributes: [], relationships: [{ objectId: "o1" }] },
  ],
});

describe("OCEL interaction weighting (T0689)", () => {
  const oc = parseOcelObjectCentric(OCEL2);

  it("counts shared-event interactions per type pair + the binding activity", () => {
    const pair = (a: string, b: string) => oc.interactions.find((i) => i.typeA === a && i.typeB === b || i.typeA === b && i.typeB === a);
    // place order touched all three → three pairs, each count 1, bound by "place order".
    expect(pair("order", "item")!.count).toBe(1);
    expect(pair("customer", "order")!.topActivity).toBe("place order");
    expect(oc.activityTypes["place order"].sort()).toEqual(["customer", "item", "order"]);
  });

  it("weights structural O2O and adds DASHED behavioural edges for shared-event-only pairs", () => {
    const data = buildDomainFromOcel(oc);
    const assoc = data.connectors.filter((c) => c.type === "uml-association");
    // 1 structural (order comprises item) + 2 behavioural (customer↔order, customer↔item).
    expect(assoc).toHaveLength(3);
    const structural = assoc.filter((c) => !c.dashed);
    const behavioural = assoc.filter((c) => c.dashed);
    expect(structural).toHaveLength(1);
    expect(behavioural).toHaveLength(2);
    // The structural association is weighted: count as multiplicity + a thickness.
    expect(structural[0].targetMultiplicity).toBe("1");
    expect(typeof structural[0].weight).toBe("number");
  });

  it("tags a state-machine transition with the other types its activity touches", () => {
    const plan = buildOcelStudy(OCEL2, { selectedTypes: ["order"] });
    const order = plan.types.find((t) => t.objectType === "order")!;
    // The "place order" transition (init → placed) also touches item + customer.
    const placeOrder = order.smData.connectors.find((c) => (c.transitionEvent ?? c.label) === "place order")!;
    expect(placeOrder.transitionTouches?.sort()).toEqual(["customer", "item"]);
  });
});
