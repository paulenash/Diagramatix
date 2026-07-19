/**
 * "Highlight Entity List Changes" matching — computeEntityDrift flags exactly the
 * elements whose name is absent from the mapped list of the adopted structure.
 */
import { describe, it, expect } from "vitest";
import { computeEntityDrift } from "@/app/lib/entityLists/entityDrift";
import type { ProjectEntityStructure } from "@/app/lib/entityLists/types";
import type { DiagramElement } from "@/app/lib/diagram/types";

const sug = (name: string) => ({ id: name, name, level: "Participant" as const, parentId: null, depth: 0 });
const structure: ProjectEntityStructure = {
  orgStructure: [sug("Acme"), sug("Finance")],
  participants: [sug("Customer")],
  systems: [sug("SAP")],
  documents: [sug("SOP")],
  dataStores: [sug("Ledger")],
  listIds: {},
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const el = (id: string, type: string, label: string, properties?: any): DiagramElement =>
  ({ id, type, label, x: 0, y: 0, width: 10, height: 10, ...(properties ? { properties } : {}) } as DiagramElement);

describe("entity drift", () => {
  it("T0909 — flags only names absent from the mapped list", () => {
    const elements = [
      el("l1", "lane", "Finance"),                                   // in org → ok
      el("l2", "lane", "Marketing"),                                 // NOT in org → drift
      el("p1", "pool", "Customer", { poolType: "black-box" }),        // participant → ok
      el("p2", "pool", "Vendor", { poolType: "black-box" }),          // NOT participant → drift
      el("p3", "pool", "SAP", { poolType: "black-box", isSystem: true }), // system → ok
      el("p4", "pool", "Acme", { poolType: "white-box" }),            // org → ok
      el("d1", "data-object", "SOP"),                                 // document → ok
      el("d2", "data-object", "Invoice"),                             // NOT document → drift
      el("s1", "data-store", "Ledger"),                               // data store → ok
      el("s2", "data-store", "Cache"),                                // NOT data store → drift
      el("t1", "task", "Do the thing"),                               // not checked → never drift
      el("l3", "lane", "   "),                                        // blank → skipped
    ];
    const drift = computeEntityDrift(elements, structure);
    expect([...drift.keys()].sort()).toEqual(["d2", "l2", "p2", "s2"]);
  });

  it("matching is case-insensitive + trimmed", () => {
    const drift = computeEntityDrift([el("x", "lane", "  finance  ")], structure);
    expect(drift.size).toBe(0);
  });
});
