import { describe, it, expect } from "vitest";
import { diffPcfVersions, type DiffNode } from "@/app/lib/pcf/versionDiff";

const OLD: DiffNode[] = [
  { pcfId: 1, hierarchyId: "1.0", name: "Category" },
  { pcfId: 2, hierarchyId: "1.1", name: "Old group name" },
  { pcfId: 3, hierarchyId: "1.1.1", name: "Retired process" },
];
const NEW: DiffNode[] = [
  { pcfId: 1, hierarchyId: "1.0", name: "Category" },          // unchanged
  { pcfId: 2, hierarchyId: "1.1", name: "New group name" },    // renamed (stable pcfId 2)
  { pcfId: 4, hierarchyId: "1.2", name: "Brand-new process" }, // added
];

describe("diffPcfVersions", () => {
  it("classifies added / removed / renamed by stable pcfId", () => {
    const d = diffPcfVersions(OLD, NEW);
    expect(d.added.map((n) => n.pcfId)).toEqual([4]);
    expect(d.removed.map((n) => n.pcfId)).toEqual([3]);
    expect(d.renamed).toEqual([{ pcfId: 2, hierarchyId: "1.1", oldName: "Old group name", newName: "New group name" }]);
    expect(d.unchanged).toBe(1); // pcfId 1
  });

  it("is empty-safe and treats identical versions as all-unchanged", () => {
    expect(diffPcfVersions([], [])).toEqual({ added: [], removed: [], renamed: [], unchanged: 0 });
    const same = diffPcfVersions(OLD, OLD);
    expect(same.added).toEqual([]); expect(same.removed).toEqual([]); expect(same.renamed).toEqual([]);
    expect(same.unchanged).toBe(3);
  });
});
