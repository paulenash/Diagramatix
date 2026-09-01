/**
 * Path analysis — the model behind Paul's "Gateway Paths Illustrated" (2026-09-01).
 *
 * The structure under test is his, reproduced exactly:
 *
 *     Path 1  ── Task 2 → Task 3 → Task 4 ──────────────┐
 *     Path 2  ── Task 5 → Decision 2 ─┬─ 2.1 ───────────┤
 *                                     ├─ 2.2 ───────────┤   Decision 1 merge
 *                                     └─ 2.3 → END      │   (2.3 never arrives)
 *     Path 3  ── Task 8 → Task 9 → Task 10 ─────────────┘
 *
 * and the thing it must produce is the row ORDER: 1, 2.1, 2.2, 2.3, 3 — with 2.2
 * sharing the trunk. Rows, not pixels: the spacing follows content height, so
 * asserting coordinates would pin the wrong thing.
 */
import { describe, it, expect } from "vitest";
import { analysePaths, ROOT, type PathInput } from "@/app/lib/diagram/bpmnPaths";

const H = 65;
const el = (id: string, height = H) => ({ id, height, type: "task" as const, parentId: "ln" });

const input: PathInput = {
  elements: [
    el("t1"), el("d1", 40), el("t2"), el("t3"), el("t4"),
    el("t5"), el("d2", 40), el("t11"), el("t12"), el("t6"), el("t7"),
    el("t13"), el("e23", 36), el("dm2", 40), el("t15"),
    el("t8"), el("t9"), el("t10"), el("dm1", 40), el("t16"),
  ],
  edges: [
    { sourceId: "t1", targetId: "d1" },
    { sourceId: "d1", targetId: "t2", label: "Path 1" },
    { sourceId: "d1", targetId: "t5", label: "Path 2" },
    { sourceId: "d1", targetId: "t8", label: "Path 3" },
    { sourceId: "t2", targetId: "t3" }, { sourceId: "t3", targetId: "t4" }, { sourceId: "t4", targetId: "dm1" },
    { sourceId: "t5", targetId: "d2" },
    { sourceId: "d2", targetId: "t11", label: "Path 2.1" },
    { sourceId: "d2", targetId: "t6", label: "Path 2.2" },
    { sourceId: "d2", targetId: "t13", label: "Path 2.3" },
    { sourceId: "t11", targetId: "t12" }, { sourceId: "t12", targetId: "dm2" },
    { sourceId: "t6", targetId: "t7" }, { sourceId: "t7", targetId: "dm2" },
    { sourceId: "t13", targetId: "e23" },                       // ends, no merge
    { sourceId: "dm2", targetId: "t15" }, { sourceId: "t15", targetId: "dm1" },
    { sourceId: "t8", targetId: "t9" }, { sourceId: "t9", targetId: "t10" }, { sourceId: "t10", targetId: "dm1" },
  ],
  isDecision: (id) => id === "d1" || id === "d2",
  mergeFor: (id) => (id === "d1" ? "dm1" : id === "d2" ? "dm2" : undefined),
  trunkRow: 400,
};

const a = analysePaths(input);
const path = (id: string) => a.paths.find((p) => p.id === id)!;
const rowOfEl = (elId: string) => a.rowOf.get(a.pathOf.get(elId)!)!;

describe("path analysis — identity", () => {
  it("T3099 — branches are numbered, and a nested branch carries its parent's number", () => {
    // The ROOT trunk is unnumbered — it is the line the branches hang off, not
    // a branch itself. Sequential decisions share it rather than stacking.
    expect(a.paths.map((p) => p.id).filter((id) => id !== ROOT).sort())
      .toEqual(["1", "2", "2.1", "2.2", "2.3", "3"]);
    expect(a.paths.some((p) => p.id === ROOT)).toBe(true);
    expect(path("2.1").parentId).toBe("2");
    expect(path("2.1").depth).toBe(1);
    expect(path("1").depth).toBe(0);
  });

  it("T3100 — every flow element belongs to exactly one path", () => {
    for (const [id, p] of [["t2", "1"], ["t4", "1"], ["t5", "2"], ["t15", "2"],
      ["t11", "2.1"], ["t6", "2.2"], ["t13", "2.3"], ["e23", "2.3"], ["t9", "3"]] as [string, string][]) {
      expect(a.pathOf.get(id), `${id} should be on path ${p}`).toBe(p);
    }
  });

  it("T3101 — the path that ends is recorded as ending, and still owns a row", () => {
    // Paul: "some sub-paths may end before their Merge." It is ordinary here.
    expect(path("2.3").endsWithoutMerge).toBe(true);
    expect(path("1").endsWithoutMerge).toBe(false);
    expect(a.rowOf.get("2.3")).toBeTypeOf("number");
  });

  it("T3102 — the path continues THROUGH a nested decision to its merge", () => {
    // Task 15 is after Decision 2's merge and is still Path 2 — without this the
    // trunk would stop at the nested fork and the rest would belong to nobody.
    expect(a.pathOf.get("t15")).toBe("2");
  });
});

describe("path analysis — hierarchical rows", () => {
  it("T3103 — rows run 1, 2.1, 2.2, 2.3, 3 from top to bottom", () => {
    const order = ["1", "2.1", "2.2", "2.3", "3"].map((id) => a.rowOf.get(id)!);
    for (let i = 1; i < order.length; i++) {
      expect(order[i], `${i} should sit below ${i - 1}`).toBeGreaterThan(order[i - 1]);
    }
  });

  it("T3104 — the middle branch keeps the trunk, and the trunk stays where the flow is", () => {
    expect(a.rowOf.get("2")).toBe(400);
    expect(a.rowOf.get("2.2")).toBe(400);   // the middle child rides the trunk
  });

  it("T3105 — a nested path sits BETWEEN the trunk and its uncle, never on it", () => {
    // The whole defect this replaces: 2.1 landed on Path 1 and 2.3 on Path 3,
    // because a nested decision reused its parent's fixed offsets.
    const [p1, p21, trunk, p23, p3] =
      ["1", "2.1", "2", "2.3", "3"].map((id) => a.rowOf.get(id)!);
    expect(p21).toBeGreaterThan(p1);
    expect(p21).toBeLessThan(trunk);
    expect(p23).toBeGreaterThan(trunk);
    expect(p23).toBeLessThan(p3);
  });

  it("T3106 — no two sibling paths share a row except a path and its trunk child", () => {
    const rows = new Map<number, string[]>();
    for (const p of a.paths) {
      const list = rows.get(p.row) ?? [];
      list.push(p.id); rows.set(p.row, list);
    }
    for (const [row, ids0] of rows) {
      // The root legitimately shares the trunk with the child that continues it.
      const ids = ids0.filter((i) => i !== ROOT);
      if (ids.length <= 1) continue;
      // The only legitimate sharing: a parent and the child that continues it.
      const sorted = [...ids].sort((x, y) => x.length - y.length);
      for (const id of sorted.slice(1)) {
        expect(id.startsWith(sorted[0] + "."), `${ids.join(" and ")} share row ${row}`).toBe(true);
      }
    }
  });

  it("T3107 — elements resolve to their path's row", () => {
    expect(rowOfEl("t6")).toBe(400);
    expect(rowOfEl("t11")).toBeLessThan(400);
    expect(rowOfEl("t13")).toBeGreaterThan(400);
  });
});
