/**
 * Portal canonical entity index (T0702). Diagram entity labels are matched
 * (normalized-exact) to the Org Entity Lists, org-structure refs roll UP to
 * their ancestors so filtering by a Team also surfaces its child-Role
 * processes, unmatched labels survive as "uncatalogued", and "Involving me"
 * intersects the reader's assigned nodes with the (rolled-up) row entities.
 */
import { describe, it, expect } from "vitest";
import {
  buildEntityCatalog, resolveEntities, buildEntityFacets, matchesEntityValue, involvesMe,
  normalizeEntityName, type CatalogNodeInput,
} from "@/app/lib/portal/entityIndex";
import type { EntityRef } from "@/app/lib/diagram/extractEntities";

// Org tree: Marketing (team) → SEO Specialist (role); plus a System list.
const CATALOG: CatalogNodeInput[] = [
  { id: "org", name: "Acme", parentId: null, listKind: "OrgStructure" },
  { id: "mkt", name: "Marketing", parentId: "org", listKind: "OrgStructure" },
  { id: "seo", name: "SEO Specialist", parentId: "mkt", listKind: "OrgStructure" },
  { id: "sap", name: "SAP ERP", parentId: null, listKind: "System" },
];
const cat = buildEntityCatalog(CATALOG);
const refs = (...rs: EntityRef[]) => rs;

describe("entity index (T0702)", () => {
  it("normalizes case/whitespace/punctuation", () => {
    expect(normalizeEntityName("  SAP-ERP! ")).toBe("sap erp");
    expect(normalizeEntityName("Marketing")).toBe("marketing");
  });

  it("matches a system and rolls an org role UP to its ancestors", () => {
    const r = resolveEntities(refs({ kind: "system", name: "sap erp" }, { kind: "org", name: "SEO Specialist" }), cat);
    expect(r.systemIds).toEqual(["sap"]);
    // role → itself + Marketing + Acme (ancestors)
    expect(new Set(r.teamIds)).toEqual(new Set(["seo", "mkt", "org"]));
    expect(r.uncat).toEqual([]);
  });

  it("keeps unmatched labels as uncatalogued", () => {
    const r = resolveEntities(refs({ kind: "system", name: "Legacy Mainframe" }, { kind: "org", name: "Marketing" }), cat);
    expect(r.systemIds).toEqual([]);
    expect(r.uncat).toEqual([{ group: "system", norm: "legacy mainframe", name: "Legacy Mainframe" }]);
    expect(new Set(r.teamIds)).toEqual(new Set(["mkt", "org"]));
  });

  it("filtering by a Team matches processes referencing its child Role (roll-up)", () => {
    const roleRow = resolveEntities(refs({ kind: "org", name: "SEO Specialist" }), cat);   // references the role only
    // Picking the parent Team node still matches, because teamIds are ancestor-expanded.
    expect(matchesEntityValue(roleRow, "team", "mkt")).toBe(true);
    expect(matchesEntityValue(roleRow, "team", "seo")).toBe(true);
    // A different team does not match.
    expect(matchesEntityValue(roleRow, "team", "someOtherTeam")).toBe(false);
    // Uncatalogued value matching.
    const uncatRow = resolveEntities(refs({ kind: "system", name: "Legacy Mainframe" }), cat);
    expect(matchesEntityValue(uncatRow, "system", "uncat:legacy mainframe")).toBe(true);
  });

  it("builds facets with rolled-up counts, uncatalogued flagged and ranked last", () => {
    const resolved = [
      resolveEntities(refs({ kind: "org", name: "SEO Specialist" }, { kind: "system", name: "SAP ERP" }), cat),
      resolveEntities(refs({ kind: "org", name: "Marketing" }), cat),
      resolveEntities(refs({ kind: "system", name: "Legacy Mainframe" }), cat),
    ];
    const f = buildEntityFacets(resolved, cat);
    // Marketing appears on BOTH the role row (rolled up) and the direct row → count 2.
    expect(f.team.find((v) => v.value === "mkt")).toMatchObject({ label: "Marketing", count: 2 });
    expect(f.team.find((v) => v.value === "seo")).toMatchObject({ count: 1 });
    // System: SAP canonical (count 1) ranked before the uncatalogued mainframe.
    expect(f.system[0]).toMatchObject({ value: "sap", uncatalogued: false });
    expect(f.system.find((v) => v.value === "uncat:legacy mainframe")).toMatchObject({ uncatalogued: true, count: 1 });
  });

  it("'involving me' matches my team or any role beneath it", () => {
    const roleRow = resolveEntities(refs({ kind: "org", name: "SEO Specialist" }), cat);
    // I'm assigned the Marketing team → the child-role process involves me.
    expect(involvesMe(roleRow, ["mkt"])).toBe(true);
    // I'm assigned an unrelated team → not involved.
    expect(involvesMe(roleRow, ["finance"])).toBe(false);
    // No memberships → never "involving me".
    expect(involvesMe(roleRow, [])).toBe(false);
  });
});
