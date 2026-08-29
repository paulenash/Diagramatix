/**
 * R8.22 — closing an EMPTY horizontal void in the flow.
 *
 * Paul, 2026-08-29, on two freshly regenerated diagrams: "large sequence
 * connector gap between the first two activities … since it is common is there a
 * way of removing it".
 *
 * The fixtures below are the REAL geometry of those two diagrams, taken straight
 * out of the exports (`type`, `x`, `width`, containment; ids and labels
 * stripped). That matters: every synthetic shape I built failed to reproduce the
 * void, so a hand-written case would have pinned nothing. These numbers are the
 * defect itself.
 *
 *   V06.06  1,488px  "Review Solution Design Scope" → "Retrieve Design Specifications"
 *   V06.08  1,622px  "Review Business Case Assumptions" → "Retrieve Customer Data From CRM"
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { closeFlowVoids, VOID_MIN, type VoidBox } from "@/app/lib/diagram/closeFlowVoids";

const load = (name: string): VoidBox[] =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "_fixtures", name), "utf8"));

/** The widest band of nothing between top-level flow elements. */
function widestVoid(boxes: VoidBox[]): number {
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const top = boxes.filter((b) => {
    if (b.type === "pool" || b.type === "lane" || b.type === "sublane") return false;
    if (b.boundaryHostId && byId.has(b.boundaryHostId)) return false;
    const p = b.parentId ? byId.get(b.parentId) : undefined;
    return !(p && p.type === "subprocess-expanded");
  }).sort((a, b) => a.x - b.x);
  let worst = 0, occRight = top.length ? top[0].x + top[0].width : 0;
  for (let i = 1; i < top.length; i++) {
    worst = Math.max(worst, top[i].x - occRight);
    occRight = Math.max(occRight, top[i].x + top[i].width);
  }
  return Math.round(worst);
}

/** Every element's position relative to the one before it, in x order. */
const spacing = (boxes: VoidBox[]) => {
  const s = [...boxes].sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
  return s.slice(1).map((b, i) => Math.round(b.x - s[i].x));
};

describe("R8.22 — empty flow voids are closed", () => {
  for (const [name, file, expected] of [
    ["V06.08 Validate Commercial Model", "v0608-geometry.json", 1622],
    ["V06.06 Develop Prototype", "v0606-geometry.json", 1488],
  ] as const) {
    it(`T2913 — ${name}: the ${expected}px void is closed`, () => {
      const boxes = load(file);
      const before = widestVoid(boxes);
      // The fixture must actually carry the defect, or this test proves nothing.
      expect(before, `${name} fixture should contain the reported void`).toBeGreaterThanOrEqual(expected - 5);

      const closed = closeFlowVoids(boxes);
      expect(closed.length, "at least one void should have been closed").toBeGreaterThan(0);
      expect(widestVoid(boxes), `${name} still has a ${widestVoid(boxes)}px void`).toBeLessThan(VOID_MIN);
    });
  }

  it("T2914 — closing a void moves a block, so nothing inside it shifts relative to anything else", () => {
    // The safety property. Elements either move together by one dx or not at
    // all, so no pair can be brought on top of another.
    const boxes = load("v0608-geometry.json");
    const gapsBefore = spacing(boxes.filter((b) => !/pool|lane/.test(b.type)));
    closeFlowVoids(boxes);
    const gapsAfter = spacing(boxes.filter((b) => !/pool|lane/.test(b.type)));
    // Every spacing is preserved except at the void, which shrinks.
    const changed = gapsBefore.filter((g, i) => g !== gapsAfter[i]);
    expect(changed.length, `${changed.length} spacings changed; only the void should`).toBeLessThanOrEqual(1);
  });

  it("T2915 — a flow with no slack is left exactly as it was", () => {
    // The counter-guard: compaction must never creep a clean diagram left.
    const boxes: VoidBox[] = [
      { id: "p", type: "pool", x: 50, width: 900 },
      { id: "s", type: "start-event", x: 158, width: 36, parentId: "p" },
      { id: "a", type: "task", x: 264, width: 102, parentId: "p" },
      { id: "b", type: "task", x: 426, width: 102, parentId: "p" },
      { id: "c", type: "task", x: 588, width: 102, parentId: "p" },
      { id: "e", type: "end-event", x: 750, width: 36, parentId: "p" },
    ];
    const before = boxes.map((b) => b.x);
    expect(closeFlowVoids(boxes)).toEqual([]);
    expect(boxes.map((b) => b.x)).toEqual(before);
  });

  it("T2916 — a gap that CONTAINS something is not slack and is left alone", () => {
    // A branch in another lane occupying the span: closing it would drag the
    // merge back on top of the branch.
    const boxes: VoidBox[] = [
      { id: "p", type: "pool", x: 50, width: 2000 },
      { id: "g", type: "gateway", x: 158, width: 40, parentId: "p" },
      { id: "branch", type: "task", x: 700, width: 102, parentId: "p" }, // sits in the span
      { id: "m", type: "gateway", x: 1400, width: 40, parentId: "p" },
    ];
    closeFlowVoids(boxes);
    const at = (id: string) => boxes.find((b) => b.id === id)!;
    expect(at("branch").x).toBeGreaterThan(at("g").x);
    expect(at("m").x).toBeGreaterThan(at("branch").x);
  });
});
