/**
 * Issue 7 (2026-07-29): a process-level End event with a single incoming flow is
 * placed NEAR its immediate predecessor — aligned to its row and following its
 * lane — not floating at a lane's vertical centre.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

// Flow crosses into the LOWER lane before ending, so the End event must follow
// its predecessor down rather than sit at the top lane.
const els: AiElement[] = [
  { id: "p", type: "pool", label: "P", poolType: "white-box", lanes: [
    { id: "top", name: "Top" }, { id: "bot", name: "Bottom" },
  ] },
  { id: "s", type: "start-event", label: "S", pool: "p", lane: "top" },
  { id: "a", type: "task", label: "A", pool: "p", lane: "top" },
  { id: "b", type: "task", label: "B", pool: "p", lane: "bot" },
  { id: "e", type: "end-event", label: "Done", pool: "p", lane: "bot" },
];
const conns: AiConnection[] = [
  { sourceId: "s", targetId: "a" }, { sourceId: "a", targetId: "b" }, { sourceId: "b", targetId: "e" },
];

describe("Issue 7 — End event sits near its predecessor", () => {
  it("T1065 — a single-incoming End event aligns to its predecessor's row", () => {
    const out = layoutBpmnDiagram(els, conns);
    const b = out.elements.find((x) => x.id === "b")!;
    const e = out.elements.find((x) => x.id === "e")!;
    const cyB = b.y + b.height / 2, cyE = e.y + e.height / 2;
    expect(Math.abs(cyE - cyB), `End (cy=${Math.round(cyE)}) should align to pred B (cy=${Math.round(cyB)})`).toBeLessThanOrEqual(1);
    // …and follow the predecessor's lane.
    expect(e.parentId, "End follows its predecessor's lane").toBe(b.parentId);
  });
});

/**
 * V06 (2026-08-29): R8.18 pulls an End event left to hug its sequence-flow
 * predecessor. That predecessor is not necessarily the rightmost thing on the
 * row — a child the model left off the internal chain sits between them, and
 * the pull used to drop the End straight on top of it (−93px and −17px inside
 * V06.05's Expanded Subprocess). The hug is now clamped by the row's occupants.
 */
describe("R8.18 — the End-event hug is clamped by what is already there", () => {
  /** A linear EP (start → 4 tasks → end) plus whatever `extra` adds. */
  function build(extra: (els: AiElement[], conns: AiConnection[]) => void) {
    const els: AiElement[] = [
      { id: "p", type: "pool", label: "Product Organisation", poolType: "white-box" },
      { id: "l", type: "lane", label: "R&D", parentPool: "p" },
      { id: "s", type: "start-event", label: "Brief received", pool: "p", lane: "l" },
      { id: "ep", type: "subprocess-expanded", label: "Repeat Until Agreed", pool: "p", lane: "l" },
      { id: "e", type: "end-event", label: "Agreed", pool: "p", lane: "l" },
      { id: "es", type: "start-event", label: "", parentSubprocess: "ep" },
      { id: "ee", type: "end-event", label: "", parentSubprocess: "ep" },
    ];
    const conns: AiConnection[] = [{ sourceId: "s", targetId: "ep" }, { sourceId: "ep", targetId: "e" }];
    let prev = "es";
    for (let i = 1; i <= 4; i++) {
      els.push({ id: `t${i}`, type: "task", label: `Step ${i}`, parentSubprocess: "ep" });
      conns.push({ sourceId: prev, targetId: `t${i}` });
      prev = `t${i}`;
    }
    conns.push({ sourceId: prev, targetId: "ee" });
    extra(els, conns);
    return { els, conns };
  }

  /** The worst horizontal overlap between any two children of the EP. */
  function worstOverlap(out: ReturnType<typeof layoutBpmnDiagram>) {
    const kids = out.elements.filter((k) => k.parentId === "ep").sort((a, b) => a.x - b.x);
    let worst = Infinity;
    for (let i = 1; i < kids.length; i++) worst = Math.min(worst, kids[i].x - (kids[i - 1].x + kids[i - 1].width));
    return { worst, kids };
  }

  const cases: [string, (els: AiElement[], conns: AiConnection[]) => void][] = [
    ["a stray child connected to nothing", (els) => {
      els.push({ id: "x", type: "task", label: "Stranded Step", parentSubprocess: "ep" });
    }],
    ["a child linked only to the OUTER flow", (els, conns) => {
      els.push({ id: "x", type: "task", label: "Outer-linked Step", parentSubprocess: "ep" });
      conns.push({ sourceId: "s", targetId: "x" });
    }],
    ["a second End event hanging off a mid-flow task", (els, conns) => {
      els.push({ id: "ee2", type: "end-event", label: "Escalated", parentSubprocess: "ep" });
      conns.push({ sourceId: "t2", targetId: "ee2" });
    }],
    ["a branch that never rejoins", (els, conns) => {
      els.push({ id: "g", type: "gateway", label: "Agreed?", gatewayType: "exclusive", parentSubprocess: "ep" });
      els.push({ id: "x", type: "task", label: "Rework", parentSubprocess: "ep" });
      conns.push({ sourceId: "t2", targetId: "g" }, { sourceId: "g", targetId: "x" });
    }],
  ];

  for (const [name, extra] of cases) {
    it(`T2905 — no child overlaps another when the EP has ${name}`, () => {
      const { els, conns } = build(extra);
      const { worst, kids } = worstOverlap(layoutBpmnDiagram(els, conns));
      expect(
        worst,
        `children: ${kids.map((k) => `${k.type}@${Math.round(k.x)}..${Math.round(k.x + k.width)}`).join(" ")}`,
      ).toBeGreaterThanOrEqual(0);
    });
  }

  it("T2906 — the hug still happens when nothing is in the way", () => {
    // The clamp must not simply disable R8.18: with a clean chain the End still
    // ends up within one task-width of its predecessor.
    const { els, conns } = build(() => {});
    const out = layoutBpmnDiagram(els, conns);
    const t4 = out.elements.find((x) => x.id === "t4")!;
    const ee = out.elements.find((x) => x.id === "ee")!;
    const gap = ee.x - (t4.x + t4.width);
    expect(gap, `End sits ${Math.round(gap)}px after its predecessor`).toBeLessThanOrEqual(70);
    expect(gap).toBeGreaterThanOrEqual(0);
  });
});
