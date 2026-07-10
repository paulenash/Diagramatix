/**
 * Diagram entity extraction (T0701). The Portal answers "which processes use
 * System X / involve Team Y" by reading each diagram's pool/lane/system labels.
 * This pins the classification: white-box pools + lanes/sublanes → org names;
 * black-box `isSystem` pools + data-stores → systems; black-box non-system
 * pools → external participants; case-insensitive dedup; blanks dropped.
 */
import { describe, it, expect } from "vitest";
import { extractDiagramEntities } from "@/app/lib/diagram/extractEntities";

const el = (over: Record<string, unknown>) => ({ id: "e", type: "task", x: 0, y: 0, width: 1, height: 1, label: "", properties: {}, ...over });

describe("extract diagram entities (T0701)", () => {
  it("classifies pools, lanes and system shapes", () => {
    const data = {
      elements: [
        el({ type: "pool", label: "Acme Co", properties: { poolType: "white-box" } }),        // org
        el({ type: "lane", label: "Marketing", parentId: "p" }),                                 // org (team)
        el({ type: "sublane", label: "SEO Specialist", parentId: "l" }),                          // org (role)
        el({ type: "pool", label: "SAP ERP", properties: { poolType: "black-box", isSystem: true } }), // system
        el({ type: "pool", label: "Customer", properties: { poolType: "black-box", isSystem: false } }), // participant
        el({ type: "data-store", label: "Invoice DB" }),                                         // system
        el({ type: "process-system", label: "CRM" }),                                            // system
        el({ type: "task", label: "Do work" }),                                                  // ignored
      ],
    };
    const refs = extractDiagramEntities(data);
    expect(refs).toContainEqual({ kind: "org", name: "Acme Co" });
    expect(refs).toContainEqual({ kind: "org", name: "Marketing" });
    expect(refs).toContainEqual({ kind: "org", name: "SEO Specialist" });
    expect(refs).toContainEqual({ kind: "system", name: "SAP ERP" });
    expect(refs).toContainEqual({ kind: "participant", name: "Customer" });
    expect(refs).toContainEqual({ kind: "system", name: "Invoice DB" });
    expect(refs).toContainEqual({ kind: "system", name: "CRM" });
    expect(refs.some((r) => r.name === "Do work")).toBe(false);
  });

  it("treats a black-box pool without isSystem as an external participant, and white-box as org", () => {
    const refs = extractDiagramEntities({ elements: [
      el({ type: "pool", label: "Supplier", properties: { poolType: "black-box" } }),
      el({ type: "pool", label: "Head Office" }),   // no poolType → white-box default → org
    ] });
    expect(refs).toContainEqual({ kind: "participant", name: "Supplier" });
    expect(refs).toContainEqual({ kind: "org", name: "Head Office" });
  });

  it("dedups case-insensitively within a kind and drops blank labels", () => {
    const refs = extractDiagramEntities({ elements: [
      el({ type: "lane", label: "Finance" }),
      el({ type: "lane", label: "finance" }),   // dup
      el({ type: "lane", label: "  " }),          // blank
    ] });
    expect(refs).toEqual([{ kind: "org", name: "Finance" }]);
  });

  it("is safe on junk input", () => {
    expect(extractDiagramEntities(null)).toEqual([]);
    expect(extractDiagramEntities({})).toEqual([]);
  });
});
