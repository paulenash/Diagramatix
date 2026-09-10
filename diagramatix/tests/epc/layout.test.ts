/**
 * The EPC vertical layout, and the rules it can only REPORT.
 *
 * An AI plan never passes through `canConnect` — the layout builds the arcs
 * itself — so every rule the editor vetoes while you draw is unenforced on the
 * generated path unless the layout checks it. That is the half of this file
 * that matters: `layoutEpcDiagram` is the last place an invalid EPC can be
 * noticed before it looks like a clean success.
 *
 * It reports and does not repair. Inserting the missing event between two
 * functions would produce a valid-looking chain containing a state nobody
 * described, which is worse than a chain that says which two steps are wrong.
 */
import { describe, it, expect } from "vitest";
import { layoutEpcDiagram, mapEpcType, type AiEpcPlan } from "@/app/lib/diagram/layoutEpc";
import type { LayoutDiagnostic } from "@/app/lib/diagram/bpmnLayout";

/** Lay out a plan, capturing everything it could not take at face value. */
function lay(plan: AiEpcPlan) {
  const diagnostics: LayoutDiagnostic[] = [];
  const data = layoutEpcDiagram(plan, { onDiagnostic: (d) => diagnostics.push(d) });
  return { data, diagnostics, kinds: diagnostics.map((d) => d.kind) };
}

/** The smallest correct EPC: event → function → event. */
const straightChain: AiEpcPlan = {
  elements: [
    { id: "e1", type: "event", label: "Invoice received" },
    { id: "f1", type: "function", label: "Verify invoice", org: "Accounts Payable", data: ["Invoice"], system: ["SAP"] },
    { id: "e2", type: "event", label: "Invoice verified" },
  ],
  connections: [
    { sourceId: "e1", targetId: "f1" },
    { sourceId: "f1", targetId: "e2" },
  ],
};

describe("the chain runs down the page", () => {
  it("T4055 - a straight chain stacks vertically, in order", () => {
    const { data } = lay(straightChain);
    const y = (id: string) => data.elements.find((e) => e.id === id)!.y;
    expect(y("e1")).toBeLessThan(y("f1"));
    expect(y("f1")).toBeLessThan(y("e2"));
  });

  it("T4056 - the spine shares one vertical axis", () => {
    // Vertical is the whole point: an EPC drawn left-to-right reads as wrong to
    // anyone who has used ARIS. A chain that drifts sideways has stopped being
    // one, so the centres must agree.
    const { data } = lay(straightChain);
    const cx = ["e1", "f1", "e2"].map((id) => {
      const e = data.elements.find((x) => x.id === id)!;
      return e.x + e.width / 2;
    });
    for (const c of cx) expect(Math.abs(c - cx[0])).toBeLessThan(2);
  });

  it("T4057 - every arc has waypoints", () => {
    // A connector with no waypoints crashes the editor — the regression
    // tests/translate/flowchartToBpmn.test.ts guards for BPMN.
    const { data } = lay(straightChain);
    expect(data.connectors.length).toBeGreaterThan(0);
    for (const c of data.connectors) {
      expect(c.waypoints.length, `${c.id} has no waypoints`).toBeGreaterThan(0);
    }
  });
});

describe("satellites sit beside the function, never in the chain", () => {
  it("T4058 - the org unit is placed to the RIGHT, data and system to the LEFT", () => {
    const { data } = lay(straightChain);
    const fn = data.elements.find((e) => e.id === "f1")!;
    const org = data.elements.find((e) => e.type === "epc-org-unit")!;
    const info = data.elements.find((e) => e.type === "epc-data")!;
    const sys = data.elements.find((e) => e.type === "epc-application")!;
    expect(org.x).toBeGreaterThan(fn.x + fn.width);
    expect(info.x + info.width).toBeLessThan(fn.x);
    expect(sys.x + sys.width).toBeLessThan(fn.x);
    // Two on the same side must not land on top of each other.
    expect(Math.abs(info.x - sys.x)).toBeGreaterThan(20);
  });

  it("T4059 - satellites do not displace the chain", () => {
    // The chain must lay out identically whether or not the function carries
    // assignments — a satellite that pushed the spine sideways would make the
    // process shift about depending on how much detail someone filled in.
    const bare: AiEpcPlan = {
      elements: straightChain.elements.map(({ id, type, label }) => ({ id, type, label })),
      connections: straightChain.connections,
    };
    const withSats = lay(straightChain).data;
    const without = lay(bare).data;
    for (const id of ["e1", "f1", "e2"]) {
      const a = withSats.elements.find((e) => e.id === id)!;
      const b = without.elements.find((e) => e.id === id)!;
      expect({ id, x: a.x, y: a.y }).toEqual({ id, x: b.x, y: b.y });
    }
  });

  it("T4060 - the three arc kinds are distinguished", () => {
    // Only one of them carries sequence, and getting that wrong is what makes a
    // converted EPC unreadable later.
    const { data } = lay(straightChain);
    const byType = (t: string) => data.connectors.filter((c) => c.type === t);
    expect(byType("epc-control-flow")).toHaveLength(2);
    expect(byType("epc-org-assignment")).toHaveLength(1);
    expect(byType("epc-information-flow")).toHaveLength(2); // the data object and the system

    // Assignment is not a direction, so it carries no arrowhead.
    expect(byType("epc-org-assignment")[0].directionType).toBe("non-directed");
    // Information flow's direction IS its meaning — an open head says "reads".
    expect(byType("epc-information-flow")[0].directionType).toBe("open-directed");
    expect(byType("epc-control-flow")[0].directionType).toBe("directed");
  });
});

describe("a rework loop still reads as a process", () => {
  // The most common thing an EPC draws, and the case a longest-path ranker gets
  // wrong on its own: a loop-back looks like forward progress, so the relaxation
  // pushes the loop's head down a rank at a time until the iteration cap and the
  // function lands BELOW the branch that returns to it.
  const rework: AiEpcPlan = {
    elements: [
      { id: "e0", type: "event", label: "Draft submitted" },
      { id: "f1", type: "function", label: "Review draft", org: "Quality Assurance" },
      { id: "x1", type: "xor", label: "" },
      { id: "e1", type: "event", label: "Changes requested" },
      { id: "e2", type: "event", label: "Draft accepted" },
      { id: "f2", type: "function", label: "Rework draft", org: "Author" },
      { id: "e3", type: "event", label: "Draft reworked" },
    ],
    connections: [
      { sourceId: "e0", targetId: "f1" }, { sourceId: "f1", targetId: "x1" },
      { sourceId: "x1", targetId: "e1" }, { sourceId: "x1", targetId: "e2" },
      { sourceId: "e1", targetId: "f2" }, { sourceId: "f2", targetId: "e3" },
      { sourceId: "e3", targetId: "f1" }, // the loop back
    ],
  };

  it("T4072 - the loop head stays above everything it leads to", () => {
    const { data } = lay(rework);
    const y = (id: string) => data.elements.find((e) => e.id === id)!.y;
    expect(y("e0")).toBeLessThan(y("f1"));
    expect(y("f1")).toBeLessThan(y("x1"));
    expect(y("x1")).toBeLessThan(y("e1"));
    expect(y("e1")).toBeLessThan(y("f2"));
    expect(y("f2")).toBeLessThan(y("e3"));
  });

  it("T4073 - the loop-back arc still exists, and is the only one that climbs", () => {
    // Excluded from RANKING, not from the diagram. A loop-back is part of the
    // process; it just is not what decides which row something sits in.
    const { data } = lay(rework);
    const back = data.connectors.find((c) => c.sourceId === "e3" && c.targetId === "f1");
    expect(back, "the loop back must survive").toBeTruthy();
    const climbs = data.connectors.filter((c) => {
      const s = data.elements.find((e) => e.id === c.sourceId)!;
      const t = data.elements.find((e) => e.id === c.targetId)!;
      return c.type === "epc-control-flow" && t.y < s.y;
    });
    expect(climbs.map((c) => c.id)).toEqual([back!.id]);
  });
});

describe("what deflects an arc, and what does not", () => {
  it("T4074 - the spine is solid: an arc does not run through a function", () => {
    // routing.ts decides this by TYPE (SEQ_OBSTACLE_TYPES). Before EPC was added
    // to that list no epc-* shape deflected anything, so a loop-back drew
    // straight through every box it passed.
    const { data } = lay({
      elements: [
        { id: "e0", type: "event", label: "Started" },
        { id: "f1", type: "function", label: "Do the work" },
        { id: "e1", type: "event", label: "Done" },
        { id: "f2", type: "function", label: "Check it" },
        { id: "e2", type: "event", label: "Checked" },
      ],
      connections: [
        { sourceId: "e0", targetId: "f1" }, { sourceId: "f1", targetId: "e1" },
        { sourceId: "e1", targetId: "f2" }, { sourceId: "f2", targetId: "e2" },
        { sourceId: "e2", targetId: "f1" }, // climbs back past e1 and f2
      ],
    });
    const back = data.connectors.find((c) => c.sourceId === "e2" && c.targetId === "f1")!;
    const boxes = data.elements.filter((e) => ["e1", "f2"].includes(e.id));
    // Every leg of the returning arc must clear both boxes it passes.
    for (let i = 1; i < back.waypoints.length; i++) {
      const a = back.waypoints[i - 1], b = back.waypoints[i];
      for (const box of boxes) {
        const crossesX = Math.min(a.x, b.x) < box.x + box.width && Math.max(a.x, b.x) > box.x;
        const crossesY = Math.min(a.y, b.y) < box.y + box.height && Math.max(a.y, b.y) > box.y;
        expect(crossesX && crossesY, `the loop-back runs through ${box.label}`).toBe(false);
      }
    }
  });

  it("T4075 - an assignment arc is a straight line, never a routed path", () => {
    // Worth recording what this test does NOT claim. The obvious assertion —
    // "a satellite never deflects a control-flow arc" — cannot be observed:
    // a detour hugs the spine and a satellite sits SAT_GAP beyond it, so the
    // two never meet whatever the obstacle list says. An assertion that cannot
    // fail is not a test, so this asserts the thing that IS load-bearing.
    //
    // Assignment and information arcs are drawn DIRECT, orthogonal to the
    // spine. Routing them rectilinearly would send them stepping around the
    // chain to reach a box sitting immediately beside it.
    const { data } = lay(straightChain);
    for (const c of data.connectors) {
      if (c.type === "epc-control-flow") continue;
      expect(c.routingType, `${c.id} should be direct`).toBe("direct");
      // Purely HORIZONTAL — every waypoint on one line, no vertical jog. The
      // path carries leader stubs, so this is about the shape, not the count:
      // the whole point is that the spine stays readable as the process with
      // everything else hanging off it sideways.
      const ys = c.waypoints.map((w) => w.y);
      expect(Math.max(...ys) - Math.min(...ys), `${c.id} jogs vertically`).toBeLessThan(12);
    }
  });

  it("T4076 - an explicitly drawn satellite is placed beside its function, not in the chain", () => {
    // The attribute form never reaches the ranking code — the satellites are
    // synthesised after it. An imported or hand-built plan carries them as real
    // elements, and THAT is the path that has to be pulled out of the spine.
    const { data } = lay({
      elements: [
        { id: "e0", type: "event", label: "Started" },
        { id: "f1", type: "function", label: "Approve" },
        { id: "e1", type: "event", label: "Approved" },
        { id: "o1", type: "org-unit", label: "Finance" },
        { id: "d1", type: "information object", label: "Application form" },
      ],
      connections: [
        { sourceId: "e0", targetId: "f1" }, { sourceId: "f1", targetId: "e1" },
        { sourceId: "o1", targetId: "f1" }, { sourceId: "d1", targetId: "f1" },
      ],
    });
    const at = (id: string) => data.elements.find((e) => e.id === id)!;
    const f1 = at("f1"), o1 = at("o1"), d1 = at("d1");
    // Beside, on the correct sides…
    expect(o1.x).toBeGreaterThan(f1.x + f1.width);
    expect(d1.x + d1.width).toBeLessThan(f1.x);
    // …and level with it, which is only true if they never took a rank of
    // their own. In the chain they would sit a whole row below.
    expect(Math.abs((o1.y + o1.height / 2) - (f1.y + f1.height / 2))).toBeLessThan(10);
    expect(Math.abs((d1.y + d1.height / 2) - (f1.y + f1.height / 2))).toBeLessThan(10);
    // And the chain itself is unbroken: the event below the function follows it.
    expect(at("e1").y).toBeGreaterThan(f1.y + f1.height);
  });
});

describe("the rules canConnect cannot reach", () => {
  it("T4061 - E3: an event may not be followed by an XOR split", () => {
    // THE classic EPC rule, and the one most implementations miss. An event is
    // passive; it cannot choose. Only a function can decide.
    const { kinds } = lay({
      elements: [
        { id: "e1", type: "event", label: "Invoice received" },
        { id: "x1", type: "xor", label: "" },
        { id: "e2", type: "event", label: "Under limit" },
        { id: "e3", type: "event", label: "Over limit" },
      ],
      connections: [
        { sourceId: "e1", targetId: "x1" },
        { sourceId: "x1", targetId: "e2" },
        { sourceId: "x1", targetId: "e3" },
      ],
    });
    expect(kinds).toContain("epc-event-decides");
  });

  it("T4062 - an AND split after an event is fine, because it is not a choice", () => {
    // The other half of E3, and the reason it cannot be written as "an event may
    // not be followed by a connector".
    const { kinds } = lay({
      elements: [
        { id: "e1", type: "event", label: "Order received" },
        { id: "a1", type: "and", label: "" },
        { id: "f1", type: "function", label: "Reserve stock" },
        { id: "f2", type: "function", label: "Check credit" },
      ],
      connections: [
        { sourceId: "e1", targetId: "a1" },
        { sourceId: "a1", targetId: "f1" },
        { sourceId: "a1", targetId: "f2" },
      ],
    });
    expect(kinds).not.toContain("epc-event-decides");
  });

  it("T4063 - E1: two functions may not be adjacent", () => {
    const { diagnostics } = lay({
      elements: [
        { id: "e1", type: "event", label: "Order received" },
        { id: "f1", type: "function", label: "Pick goods" },
        { id: "f2", type: "function", label: "Pack goods" },
        { id: "e2", type: "event", label: "Goods packed" },
      ],
      connections: [
        { sourceId: "e1", targetId: "f1" },
        { sourceId: "f1", targetId: "f2" },
        { sourceId: "f2", targetId: "e2" },
      ],
    });
    const d = diagnostics.find((x) => x.kind === "epc-alternation");
    expect(d, "function → function must be reported").toBeTruthy();
    expect(d!.elementId).toBe("f1");
    // The report has to name BOTH ends or it is not actionable.
    expect(d!.detail).toContain("Pack goods");
  });

  it("T4064 - E2: a chain that does not end on an event says so", () => {
    const { diagnostics } = lay({
      elements: [
        { id: "e1", type: "event", label: "Order received" },
        { id: "f1", type: "function", label: "Pick goods" },
      ],
      connections: [{ sourceId: "e1", targetId: "f1" }],
    });
    const d = diagnostics.filter((x) => x.kind === "epc-not-event-bounded");
    expect(d).toHaveLength(1);
    expect(d[0].elementId).toBe("f1");
  });

  it("T4065 - E4: a connector that both splits and joins", () => {
    const { kinds } = lay({
      elements: [
        { id: "f1", type: "function", label: "A" },
        { id: "f2", type: "function", label: "B" },
        { id: "x1", type: "xor", label: "" },
        { id: "e1", type: "event", label: "C" },
        { id: "e2", type: "event", label: "D" },
      ],
      connections: [
        { sourceId: "f1", targetId: "x1" },
        { sourceId: "f2", targetId: "x1" },
        { sourceId: "x1", targetId: "e1" },
        { sourceId: "x1", targetId: "e2" },
      ],
    });
    expect(kinds).toContain("epc-connector-both-ways");
  });

  it("T4066 - E5: an unbalanced split is reported and NOT repaired", () => {
    const plan: AiEpcPlan = {
      elements: [
        { id: "e0", type: "event", label: "Started" },
        { id: "f1", type: "function", label: "Check credit" },
        { id: "x1", type: "xor", label: "" },
        { id: "e1", type: "event", label: "Approved" },
        { id: "e2", type: "event", label: "Refused" },
      ],
      connections: [
        { sourceId: "e0", targetId: "f1" },
        { sourceId: "f1", targetId: "x1" },
        { sourceId: "x1", targetId: "e1" },
        { sourceId: "x1", targetId: "e2" },
      ],
    };
    const { data, kinds } = lay(plan);
    expect(kinds).toContain("epc-unbalanced-connector");
    // Reported, never repaired: no join was invented to close the branch. The
    // shape of the fix depends on what the process actually does.
    expect(data.elements.filter((e) => e.type === "epc-xor")).toHaveLength(1);
    expect(data.elements).toHaveLength(plan.elements.length);
  });

  it("T4067 - E7: two org units on one function", () => {
    // Explicitly drawn, because the attribute form CANNOT express it — `org` is
    // one string. This is the path a hand-built or imported plan takes.
    const { kinds } = lay({
      elements: [
        { id: "e1", type: "event", label: "Started" },
        { id: "f1", type: "function", label: "Approve" },
        { id: "e2", type: "event", label: "Approved" },
        { id: "o1", type: "org-unit", label: "Finance" },
        { id: "o2", type: "org-unit", label: "Legal" },
      ],
      connections: [
        { sourceId: "e1", targetId: "f1" },
        { sourceId: "f1", targetId: "e2" },
        { sourceId: "o1", targetId: "f1" },
        { sourceId: "o2", targetId: "f1" },
      ],
    });
    expect(kinds).toContain("epc-multiple-org");
  });

  it("T4068 - E6: an org unit hung off an event is reported, not silently dropped", () => {
    const { diagnostics } = lay({
      elements: [
        { id: "e1", type: "event", label: "Started" },
        { id: "f1", type: "function", label: "Approve" },
        { id: "e2", type: "event", label: "Approved" },
        { id: "o1", type: "org-unit", label: "Finance" },
      ],
      connections: [
        { sourceId: "e1", targetId: "f1" },
        { sourceId: "f1", targetId: "e2" },
        { sourceId: "o1", targetId: "e1" },
      ],
    });
    expect(diagnostics.map((d) => d.kind)).toContain("epc-assignment-not-on-function");
  });

  it("T4069 - a correct EPC reports nothing at all", () => {
    // The floor. If the happy path emitted diagnostics they would be noise, and
    // noise is how a real finding gets ignored.
    const { diagnostics } = lay({
      elements: [
        { id: "e0", type: "event", label: "Invoice received" },
        { id: "f1", type: "function", label: "Check credit rating", org: "Credit Control" },
        { id: "x1", type: "xor", label: "" },
        { id: "e1", type: "event", label: "Credit approved" },
        { id: "e2", type: "event", label: "Credit refused" },
        { id: "f2", type: "function", label: "Release order" },
        { id: "f3", type: "function", label: "Notify customer" },
        { id: "e3", type: "event", label: "Order released" },
        { id: "e4", type: "event", label: "Customer notified" },
        { id: "x2", type: "xor", label: "" },
        { id: "e5", type: "event", label: "Credit check complete" },
      ],
      connections: [
        { sourceId: "e0", targetId: "f1" },
        { sourceId: "f1", targetId: "x1" },
        { sourceId: "x1", targetId: "e1", label: "approved" },
        { sourceId: "x1", targetId: "e2", label: "refused" },
        { sourceId: "e1", targetId: "f2" },
        { sourceId: "e2", targetId: "f3" },
        { sourceId: "f2", targetId: "e3" },
        { sourceId: "f3", targetId: "e4" },
        { sourceId: "e3", targetId: "x2" },
        { sourceId: "e4", targetId: "x2" },
        { sourceId: "x2", targetId: "e5" },
      ],
    });
    expect(diagnostics).toEqual([]);
  });
});

describe("the plan format itself carries two of the rules", () => {
  it("T4070 - a branch label lands on the ARC, not only in the event", () => {
    // The rule that makes a converted EPC readable: the events after a split are
    // branch conditions, and on conversion they become the labels on the
    // gateway's outgoing flows. They have to survive layout to get there.
    const { data } = lay({
      elements: [
        { id: "f1", type: "function", label: "Check credit" },
        { id: "x1", type: "xor", label: "" },
        { id: "e1", type: "event", label: "Approved" },
        { id: "e2", type: "event", label: "Refused" },
      ],
      connections: [
        { sourceId: "f1", targetId: "x1" },
        { sourceId: "x1", targetId: "e1", label: "approved" },
        { sourceId: "x1", targetId: "e2", label: "refused" },
      ],
    });
    const labels = data.connectors.map((c) => c.label).filter(Boolean).sort();
    expect(labels).toEqual(["approved", "refused"]);
  });

  it("T4071 - an unrecognised type becomes an event, not a function", () => {
    // An EPC is event-bounded and alternating, so a label the mapper does not
    // recognise is far more often a state than a step. Guessing "function"
    // would break E2 at both ends of most chains.
    expect(mapEpcType("state")).toBe("epc-event");
    expect(mapEpcType("wibble")).toBe("epc-event");
    expect(mapEpcType("task")).toBe("epc-function");
    expect(mapEpcType("XOR")).toBe("epc-xor");
    expect(mapEpcType("process interface")).toBe("epc-interface");
  });
});
