import { describe, it, expect } from "vitest";
import { widthFor, pad, stripLeadingCode } from "@/app/lib/numbering/codes";
import { computeRenumber, type FolderTree, type DiagramInput, type NumberingConfig } from "@/app/lib/numbering/renumber";
import type { DiagramElement } from "@/app/lib/diagram/types";

// ── factories ────────────────────────────────────────────────────────
const el = (id: string, label: string, x = 0, y = 0, props: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type: "task", label, x, y, width: 100, height: 60, properties: props }) as unknown as DiagramElement;
const dia = (id: string, name: string, elements: DiagramElement[], pcf?: { hierarchyId: string }): DiagramInput =>
  ({ id, name, data: { elements, connectors: [], ...(pcf ? { pcf: { hierarchyId: pcf.hierarchyId } } : {}) } }) as unknown as DiagramInput;
const cfg = (o: Partial<NumberingConfig>): NumberingConfig =>
  ({ mode: "full", prefix: "", applied: false, showNonApqc: false, ...o });

describe("Project re-numbering engine", () => {
  // T1017 — width rule: ≤9 → 1 digit; ≥10 → 2 (zero-padded).
  it("T1017: widthFor + pad", () => {
    expect(widthFor(1)).toBe(1);
    expect(widthFor(9)).toBe(1);
    expect(widthFor(10)).toBe(2);
    expect(widthFor(50)).toBe(2);
    expect(pad(3, 1)).toBe("3");
    expect(pad(3, 2)).toBe("03");
    expect(pad(12, 2)).toBe("12");
  });

  // T1018 — full mode: nested dotted codes; folders numbered before diagrams.
  it("T1018: full-mode nested tree walk", () => {
    const tree: FolderTree = {
      folders: [
        { id: "F1", name: "Sales", parentId: "root" },
        { id: "F2", name: "Marketing", parentId: "root" },
        { id: "F1a", name: "Domestic", parentId: "F1" },
      ],
      diagramFolderMap: { D1: "F1", D2: "F1a", D3: "F2" },
      folderOrder: { root: ["F1", "F2"] },
    };
    const diagrams = [dia("D1", "Collections", [el("a", "Draft")]), dia("D2", "Retail", []), dia("D3", "Campaign", [])];
    const diff = computeRenumber(cfg({ mode: "full" }), tree, diagrams);
    const fcode = (id: string) => diff.folders.find((f) => f.id === id)?.code;
    const dcode = (id: string) => diff.diagrams.find((d) => d.id === id)?.code;
    expect(fcode("F1")).toBe("1");
    expect(fcode("F2")).toBe("2");
    expect(fcode("F1a")).toBe("1.1");    // sub-folder before diagram in F1
    expect(dcode("D2")).toBe("1.1.1");   // diagram inside sub-folder
    expect(dcode("D1")).toBe("1.2");     // diagram after the sub-folder in F1
    expect(dcode("D3")).toBe("2.1");
  });

  // T1019 — full-mode prefix prepends to the top-level number (no dot).
  it("T1019: prefix ABC + empty prefix", () => {
    const tree: FolderTree = { folders: [{ id: "F1", name: "Ops", parentId: "root" }], diagramFolderMap: { D1: "F1" } };
    const diagrams = [dia("D1", "Flow", [el("a", "Step one")])];
    const withPrefix = computeRenumber(cfg({ mode: "full", prefix: "ABC" }), tree, diagrams);
    expect(withPrefix.folders[0].code).toBe("ABC1");
    expect(withPrefix.diagrams[0].code).toBe("ABC1.1");
    expect(withPrefix.diagrams[0].elements[0].newCode).toBe("ABC1.1.1");
    const bare = computeRenumber(cfg({ mode: "full", prefix: "" }), tree, diagrams);
    expect(bare.folders[0].code).toBe("1");
    expect(bare.diagrams[0].elements[0].newCode).toBe("1.1.1");
  });

  // T1020 — activity ordering = reading order (y band, then x).
  it("T1020: spatial activity order is deterministic", () => {
    const tree: FolderTree = { folders: [], diagramFolderMap: { D1: "root" } };
    const els = [el("c", "Third", 300, 10), el("a", "First", 10, 10), el("b", "Second", 150, 12)];
    const diagrams = [dia("D1", "Flow", els)];
    const diff = computeRenumber(cfg({ mode: "full" }), tree, diagrams);
    const order = diff.diagrams[0].elements.map((e) => e.id);
    expect(order).toEqual(["a", "b", "c"]); // same y-band → left-to-right
  });

  // T1021 — APQC re-normalisation closes gaps from deleted APQC activities.
  it("T1021: apqc contiguous renumber (gap close)", () => {
    const els = [
      el("A", "1.1.1.1 Alpha", 0, 0, { pcfHierarchyId: "1.1.1.1" }),
      el("B", "1.1.1.3 Gamma", 0, 100, { pcfHierarchyId: "1.1.1.3" }), // .2 was deleted
    ];
    const diagrams = [dia("D1", "1.1.1 Process", els, { hierarchyId: "1.1.1" })];
    const diff = computeRenumber(cfg({ mode: "apqc" }), tree0, diagrams);
    const byId = Object.fromEntries(diff.diagrams[0].elements.map((e) => [e.id, e.newCode]));
    expect(byId["A"]).toBe("1.1.1.1");
    expect(byId["B"]).toBe("1.1.1.2"); // gap closed
    expect(diff.diagrams[0].newName).toBe("1.1.1 Process"); // name retained
  });

  // T1022 — non-APQC activities appended after APQC within the level; flags; bare numbers >9.
  it("T1022: apqc non-APQC appended + no zero-pad past 9", () => {
    const apqc = Array.from({ length: 9 }, (_, i) =>
      el(`p${i}`, `Task ${i}`, 0, i * 50, { pcfHierarchyId: `1.1.1.${i + 1}` }));
    const extra = [el("x", "Manual step", 0, 1000), el("y", "Another", 0, 1100)];
    const diagrams = [dia("D1", "1.1.1 Process", [...apqc, ...extra], { hierarchyId: "1.1.1" })];
    const diff = computeRenumber(cfg({ mode: "apqc" }), tree0, diagrams);
    const byId = Object.fromEntries(diff.diagrams[0].elements.map((e) => [e.id, e]));
    expect(byId["x"].newCode).toBe("1.1.1.10"); // appended after 9 APQC, BARE (not .010)
    expect(byId["y"].newCode).toBe("1.1.1.11");
    expect(byId["x"].isApqc).toBe(false);
    expect(byId["p0"].isApqc).toBe(true);
  });

  // T1023 — label line-1 = code\nname; strip-and-reapply is idempotent.
  it("T1023: label line-1 code + idempotent re-run", () => {
    const tree: FolderTree = { folders: [{ id: "F1", name: "Ops", parentId: "root" }], diagramFolderMap: { D1: "F1" } };
    const diagrams = [dia("D1", "Flow", [el("a", "Step one"), el("b", "Step two", 0, 100)])];
    const first = computeRenumber(cfg({ mode: "full", prefix: "AB" }), tree, diagrams);
    const e0 = first.diagrams[0].elements[0];
    expect(e0.newLabel).toBe("AB1.1.1\nStep one");
    // Apply and re-run → no further changes.
    const applied: DiagramInput[] = [dia("D1", first.diagrams[0].newName,
      first.diagrams[0].elements.map((ed) => el(ed.id, ed.newLabel, ed.id === "b" ? 0 : 0, ed.id === "b" ? 100 : 0, { nameCode: ed.newCode })))];
    const applieTree: FolderTree = { ...tree, folders: [{ id: "F1", name: first.folders[0].newName, parentId: "root" }] };
    const second = computeRenumber(cfg({ mode: "full", prefix: "AB" }), applieTree, applied);
    expect(second.counters).toEqual({ folders: 0, diagrams: 0, elements: 0 });
  });

  // T1024 — folder code prefixes the folder + diagram names.
  it("T1024: folder + diagram name prefixing", () => {
    const tree: FolderTree = { folders: [{ id: "F1", name: "Sales", parentId: "root" }], diagramFolderMap: { D1: "F1" } };
    const diagrams = [dia("D1", "Collections Process", [])];
    const diff = computeRenumber(cfg({ mode: "full", prefix: "X" }), tree, diagrams);
    expect(diff.folders[0].newName).toBe("X1 Sales");
    expect(diff.diagrams[0].newName).toBe("X1.1 Collections Process");
  });

  // T1025 — diff shape + counters.
  it("T1025: RenumberDiff shape + counters", () => {
    const tree: FolderTree = { folders: [{ id: "F1", name: "Ops", parentId: "root" }], diagramFolderMap: { D1: "F1" } };
    const diagrams = [dia("D1", "Flow", [el("a", "Only step")])];
    const diff = computeRenumber(cfg({ mode: "full" }), tree, diagrams);
    expect(diff.counters).toEqual({ folders: 1, diagrams: 1, elements: 1 });
    expect(Object.keys(diff.folders[0])).toEqual(expect.arrayContaining(["id", "oldName", "newName", "code"]));
    expect(Object.keys(diff.diagrams[0].elements[0])).toEqual(expect.arrayContaining(["id", "oldLabel", "oldCode", "newCode", "newLabel", "isApqc"]));
  });

  it("stripLeadingCode recovers base name preserving case", () => {
    expect(stripLeadingCode("ABC1.2.3\nCollect Cash", "ABC1.2.3")).toBe("Collect Cash");
    expect(stripLeadingCode("1.1.1.2 Do Thing", "1.1.1.2")).toBe("Do Thing");
    expect(stripLeadingCode("Plain Name")).toBe("Plain Name");
    expect(stripLeadingCode("12 Monkeys")).toBe("12 Monkeys"); // bare number is NOT a code
  });
});

const tree0: FolderTree = { folders: [], diagramFolderMap: { D1: "root" } };
