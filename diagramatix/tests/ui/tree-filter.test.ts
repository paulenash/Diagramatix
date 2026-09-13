/**
 * The Project screen's navigation tree can be filtered.
 *
 * Paul, 2026-09-14: "Add filtering option for the Navigation Tree on the
 * Project Screen. By Diagram Type, By name, By has AL [AI], By Has SI, etc."
 *
 * The facets are the feature badges the tree already shows — AI, SI, MN, AP, RC
 * (app/lib/diagram/diagramFeatureBadges.ts) — plus the diagram type and a name
 * match. The rule itself is a pure function so it is tested as one; the
 * component check pins that the tree applies it in the ONE place every folder's
 * list goes through, so no folder can escape the filter.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { matchesTreeFilter, EMPTY_TREE_FILTER, type TreeFilter } from "@/app/lib/diagram/treeFilter";
import type { DiagramBadge } from "@/app/lib/diagram/diagramFeatureBadges";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");

const badge = (key: DiagramBadge["key"]): DiagramBadge => ({ key, code: key.slice(0, 2).toUpperCase(), color: key as never, title: "" });
const d = (name: string, type: string) => ({ name, type });

describe("matchesTreeFilter", () => {
  it("T4374 — an empty filter matches everything", () => {
    expect(matchesTreeFilter(d("Order to Cash", "bpmn"), [], EMPTY_TREE_FILTER)).toBe(true);
    expect(matchesTreeFilter(d("", "epc"), [], EMPTY_TREE_FILTER)).toBe(true);
  });

  it("T4375 — name is a case-insensitive substring; type is exact", () => {
    const f: TreeFilter = { ...EMPTY_TREE_FILTER, name: "cash" };
    expect(matchesTreeFilter(d("Order to Cash", "bpmn"), [], f)).toBe(true);
    expect(matchesTreeFilter(d("Order to Ship", "bpmn"), [], f)).toBe(false);
    const t: TreeFilter = { ...EMPTY_TREE_FILTER, type: "epc" };
    expect(matchesTreeFilter(d("X", "epc"), [], t)).toBe(true);
    expect(matchesTreeFilter(d("X", "bpmn"), [], t)).toBe(false);
  });

  it("T4376 — every ticked badge must be present (AND), so 'has SI' and 'has AI' narrows, not widens", () => {
    const f: TreeFilter = { ...EMPTY_TREE_FILTER, badges: ["ai", "simulator"] };
    expect(matchesTreeFilter(d("X", "bpmn"), [badge("ai"), badge("simulator")], f)).toBe(true);
    expect(matchesTreeFilter(d("X", "bpmn"), [badge("ai")], f), "has AI but not SI").toBe(false);
    expect(matchesTreeFilter(d("X", "bpmn"), [], f)).toBe(false);
    // …and the facets combine: type AND name AND badges.
    const all: TreeFilter = { name: "order", type: "bpmn", badges: ["riskControl"] };
    expect(matchesTreeFilter(d("Order to Cash", "bpmn"), [badge("riskControl")], all)).toBe(true);
    expect(matchesTreeFilter(d("Order to Cash", "epc"), [badge("riskControl")], all)).toBe(false);
  });
});

describe("the tree applies the filter in one place, for every folder", () => {
  it("T4377 — getOrderedDiagramsInFolder filters before it sorts; the control sits beside Sort", () => {
    const src = read("app", "(dashboard)", "dashboard", "projects", "[id]", "ProjectDetailClient.tsx");
    const fn = src.slice(src.indexOf("function getOrderedDiagramsInFolder"));
    const body = fn.slice(0, fn.indexOf("if (diagramSort === \"manual\")"));
    expect(body, "the per-folder list is filtered at its source").toMatch(/matchesTreeFilter\(d, badgesByDiagram\.get\(d\.id\) \?\? \[\], treeFilter\)/);
    // The control: name box, type select, and one toggle per badge facet. The
    // toggles are rendered from a table of [key, code, title], so the check is
    // that every badge key is in that table and each row calls the toggle.
    expect(src).toContain('id="diagram-filter-name"');
    expect(src).toContain('id="diagram-filter-type"');
    const control = src.slice(src.indexOf('id="diagram-filter-type"'), src.indexOf("setTreeFilter(EMPTY_TREE_FILTER)"));
    for (const [key, code] of [["ai", "AI"], ["simulator", "SI"], ["mining", "MN"], ["apqc", "AP"], ["riskControl", "RC"]]) {
      expect(control, `badge facet ${key}`).toContain(`["${key}", "${code}",`);
    }
    expect(control).toMatch(/onClick=\{\(\) => toggleBadgeFilter\(key\)\}/);
    // A toggle is ANDed into the filter, never replacing it.
    expect(src).toMatch(/badges: f\.badges\.includes\(key\) \? f\.badges\.filter\(\(k\) => k !== key\) : \[\.\.\.f\.badges, key\]/);
    // It is possible to get back to seeing everything in one click.
    expect(src).toContain("setTreeFilter(EMPTY_TREE_FILTER)");
    // A folder whose diagrams are all filtered out still renders (structure is
    // not a match), but says so rather than looking empty by accident.
    expect(src).toMatch(/filtered out/);
  });
});
