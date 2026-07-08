import { describe, it, expect } from "vitest";
import { folderSubtree, childrenInSubtree, orderDeepestFirst, folderCode, folderCodeStrip, type BulkFolder } from "@/app/lib/pcf/bulkFolders";

// root(4.1) ─ a(4.1.1), b(4.1.2), c(4.1.3 ─ c1(4.1.3.1))  + unrelated sibling(4.2)
const FOLDERS: BulkFolder[] = [
  { id: "root", name: "4.1 Manage", parentId: "cat" },
  { id: "a", name: "4.1.1 Assess", parentId: "root" },
  { id: "b", name: "4.1.2 Design", parentId: "root" },
  { id: "c", name: "4.1.3 Deliver", parentId: "root" },
  { id: "c1", name: "4.1.3.1 Ship", parentId: "c" },
  { id: "other", name: "4.2 Other", parentId: "cat" },
];

describe("bulk folder helpers (T0676)", () => {
  it("folderSubtree returns the folder + all descendants (self first), excluding siblings", () => {
    const sub = folderSubtree(FOLDERS, "root");
    expect(sub.map((s) => s.id).sort()).toEqual(["a", "b", "c", "c1", "root"]);
    expect(sub[0].id).toBe("root"); // self first
    expect(sub.find((s) => s.id === "other")).toBeUndefined();
  });

  it("the example — 4.1 with 4.1.1/4.1.2/4.1.3 gives 4 diagrams (root not counting the deeper 4.1.3.1)", () => {
    const flat: BulkFolder[] = FOLDERS.filter((f) => f.id !== "c1"); // just the 3 leaves
    expect(folderSubtree(flat, "root")).toHaveLength(4);
  });

  it("childrenInSubtree returns only direct children", () => {
    const sub = folderSubtree(FOLDERS, "root");
    expect(childrenInSubtree(sub, "root").map((c) => c.id).sort()).toEqual(["a", "b", "c"]);
    expect(childrenInSubtree(sub, "c").map((c) => c.id)).toEqual(["c1"]);
    expect(childrenInSubtree(sub, "a")).toEqual([]); // leaf
  });

  it("orderDeepestFirst places every child before its parent (so links resolve)", () => {
    const sub = folderSubtree(FOLDERS, "root");
    const ordered = orderDeepestFirst(sub);
    const pos = (id: string) => ordered.findIndex((f) => f.id === id);
    expect(pos("c1")).toBeLessThan(pos("c"));   // grandchild before child
    expect(pos("c")).toBeLessThan(pos("root")); // child before root
    expect(pos("a")).toBeLessThan(pos("root"));
    expect(ordered[ordered.length - 1].id).toBe("root"); // root generated last
  });

  it("folderCode / folderCodeStrip parse the APQC prefix", () => {
    expect(folderCode("4.1.3 Deliver")).toBe("4.1.3");
    expect(folderCode("No code here")).toBe("");
    expect(folderCodeStrip("4.1.3 Deliver")).toBe("Deliver");
    expect(folderCodeStrip("Plain")).toBe("Plain");
  });
});
