/**
 * Populate Org Hierarchy from BPMN + move-between-levels. Covers the two PURE
 * units: `extractOrgTreeFromBpmn` (raw pool/lane/sublane tree → Org/Unit/Team,
 * deduped, white-box only) and `planMove` (promote/demote re-levels the moved
 * subtree; up/down reorders; bounds are no-ops). No DB — both are pure functions.
 */
import { describe, it, expect } from "vitest";
import { extractOrgTreeFromBpmn, extractFlatEntitiesFromBpmn } from "@/app/lib/entityLists/bpmnOrgTree";
import { planMove, type MoveNodeLite } from "@/app/lib/entityLists/nodeOps";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const el = (id: string, type: string, labelText: string, parentId?: string, poolType?: string): any => ({
  id, type, label: labelText,
  ...(parentId ? { parentId } : {}),
  ...(poolType ? { properties: { poolType } } : {}),
});
const diag = (elements: unknown[]) => ({ data: { elements } });

describe("extractOrgTreeFromBpmn", () => {
  it("T1101 — white-box Pool→Organisation, Lane→OrgUnit, Sublane→Team", () => {
    const tree = extractOrgTreeFromBpmn([diag([
      el("p1", "pool", "ACME"),
      el("l1", "lane", "Finance", "p1"),
      el("l2", "lane", "Sales", "p1"),
      el("s1", "sublane", "Accounts Payable", "l1"),
    ])]);
    expect(tree.map((n) => [n.name, n.level])).toEqual([["ACME", "Organisation"]]);
    const acme = tree[0];
    expect(acme.children.map((n) => [n.name, n.level])).toEqual([["Finance", "OrgUnit"], ["Sales", "OrgUnit"]]);
    expect(acme.children[0].children.map((n) => [n.name, n.level])).toEqual([["Accounts Payable", "Team"]]);
    expect(acme.children[1].children).toEqual([]);
  });

  it("T1102 — black-box pools and blank labels are skipped", () => {
    const tree = extractOrgTreeFromBpmn([diag([
      el("p1", "pool", "ACME"),
      el("p2", "pool", "Customer", undefined, "black-box"), // external → not the org hierarchy
      el("l1", "lane", "", "p1"),                            // blank → skipped
      el("l2", "lane", "HR", "p1"),
      el("l3", "lane", "External Lane", "p2"),               // under a black-box pool → its pool isn't a root
    ])]);
    expect(tree.map((n) => n.name)).toEqual(["ACME"]);
    expect(tree[0].children.map((n) => n.name)).toEqual(["HR"]);
  });

  it("T1103 — deduped by name within the same parent, across diagrams", () => {
    const tree = extractOrgTreeFromBpmn([
      diag([el("p1", "pool", "ACME"), el("l1", "lane", "Finance", "p1"), el("s1", "sublane", "AP", "l1")]),
      diag([el("p9", "pool", "ACME"), el("l9", "lane", "Finance", "p9"), el("l8", "lane", "HR", "p9"), el("s9", "sublane", "AP", "l9")]),
    ]);
    expect(tree).toHaveLength(1);                              // one ACME, not two
    const finance = tree[0].children.find((n) => n.name === "Finance")!;
    expect(tree[0].children.map((n) => n.name)).toEqual(["Finance", "HR"]);
    expect(finance.children.map((n) => n.name)).toEqual(["AP"]); // one AP, not two
  });
});

describe("extractFlatEntitiesFromBpmn", () => {
  it("T1108 — classifies pools/shapes into the four flat lists, deduped", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = (id: string, labelText: string, black: boolean, isSystem?: boolean): any =>
      ({ id, type: "pool", label: labelText, properties: { poolType: black ? "black-box" : "white-box", ...(isSystem ? { isSystem: true } : {}) } });
    const flat = extractFlatEntitiesFromBpmn([
      diag([
        pool("p1", "ArchiSurance", false),          // white-box → org hierarchy, not flat
        pool("p2", "Customer", true),               // black-box, not system → participant
        pool("p3", "SAP", true, true),              // black-box system → IT system
        el("s1", "system", "CRM"),                  // system shape → IT system
        el("d1", "data-object", "Claim Form"),      // → document
        el("d2", "data-store", "Policy Ledger"),    // → data store
      ]),
      diag([ pool("p9", "Customer", true), el("d9", "data-object", "Claim Form") ]), // dupes
    ]);
    expect(flat.participants).toEqual(["Customer"]);
    expect(flat.systems).toEqual(["CRM", "SAP"]);           // sorted, deduped
    expect(flat.documents).toEqual(["Claim Form"]);          // deduped across diagrams
    expect(flat.dataStores).toEqual(["Policy Ledger"]);
  });
});

describe("planMove", () => {
  const nodes = (): MoveNodeLite[] => [
    { id: "org", parentId: null, level: "Organisation", name: "Co", sortOrder: 0 },
    { id: "u1", parentId: "org", level: "OrgUnit", name: "Finance", sortOrder: 0 },
    { id: "u2", parentId: "org", level: "OrgUnit", name: "HR", sortOrder: 1 },
    { id: "t1", parentId: "u1", level: "Team", name: "AP", sortOrder: 0 },
    { id: "r1", parentId: "t1", level: "Role", name: "Clerk", sortOrder: 0 },
  ];
  const byId = (u: ReturnType<typeof planMove>, id: string) => u.find((x) => x.id === id);

  it("T1104 — promote re-parents to the grandparent and re-levels the subtree", () => {
    const u = planMove(nodes(), "t1", "promote");
    expect(byId(u, "t1")).toMatchObject({ parentId: "org", level: "OrgUnit", sortOrder: 2 });
    // The promoted node's child moves up a level too: Role → Team.
    expect(byId(u, "r1")).toMatchObject({ level: "Team" });
  });

  it("T1105 — demote nests under the previous sibling and re-levels down", () => {
    const u = planMove(nodes(), "u2", "demote");
    expect(byId(u, "u2")).toMatchObject({ parentId: "u1", level: "Team" });
  });

  it("T1106 — up/down swaps sortOrder with the adjacent sibling, no level change", () => {
    const up = planMove(nodes(), "u2", "up");
    expect(up).toHaveLength(2);
    expect(byId(up, "u2")!.sortOrder).toBe(0);
    expect(byId(up, "u1")!.sortOrder).toBe(1);
    expect(byId(up, "u2")!.level).toBeUndefined(); // reorder never re-levels
  });

  it("T1107 — impossible moves are no-ops (top-level promote, first-sibling up/demote)", () => {
    expect(planMove(nodes(), "org", "promote")).toEqual([]);
    expect(planMove(nodes(), "u1", "up")).toEqual([]);
    expect(planMove(nodes(), "u1", "demote")).toEqual([]);
  });
});
