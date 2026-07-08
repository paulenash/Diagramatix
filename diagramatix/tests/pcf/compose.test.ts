import { describe, it, expect } from "vitest";
import { composeBranch, type SourceNode } from "@/app/lib/pcf/compose";

// cat(1.0) ─ pg(1.1) ─ proc-a(1.1.1), proc-b(1.1.2)
const SRC: SourceNode[] = [
  { id: "cat", pcfId: 1, hierarchyId: "1.0", name: "Category", description: null, level: 1, parentId: null, sortOrder: 0, metricsAvailable: false },
  { id: "pg", pcfId: 2, hierarchyId: "1.1", name: "Group", description: "g", level: 2, parentId: "cat", sortOrder: 0, metricsAvailable: true },
  { id: "pa", pcfId: 3, hierarchyId: "1.1.1", name: "Proc A", description: null, level: 3, parentId: "pg", sortOrder: 1, metricsAvailable: false },
  { id: "pb", pcfId: 4, hierarchyId: "1.1.2", name: "Proc B", description: null, level: 3, parentId: "pg", sortOrder: 0, metricsAvailable: false },
];

let seq = 0;
const idgen = () => `new-${seq++}`;

describe("composeBranch", () => {
  it("copies a subtree with provenance, re-based levels, and remapped parents", () => {
    seq = 0;
    const out = composeBranch(SRC, "pg", "TF", "REF", null, idgen);

    // pg + its 2 children
    expect(out).toHaveLength(3);
    const root = out[0];
    expect(root).toMatchObject({
      frameworkId: "TF", pcfId: 2, name: "Group", parentId: null, level: 1,
      isCustom: false, active: true, orgCode: null, sourceFrameworkId: "REF", sourcePcfId: 2,
    });
    // children point at the new root id, one level deeper, ordered by sortOrder (pb before pa)
    const kids = out.slice(1);
    expect(kids.every((k) => k.parentId === root.id)).toBe(true);
    expect(kids.map((k) => k.name)).toEqual(["Proc B", "Proc A"]);
    expect(kids.every((k) => k.level === 2)).toBe(true);
    expect(kids.map((k) => k.sourcePcfId)).toEqual([4, 3]);
  });

  it("re-bases levels under a target parent", () => {
    seq = 0;
    const out = composeBranch(SRC, "pg", "TF", "REF", { id: "host", level: 2 }, idgen);
    expect(out[0]).toMatchObject({ parentId: "host", level: 3 }); // one below the level-2 host
    expect(out[1].level).toBe(4);
  });

  it("returns [] for an unknown root", () => {
    expect(composeBranch(SRC, "nope", "TF", "REF", null, idgen)).toEqual([]);
  });
});
