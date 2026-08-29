/**
 * Paul, 2026-07-29 and again on the V06 review: "activity size does not match
 * the text inside, particularly when the activity is inside an expanded
 * subprocess."
 *
 * Top-level flow elements have gone through `autoElementSize` for a long time.
 * The children of an expanded subprocess did not — they were pushed at the
 * catalogue default (102x65), so a generated name like "Assess Sales Channel Fit
 * and Distributor Viability" (128x81 when fitted) was drawn in a box two lines
 * too small and the text spilled outside it. Nine of ten real V06 task names
 * overflowed.
 *
 * Sizing them makes the placement the second half of the problem: the old spread
 * divided the EP's usable width by INDEX and assumed every child was 102 wide,
 * so a fitted child sat 12px from its neighbour and a four-line name would have
 * overlapped outright. Both halves are pinned here.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { autoSizeForType, hardWrapProcessName } from "@/app/lib/diagram/textMetrics";

/** Real names from the V06 regenerations, hard-wrapped as the generator emits them. */
const LONG = [
  "Analyse Customer and Investor Feedback",
  "Assess Sales Channel Fit and Distributor Viability",
  "Revise Pricing Scenarios and Terms",
  "Update Pricing Model Records in CRM",
  "Review Model Against Viability Thresholds",
].map(hardWrapProcessName);

/** start → EP(names…) → end, plus the same names at top level for comparison. */
function build(names: string[], opts: { eventSub?: boolean } = {}) {
  const els: AiElement[] = [
    { id: "p", type: "pool", label: "Product Organisation", poolType: "white-box" },
    { id: "l", type: "lane", label: "Finance", parentPool: "p" },
    { id: "s", type: "start-event", label: "In", pool: "p", lane: "l" },
    { id: "ep", type: "subprocess-expanded", label: "Repeat Until Validated", pool: "p", lane: "l" },
    { id: "top", type: "task", label: names[0], taskType: "user", pool: "p", lane: "l" },
    { id: "e", type: "end-event", label: "Out", pool: "p", lane: "l" },
    { id: "is", type: "start-event", label: "", parentSubprocess: "ep" },
    { id: "ie", type: "end-event", label: "", parentSubprocess: "ep" },
  ];
  const conns: AiConnection[] = [
    { sourceId: "s", targetId: "ep" }, { sourceId: "ep", targetId: "top" }, { sourceId: "top", targetId: "e" },
  ];
  let prev = "is";
  names.forEach((nm, i) => {
    els.push({ id: `k${i}`, type: "task", label: nm, taskType: "user", parentSubprocess: "ep" });
    conns.push({ sourceId: prev, targetId: `k${i}` });
    prev = `k${i}`;
  });
  conns.push({ sourceId: prev, targetId: "ie" });
  if (opts.eventSub) {
    // Forces the GRID branch instead of the single-row one.
    els.push({ id: "es", type: "subprocess-expanded", label: "On Error", subprocessType: "event", parentSubprocess: "ep" });
    els.push({ id: "esk", type: "task", label: "Escalate", parentSubprocess: "es" });
  }
  return { els, conns };
}

/** Every task child of `parentId`, with the size its label actually needs. */
function fitReport(out: ReturnType<typeof layoutBpmnDiagram>, parentId: string) {
  return out.elements
    .filter((k) => k.parentId === parentId && k.type === "task")
    .map((k) => ({ k, need: autoSizeForType("task", k.label, 12, true) }));
}

describe("an activity is sized to the text inside it", () => {
  it("T2943 — a task INSIDE an expanded subprocess fits its label", () => {
    const { els, conns } = build(LONG);
    const out = layoutBpmnDiagram(els, conns);
    const rows = fitReport(out, "ep");
    expect(rows.length).toBe(LONG.length);
    const spilling = rows.filter(({ k, need }) => k.width < need.w || k.height < need.h);
    expect(
      spilling.map(({ k, need }) => `${JSON.stringify(k.label)} drawn ${k.width}x${k.height}, needs ${need.w}x${need.h}`),
      "every child must be at least as big as its own text",
    ).toEqual([]);
  });

  it("T2944 — and one at top level still does (the path that already worked)", () => {
    const { els, conns } = build(LONG);
    const out = layoutBpmnDiagram(els, conns);
    const top = out.elements.find((x) => x.id === "top")!;
    const need = autoSizeForType("task", top.label, 12, true);
    expect(top.width).toBeGreaterThanOrEqual(need.w);
    expect(top.height).toBeGreaterThanOrEqual(need.h);
  });

  it("T2945 — sized children still do not overlap, and stay inside the box", () => {
    // The second half: sizing without fixing the spread would put a 128px child
    // 12px from its neighbour, and a wider one on top of it.
    const { els, conns } = build(LONG);
    const out = layoutBpmnDiagram(els, conns);
    const ep = out.elements.find((x) => x.id === "ep")!;
    const kids = out.elements.filter((k) => k.parentId === "ep").sort((a, b) => a.x - b.x);
    for (let i = 1; i < kids.length; i++) {
      const gap = kids[i].x - (kids[i - 1].x + kids[i - 1].width);
      expect(gap, `${kids[i - 1].label} → ${kids[i].label}`).toBeGreaterThanOrEqual(0);
    }
    for (const k of kids) {
      expect(k.x, `${k.label} past the left edge`).toBeGreaterThanOrEqual(ep.x);
      expect(k.x + k.width, `${k.label} past the right edge`).toBeLessThanOrEqual(ep.x + ep.width);
    }
  });

  it("T2946 — a short label is NOT inflated", () => {
    // Autosize is a floor, not a stretch: a name that fits keeps the catalogue
    // size, or every diagram would grow for no reason.
    const { els, conns } = build(["Assemble Prototype", "Ship It"]);
    const out = layoutBpmnDiagram(els, conns);
    for (const { k } of fitReport(out, "ep")) {
      expect(k.width, `${k.label} should stay at the default width`).toBe(102);
      expect(k.height).toBe(65);
    }
  });

  it("T2947 — the GRID branch sizes its children too", () => {
    // An EP holding an event subprocess lays its children out as a grid rather
    // than a single row — a separate push site, and it had the same defect.
    const { els, conns } = build(LONG, { eventSub: true });
    const out = layoutBpmnDiagram(els, conns);
    const spilling = fitReport(out, "ep").filter(({ k, need }) => k.width < need.w || k.height < need.h);
    expect(spilling.map(({ k }) => k.label), "grid children must fit their text too").toEqual([]);
  });
});
