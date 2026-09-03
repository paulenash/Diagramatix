/**
 * Gateways are centred, paired and entered using FINAL geometry.
 *
 * Paul, 2026-09-02, on "gateway Lanes generation Test 3 - TD fixed":
 *   1. "Initial gateway placed too low not as new rule mandates."
 *   2. "the 2 Gateway Merges are also placed too low."
 *   3. "The Merge associated with Gateway 'Complexity?' should have Task 12
 *       connected to the left-hand vertex when placed correctly."
 *
 * All three came of reading positions before they had settled.
 *
 *   R8.32 was sited straight after the path rows and then the lane passes moved
 *   everything underneath it: it saw "Type?" at 387, computed 387 and did
 *   nothing, while the drawing ended at 630 and the rule wanted 429. Centring on
 *   stale coordinates looks exactly like not centring at all.
 *
 *   findPairedMerge demanded that EVERY branch reach the merge, so one
 *   terminating branch unpaired the whole gateway and its merge was never
 *   levelled — Paul's own "some sub-paths may end before their Merge".
 *
 *   And the two-inbound merge split its arrivals top/bottom by list index, so a
 *   branch arriving level still bent to a corner.
 *
 * The fixture is his shape: a cross-lane three-way fork, and a nested fork whose
 * third branch ends instead of rejoining.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

const els: AiElement[] = [
  { id: "p", type: "pool", label: "Company", poolType: "white-box",
    lanes: [{ id: "fo", name: "Front Office" }, { id: "sales", name: "Sales Team" }, { id: "mkt", name: "Marketing Team" }] },
  { id: "s", type: "start-event", label: "Email Arrives", pool: "p", lane: "fo" },
  { id: "t1", type: "task", label: "Determine Email Type", pool: "p", lane: "fo" },
  { id: "d1", type: "gateway", label: "Type?", gatewayType: "exclusive", pool: "p", lane: "sales" },

  { id: "t2", type: "task", label: "Task 2", pool: "p", lane: "fo" },
  { id: "sp1", type: "subprocess", label: "Subprocess 1", pool: "p", lane: "fo" },

  { id: "t5", type: "task", label: "Task 5", pool: "p", lane: "sales" },
  { id: "d2", type: "gateway", label: "Complexity?", gatewayType: "exclusive", pool: "p", lane: "sales" },
  { id: "t6", type: "task", label: "Task 6", pool: "p", lane: "sales" },
  { id: "t15", type: "task", label: "Task 15", pool: "p", lane: "sales" },
  { id: "t11", type: "task", label: "Task 11", pool: "p", lane: "sales" },
  { id: "t12", type: "task", label: "Task 12", pool: "p", lane: "sales" },
  { id: "t13", type: "task", label: "Task 13", pool: "p", lane: "sales" },
  { id: "eHard", type: "end-event", label: "Complexes Are Too Hard End", pool: "p", lane: "sales" },
  { id: "m2", type: "gateway", label: "Complexity Merge", pool: "p", lane: "sales" },

  { id: "t8", type: "task", label: "Task 8", pool: "p", lane: "mkt" },
  { id: "sp3", type: "subprocess", label: "Subprocess 3", pool: "p", lane: "mkt" },

  { id: "m1", type: "gateway", label: "Decision?", pool: "p", lane: "sales" },
  { id: "t17", type: "task", label: "Front Office Prepares Reply", pool: "p", lane: "fo" },
  { id: "e", type: "end-event", label: "Send & End", pool: "p", lane: "fo" },
];
const conns: AiConnection[] = [
  { sourceId: "s", targetId: "t1" }, { sourceId: "t1", targetId: "d1" },
  { sourceId: "d1", targetId: "t2", label: "Simple Enquiry" },
  { sourceId: "d1", targetId: "t5", label: "Sales Enquiry" },
  { sourceId: "d1", targetId: "t8", label: "Marketing Enquiry" },
  { sourceId: "t2", targetId: "sp1" }, { sourceId: "sp1", targetId: "m1" },
  { sourceId: "t5", targetId: "d2" },
  { sourceId: "d2", targetId: "t6", label: "Medium" },
  { sourceId: "d2", targetId: "t11", label: "Simple" },
  { sourceId: "d2", targetId: "t13", label: "Complex" },
  { sourceId: "t6", targetId: "t15" }, { sourceId: "t15", targetId: "m2" },
  { sourceId: "t11", targetId: "t12" }, { sourceId: "t12", targetId: "m2" },
  { sourceId: "t13", targetId: "eHard" },                 // ends; never reaches m2
  { sourceId: "m2", targetId: "m1" },
  { sourceId: "t8", targetId: "sp3" }, { sourceId: "sp3", targetId: "m1" },
  { sourceId: "m1", targetId: "t17" }, { sourceId: "t17", targetId: "e" },
];

const out = layoutBpmnDiagram(els, conns);
const at = (id: string) => out.elements.find((e) => e.id === id)!;
const cy = (id: string) => { const e = at(id); return e.y + e.height / 2; };
const ruleCentre = (gwId: string) => {
  const targets = out.connectors
    .filter((c) => c.sourceId === gwId && c.type !== "messageBPMN")
    .map((c) => at(c.targetId));
  return (Math.min(...targets.map((t) => t.y)) + Math.max(...targets.map((t) => t.y + t.height))) / 2;
};

describe("a gateway is centred on where its branches FINALLY are", () => {
  it("T3131 — a cross-lane fork sits at the middle of its branches, not 200px below", () => {
    expect(cy("d1")).toBeCloseTo(ruleCentre("d1"), 0);
  });

  it("T3132 — so does a nested fork whose branches stay in one lane", () => {
    expect(cy("d2")).toBeCloseTo(ruleCentre("d2"), 0);
  });

  it("T3133 — a branch that ENDS does not stop the merge being paired and levelled", () => {
    // "Complex" runs to its own end event and never reaches m2. Requiring every
    // branch to arrive left this gateway unpaired and its merge 200px adrift.
    expect(cy("m2"), "Complexity Merge is not level with Complexity?").toBeCloseTo(cy("d2"), 0);
  });

  it("T3134 — the top-level merge is level with its decision too", () => {
    expect(cy("m1")).toBeCloseTo(cy("d1"), 0);
  });
});

describe("a merge is entered on the vertex that matches the approach", () => {
  const into = (id: string) => out.connectors.filter((c) => c.type === "sequence" && c.targetId === id);

  it("T3135 — a branch arriving LEVEL enters on the left vertex", () => {
    const arrivals = into("m2");
    expect(arrivals.length).toBe(2);
    const t12 = arrivals.find((c) => c.sourceId === "t12")!;
    const t15 = arrivals.find((c) => c.sourceId === "t15")!;
    expect(Math.abs(cy("t12") - cy("m2")), "Task 12 is not level, so the case is not exercised").toBeLessThan(25);
    expect(t12.targetSide, "Task 12 should enter on the left vertex").toBe("left");
    expect(t12.targetOffsetAlong ?? 0.5).toBe(0.5);
    // The one that really is above still takes the top corner.
    expect(cy("t15")).toBeLessThan(cy("m2") - 25);
    expect(t15.targetSide).toBe("top");
  });

  it("T3136 — three or more arrivals keep the round-robin Paul chose (R6.28)", () => {
    const arrivals = into("m1");
    expect(arrivals.length).toBe(3);
    expect(new Set(arrivals.map((c) => c.targetSide))).toEqual(new Set(["top", "left", "bottom"]));
  });
});

describe("the flow after a merge stays on the merge's line (R8.33)", () => {
  it("T3141 — a post-merge step keeps the trunk, level with the rest of it", () => {
    // Paul, 2026-09-02: "Task 15 should continue in Lane's middle path i.e.
    // level with Task 5, Gateway 'Complexity?', Task 11, Task 12, and the
    // associated Merge." An earlier pass aligns the post-merge chain to the
    // merge, but ran a thousand lines before R8.32 gave the merge its final
    // row — so the chain followed a merge that then moved, and was left on a
    // row nothing else occupied.
    const els2: AiElement[] = [...els, { id: "t15b", type: "task", label: "Task 15", pool: "p", lane: "sales" }];
    const conns2: AiConnection[] = [
      ...conns.filter((c) => !(c.sourceId === "m2" && c.targetId === "m1")),
      { sourceId: "m2", targetId: "t15b" }, { sourceId: "t15b", targetId: "m1" },
    ];
    const o2 = layoutBpmnDiagram(els2, conns2);
    const cy2 = (id: string) => { const e = o2.elements.find((x) => x.id === id)!; return e.y + e.height / 2; };
    expect(cy2("t15b"), "Task 15 left the trunk").toBeCloseTo(cy2("m2"), 0);
    expect(cy2("t15b")).toBeCloseTo(cy2("t5"), 0);
    expect(cy2("t15b")).toBeCloseTo(cy2("t12"), 0);
  });
});

describe("a decision's outbound vertex follows final geometry too (R6.32)", () => {
  /**
   * Paul, 2026-09-03 (V22.01): "connector 'Yes — all required details present'
   * starts on wrong gateway vertex". Both gateways sat level at cy 527 and the
   * branch still left by the TOP vertex and doubled back.
   *
   * R6.26 assigns a two-way split top/bottom by PLAN ORDER on purpose — when
   * the connectors are built the targets are only provisionally placed, and a
   * tall subprocess reads as "below" merely for being tall. That is right for a
   * pair that fans apart, and wrong for a branch that ends up running straight
   * ahead. This is the mirror of R6.31, which Paul confirmed for merges.
   */
  const build = (secondBranchLevel: boolean) => {
    const e: AiElement[] = [
      { id: "p", type: "pool", label: "Co", poolType: "white-box" },
      { id: "s", type: "start-event", label: "Start", pool: "p" },
      { id: "t", type: "task", label: "Check completeness", pool: "p" },
      { id: "d", type: "gateway", label: "Complete?", gatewayType: "exclusive", pool: "p" },
      { id: "fix", type: "task", label: "Request missing information", pool: "p" },
      { id: "m", type: "gateway", label: "Complete", pool: "p" },
      { id: "end", type: "end-event", label: "Done", pool: "p" },
    ];
    const c: AiConnection[] = [
      { sourceId: "s", targetId: "t" }, { sourceId: "t", targetId: "d" },
      { sourceId: "d", targetId: "m", label: "Yes — all required details present" },
      secondBranchLevel
        ? { sourceId: "d", targetId: "m", label: "No" }        // both level
        : { sourceId: "d", targetId: "fix", label: "No" },
      { sourceId: "fix", targetId: "m" },
      { sourceId: "m", targetId: "end" },
    ];
    return layoutBpmnDiagram(e, c);
  };

  it("T3160 — the branch running straight ahead leaves by the RIGHT vertex", () => {
    const o = build(false);
    const yes = o.connectors.find((c) => /all required details/.test(String(c.label ?? "")))!;
    const d = o.elements.find((e) => e.id === "d")!;
    const m = o.elements.find((e) => e.id === "m")!;
    expect(Math.abs((d.y + d.height / 2) - (m.y + m.height / 2)),
      "the two are not level, so the case is not exercised").toBeLessThan(25);
    expect(yes.sourceSide, "a level target must leave by the right vertex").toBe("right");
    expect(yes.sourceOffsetAlong ?? 0.5).toBe(0.5);
  });

  it("T3161 — the other branch keeps a corner, so they never share a vertex", () => {
    const o = build(false);
    const outs = o.connectors.filter((c) => c.type === "sequence" && c.sourceId === "d");
    expect(outs.length).toBe(2);
    expect(new Set(outs.map((c) => c.sourceSide)).size, "both branches left from one point").toBe(2);
  });
});
