/**
 * Process Portal search + facets (T0698). The Portal hands the client a flat
 * accessible-published index and does search/facet/sort in memory; these pure
 * helpers are the whole engine, so they're pinned here: review-status
 * classification, APQC top-category derivation, multi-term AND search across
 * name/owner/pcf/type, facet counts over the full set, and the sort orders.
 */
import { describe, it, expect } from "vitest";
import {
  reviewStatusOf, pcfTopCategory, filterRows, buildFacets, typeLabel,
  type PortalRow,
} from "@/app/lib/portal/facets";

const NOW = Date.UTC(2026, 6, 10); // 2026-07-10
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString();

const row = (over: Partial<PortalRow>): PortalRow => ({
  id: "d", name: "Diagram", type: "bpmn", ownerId: "u1", ownerName: "Paul Nash",
  projectId: "p1", updatedAt: iso(2026, 6, 1), publishedAt: iso(2026, 6, 1), versionNumber: 1,
  nextReviewDate: null, procedureDocUrl: null, procedureDocName: null,
  pcfHierarchyId: null, pcfName: null, via: "project", ...over,
});

describe("portal review status (T0698)", () => {
  it("classifies overdue / due-soon / current / none", () => {
    expect(reviewStatusOf(null, NOW)).toBe("none");
    expect(reviewStatusOf(iso(2026, 5, 1), NOW)).toBe("overdue");       // past
    expect(reviewStatusOf(iso(2026, 6, 18), NOW)).toBe("due-soon");     // within 14 days
    expect(reviewStatusOf(iso(2026, 9, 1), NOW)).toBe("current");       // far future
    expect(reviewStatusOf("not-a-date", NOW)).toBe("none");
  });
});

describe("portal APQC top-category (T0698)", () => {
  it("derives the level-1 code from a hierarchyId, tolerating junk", () => {
    expect(pcfTopCategory("8.5.2")).toBe("8.0");
    expect(pcfTopCategory("8.0")).toBe("8.0");
    expect(pcfTopCategory("13.1")).toBe("13.0");
    expect(pcfTopCategory(null)).toBeNull();
    expect(pcfTopCategory("abc")).toBeNull();
  });
});

describe("portal search + filter + sort (T0698)", () => {
  const rows = [
    row({ id: "a", name: "Process Invoices", ownerName: "Greg Nash", ownerId: "g", type: "bpmn", pcfHierarchyId: "8.5.2", pcfName: "Process AP", publishedAt: iso(2026, 6, 5) }),
    row({ id: "b", name: "Order to Cash", ownerName: "Paul Nash", ownerId: "u1", type: "bpmn", pcfHierarchyId: "4.2.1", pcfName: "Manage orders", publishedAt: iso(2026, 6, 9) }),
    row({ id: "c", name: "Ticket Lifecycle", ownerName: "Paul Nash", ownerId: "u1", type: "state-machine", pcfHierarchyId: null, publishedAt: iso(2026, 6, 1), nextReviewDate: iso(2026, 5, 1) }),
  ];

  it("multi-term query matches across name/owner/pcf/type (AND)", () => {
    expect(filterRows(rows, { q: "invoice" }, NOW).map((r) => r.id)).toEqual(["a"]);
    expect(filterRows(rows, { q: "process ap" }, NOW).map((r) => r.id)).toEqual(["a"]); // name + pcfName
    expect(filterRows(rows, { q: "paul state" }, NOW).map((r) => r.id)).toEqual(["c"]); // owner + type
    expect(filterRows(rows, { q: "nope" }, NOW)).toHaveLength(0);
  });

  it("facet filters narrow by type / owner / category / review", () => {
    expect(filterRows(rows, { type: "bpmn" }, NOW).map((r) => r.id).sort()).toEqual(["a", "b"]);
    expect(filterRows(rows, { ownerId: "u1" }, NOW).map((r) => r.id).sort()).toEqual(["b", "c"]);
    expect(filterRows(rows, { category: "8.0" }, NOW).map((r) => r.id)).toEqual(["a"]);
    expect(filterRows(rows, { review: "overdue" }, NOW).map((r) => r.id)).toEqual(["c"]);
  });

  it("sorts A–Z by default and by recency when asked", () => {
    expect(filterRows(rows, {}, NOW).map((r) => r.name)).toEqual(["Order to Cash", "Process Invoices", "Ticket Lifecycle"]);
    expect(filterRows(rows, { sort: "recent" }, NOW).map((r) => r.id)).toEqual(["b", "a", "c"]);
  });
});

describe("portal facets (T0698)", () => {
  const rows = [
    row({ id: "a", type: "bpmn", ownerId: "g", ownerName: "Greg Nash", pcfHierarchyId: "8.5.2", nextReviewDate: iso(2026, 5, 1) }),
    row({ id: "b", type: "bpmn", ownerId: "u1", ownerName: "Paul Nash", pcfHierarchyId: "8.1.1" }),
    row({ id: "c", type: "state-machine", ownerId: "u1", ownerName: "Paul Nash", pcfHierarchyId: "4.2.1", nextReviewDate: iso(2026, 6, 18) }),
  ];

  it("counts each dimension over the full set with labels + ordering", () => {
    const f = buildFacets(rows, NOW, { "8.0": "Manage Financial Resources" });
    expect(f.type).toEqual([
      { value: "bpmn", label: "BPMN", count: 2 },
      { value: "state-machine", label: "State Machine", count: 1 },
    ]);
    // owner sorted by count desc then label
    expect(f.owner.map((o) => [o.value, o.count])).toEqual([["u1", 2], ["g", 1]]);
    // category sorted by numeric code, label from the map, code fallback otherwise
    expect(f.category).toEqual([
      { value: "4.0", label: "4.0", count: 1 },
      { value: "8.0", label: "Manage Financial Resources", count: 2 },
    ]);
    // review in fixed severity order, only present buckets (b has no date → none)
    expect(f.review.map((r) => [r.value, r.count])).toEqual([["overdue", 1], ["due-soon", 1], ["none", 1]]);
  });

  it("typeLabel prettifies known + unknown types", () => {
    expect(typeLabel("bpmn")).toBe("BPMN");
    expect(typeLabel("state-machine")).toBe("State Machine");
    expect(typeLabel("custom_thing")).toBe("Custom Thing");
  });
});
