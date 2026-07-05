/**
 * Change C — OCEL import/export. parseOcel projects a multi-object OCEL log onto a
 * chosen object type as the case; buildOcel emits single-object OCEL 2.0 that
 * re-parses back to the same variants.
 */
import { describe, it, expect } from "vitest";
import { parseOcel, ocelObjectTypes, buildOcel } from "@/app/lib/mining/formats/ocel";
import type { Variant } from "@/app/lib/mining/types";

const OCEL2 = JSON.stringify({
  objectTypes: [{ name: "Order" }, { name: "Invoice" }],
  eventTypes: [{ name: "Approve" }, { name: "Pay" }],
  objects: [
    { id: "o1", type: "Order" }, { id: "o2", type: "Order" }, { id: "i1", type: "Invoice" },
  ],
  events: [
    { id: "e1", type: "Approve", time: "2026-01-01T09:00:00Z", relationships: [{ objectId: "o1" }, { objectId: "i1" }], attributes: [{ name: "resource", value: "John" }] },
    { id: "e2", type: "Pay", time: "2026-01-01T10:00:00Z", relationships: [{ objectId: "o1" }] },
    { id: "e3", type: "Approve", time: "2026-01-02T09:00:00Z", relationships: [{ objectId: "o2" }] },
  ],
});

describe("OCEL interchange (Change C)", () => {
  it("T0645 — parseOcel projects on an object type as the case", () => {
    expect(ocelObjectTypes(OCEL2)).toEqual(["Order", "Invoice"]);   // Order most-referenced
    const { rows, headers, mapping, chosenType } = parseOcel(OCEL2);
    expect(chosenType).toBe("Order");
    expect(mapping.caseId).toBe("case");
    expect(mapping.resource).toBe("resource");
    const ci = headers.indexOf("case"), ai = headers.indexOf("activity");
    // o1: Approve + Pay ; o2: Approve  (Invoice ignored under the Order projection)
    expect(rows.map((r) => [r[ci], r[ai]])).toEqual([["o1", "Approve"], ["o1", "Pay"], ["o2", "Approve"]]);
  });

  it("T0646 — buildOcel emits single-object OCEL that re-parses to the same variants", () => {
    const variants: Variant[] = [{ states: ["Approved", "Paid"], events: ["Approve", "Pay"], count: 2 }];
    const json = buildOcel({ name: "Run", variants });
    const doc = JSON.parse(json);
    expect(doc.objectTypes).toEqual([{ name: "Case", attributes: [] }]);
    expect(doc.objects).toHaveLength(2);        // 2 cases
    expect(doc.events).toHaveLength(4);         // 2 cases × 2 events
    // re-parse on the "Case" type
    const { rows } = parseOcel(json, "Case");
    expect(rows).toHaveLength(4);
  });
});
