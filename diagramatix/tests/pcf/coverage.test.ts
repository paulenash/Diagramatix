import { describe, it, expect } from "vitest";
import { computePcfCoverage, type CoverageNodeIn, type Classification } from "@/app/lib/pcf/coverage";

// cat1 ─ pg ─ proc1, proc2 ; cat2
const NODES: CoverageNodeIn[] = [
  { id: "cat1", pcfId: 1, hierarchyId: "1.0", name: "Category 1", level: 1, parentId: null },
  { id: "pg", pcfId: 2, hierarchyId: "1.1", name: "Group", level: 2, parentId: "cat1" },
  { id: "proc1", pcfId: 3, hierarchyId: "1.1.1", name: "Process 1", level: 3, parentId: "pg" },
  { id: "proc2", pcfId: 4, hierarchyId: "1.1.2", name: "Process 2", level: 3, parentId: "pg" },
  { id: "cat2", pcfId: 5, hierarchyId: "2.0", name: "Category 2", level: 1, parentId: null },
];

describe("computePcfCoverage", () => {
  it("marks nodes modelled by nodeId and by pcfId (same framework), and rolls counts up the tree", () => {
    const classifications: Classification[] = [
      { nodeId: "proc1", diagramId: "d1", diagramName: "Proc 1 model" },              // by nodeId
      { pcfId: 4, frameworkId: "fw", diagramId: "d2", diagramName: "Proc 2 model" }, // by pcfId
      { pcfId: 5, frameworkId: "other", diagramId: "d3", diagramName: "wrong fw" },  // different framework → ignored
    ];
    const r = computePcfCoverage(NODES, classifications, "fw");

    const byId = Object.fromEntries(r.nodes.map((n) => [n.id, n]));
    expect(byId.proc1.modelled).toBe(true);
    expect(byId.proc2.modelled).toBe(true);
    expect(byId.cat2.modelled).toBe(false); // the "other" framework classification did not count

    expect(r.total).toBe(5);
    expect(r.modelled).toBe(2);

    // cat1 subtree = cat1 + pg + proc1 + proc2 = 4 nodes, 2 modelled
    expect(byId.cat1.subtreeTotal).toBe(4);
    expect(byId.cat1.subtreeModelled).toBe(2);

    const cat1 = r.byCategory.find((c) => c.id === "cat1")!;
    expect(cat1).toMatchObject({ total: 4, modelled: 2 });
    const cat2 = r.byCategory.find((c) => c.id === "cat2")!;
    expect(cat2).toMatchObject({ total: 1, modelled: 0 });

    // diagrams attach to the node they classify
    expect(byId.proc1.diagrams).toEqual([{ id: "d1", name: "Proc 1 model" }]);
  });

  it("is empty-safe", () => {
    const r = computePcfCoverage([], [], "fw");
    expect(r).toMatchObject({ total: 0, modelled: 0, nodes: [], byCategory: [] });
  });
});
