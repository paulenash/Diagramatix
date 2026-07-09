/**
 * PCF folder seeding (Level 2): building a project folder tree from a PCF branch
 * — depth cap, mirrored parent links, additive to the existing tree. Pure.
 */
import { describe, it, expect } from "vitest";
import { seedFoldersFromPcf, type SeedPcfNode, type SeedFolderTree } from "@/app/lib/pcf/folderSeed";

const NODES: SeedPcfNode[] = [
  { id: "A", hierarchyId: "1.0", name: "Vision", level: 1, parentId: null },
  { id: "B", hierarchyId: "1.1", name: "Strategy", level: 2, parentId: "A" },
  { id: "C", hierarchyId: "1.2", name: "Concept", level: 2, parentId: "A" },
  { id: "D", hierarchyId: "1.1.1", name: "Assess", level: 3, parentId: "B" }, // excluded at maxLevel 2
];

describe("PCF folder seeding", () => {
  it("T0662 — mirrors the PCF branch to depth, links parents, keeps existing folders", () => {
    const existing: SeedFolderTree = { folders: [{ id: "keep", name: "My folder", parentId: null }], diagramFolderMap: { d1: "keep" } };
    let i = 0;
    const { tree, added } = seedFoldersFromPcf(existing, NODES, { maxLevel: 2, underFolderId: null, newId: () => `f${++i}` });

    expect(added).toBe(3); // A, B, C — not D (level 3 > maxLevel)
    expect(tree.folders).toHaveLength(4); // existing + 3

    const a = tree.folders.find((f) => f.name === "1.0 Vision")!;
    expect(a.parentId).toBeNull();
    const b = tree.folders.find((f) => f.name === "1.1 Strategy")!;
    expect(b.parentId).toBe(a.id);         // linked to its PCF parent's folder
    const c = tree.folders.find((f) => f.name === "1.2 Concept")!;
    expect(c.parentId).toBe(a.id);
    expect(tree.folders.some((f) => f.name.includes("Assess"))).toBe(false); // depth cap

    // Existing folder + diagram map preserved.
    expect(tree.folders.find((f) => f.id === "keep")).toBeTruthy();
    expect(tree.diagramFolderMap).toEqual({ d1: "keep" });
  });

  it("T0663 — anchors under a chosen folder", () => {
    const { tree } = seedFoldersFromPcf({ folders: [] }, NODES, { maxLevel: 1, underFolderId: "anchor", newId: () => "x" });
    expect(tree.folders[0].parentId).toBe("anchor"); // top-level PCF node hangs under the anchor
  });

  it("T0678 — appends the 5-digit PCF id in parens when present, omits it when absent", () => {
    const nodes: SeedPcfNode[] = [
      { id: "A", hierarchyId: "1.0", name: "Vision", level: 1, parentId: null, pcfId: 10002 },
      { id: "B", hierarchyId: "1.1", name: "Strategy", level: 2, parentId: "A" }, // no pcfId
    ];
    let i = 0;
    const { tree } = seedFoldersFromPcf({ folders: [] }, nodes, { maxLevel: 2, newId: () => `f${++i}` });
    expect(tree.folders.some((f) => f.name === "1.0 Vision (10002)")).toBe(true);
    expect(tree.folders.some((f) => f.name === "1.1 Strategy")).toBe(true); // no suffix
  });
});
