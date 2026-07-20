/**
 * Entity hierarchy collapse helpers (Collapse/Expand + Collapse All/Expand All).
 *
 * Pure functions in app/lib/entityLists/types.ts, shared by the editor
 * (EntityListEditor) and the canvas naming dropdown (EntityNameInput):
 *   - idsWithChildren  → which nodes render a chevron
 *   - visibleSuggestions → hides descendants of collapsed nodes (DFS-order aware)
 */
import { describe, it, expect } from "vitest";
import {
  toSuggestions, idsWithChildren, visibleSuggestions,
  type EntityNodeDTO,
} from "@/app/lib/entityLists/types";

// Org (0) → [ Unit A (1) → [ Team A1 (2) ], Unit B (3) ]
const node = (id: string, parentId: string | null, level: EntityNodeDTO["level"], sortOrder: number): EntityNodeDTO => ({
  id, name: id, level, parentId, sortOrder,
  spDriveId: null, spItemId: null, spName: null, spWebUrl: null,
});
const NODES: EntityNodeDTO[] = [
  node("Org", null, "Organisation", 0),
  node("UnitA", "Org", "OrgUnit", 0),
  node("TeamA1", "UnitA", "Team", 0),
  node("UnitB", "Org", "OrgUnit", 1),
];
const sugg = toSuggestions(NODES);

describe("entity hierarchy collapse helpers", () => {
  it("T0916 — idsWithChildren flags exactly the parents", () => {
    const kids = idsWithChildren(sugg);
    expect([...kids].sort()).toEqual(["Org", "UnitA"]);
    expect(kids.has("TeamA1")).toBe(false); // leaf
    expect(kids.has("UnitB")).toBe(false);  // leaf
  });

  it("T0917 — visibleSuggestions hides descendants of a collapsed node", () => {
    // Collapse UnitA → TeamA1 disappears, everything else stays (incl. sibling UnitB).
    const visIds = visibleSuggestions(sugg, new Set(["UnitA"])).map((s) => s.id);
    expect(visIds).toEqual(["Org", "UnitA", "UnitB"]);

    // Collapse the root → only the root shows ("Collapse all" from the top).
    const rootOnly = visibleSuggestions(sugg, new Set(["Org"])).map((s) => s.id);
    expect(rootOnly).toEqual(["Org"]);

    // No collapse → full tree (Expand all).
    expect(visibleSuggestions(sugg, new Set()).map((s) => s.id))
      .toEqual(["Org", "UnitA", "TeamA1", "UnitB"]);

    // Collapse all parents → parents visible, their children hidden.
    const allCollapsed = visibleSuggestions(sugg, idsWithChildren(sugg)).map((s) => s.id);
    expect(allCollapsed).toEqual(["Org"]); // UnitA/TeamA1 hidden under collapsed Org
  });
});
