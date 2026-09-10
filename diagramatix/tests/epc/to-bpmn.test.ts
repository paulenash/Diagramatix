/**
 * EPC → BPMN. The commercially interesting half of the EPC work: a prospect
 * with an ARIS repository has hundreds of these and no way to bring them
 * anywhere.
 *
 * Two rules carry the whole thing, and both are about events. Most events
 * DISAPPEAR — an EPC alternates event/function, so a faithful import puts a
 * round shape between every two tasks, which is unreadable and is not what the
 * process means. And events straight after a decision are BRANCH CONDITIONS,
 * so their wording belongs on the gateway's outgoing flows. That second rule is
 * the difference between a converted EPC you would publish and one you would
 * delete, and it is what most of this file is about.
 *
 * The other thing under test is what the translator REFUSES. A migration that
 * quietly fixes your process model is worse than one that tells you which
 * twelve places need a human.
 */
import { describe, it, expect } from "vitest";
import { translateEpcToBpmn } from "@/app/lib/diagram/translate/epcToBpmn";
import { renderEpcMappingForPrompt, EPC_TO_BPMN_MAP } from "@/app/lib/diagram/translate/epcBpmnMap";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import type { DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";

/** Terse builders — these diagrams are hand-built fixtures, not layout output. */
let seq = 0;
const el = (id: string, type: string, label: string, extra: Partial<DiagramElement> = {}): DiagramElement => ({
  id, type: type as DiagramElement["type"], label,
  x: 0, y: (seq += 100), width: 160, height: 60, properties: {}, ...extra,
});
const arc = (from: string, to: string, type = "epc-control-flow", label?: string): Connector => ({
  id: `c${from}-${to}`, sourceId: from, targetId: to,
  type: type as Connector["type"], directionType: "directed", routingType: "rectilinear",
  sourceSide: "bottom", targetSide: "top",
  sourceInvisibleLeader: false, targetInvisibleLeader: false,
  waypoints: [], label: label ?? "",
} as Connector);
const diagram = (elements: DiagramElement[], connectors: Connector[]): DiagramData => ({ elements, connectors });

const tr = (d: DiagramData, name = "Credit check") => translateEpcToBpmn(d, { processName: name });

// ── Fixture 1: a straight chain ─────────────────────────────────────────────
const straight = () => diagram(
  [
    el("e1", "epc-event", "Invoice received"),
    el("f1", "epc-function", "Verify invoice"),
    el("e2", "epc-event", "Invoice verified"),
    el("f2", "epc-function", "Post invoice"),
    el("e3", "epc-event", "Invoice posted"),
  ],
  [arc("e1", "f1"), arc("f1", "e2"), arc("e2", "f2"), arc("f2", "e3")],
);

// ── Fixture 2: an XOR branch with named outcome events ──────────────────────
const branched = () => diagram(
  [
    el("e0", "epc-event", "Order received"),
    el("f1", "epc-function", "Check credit rating"),
    el("x1", "epc-xor", ""),
    el("e1", "epc-event", "Credit approved"),
    el("e2", "epc-event", "Credit refused"),
    el("f2", "epc-function", "Release order"),
    el("f3", "epc-function", "Notify customer"),
    el("x2", "epc-xor", ""),
    el("e9", "epc-event", "Credit check complete"),
  ],
  [
    arc("e0", "f1"), arc("f1", "x1"),
    arc("x1", "e1"), arc("x1", "e2"),
    arc("e1", "f2"), arc("e2", "f3"),
    arc("f2", "x2"), arc("f3", "x2"),
    arc("x2", "e9"),
  ],
);

// ── Fixture 3: org units, data and a system ─────────────────────────────────
const assigned = () => diagram(
  [
    el("e1", "epc-event", "Claim received"),
    el("f1", "epc-function", "Assess claim"),
    el("e2", "epc-event", "Claim assessed"),
    el("f2", "epc-function", "Pay claim"),
    el("e3", "epc-event", "Claim paid"),
    el("o1", "epc-org-unit", "Claims"),
    el("o2", "epc-org-unit", "Finance"),
    el("d1", "epc-data", "Claim form"),
    el("s1", "epc-application", "SAP"),
  ],
  [
    arc("e1", "f1"), arc("f1", "e2"), arc("e2", "f2"), arc("f2", "e3"),
    arc("o1", "f1", "epc-org-assignment"),
    arc("o2", "f2", "epc-org-assignment"),
    arc("d1", "f1", "epc-information-flow"),
    arc("s1", "f2", "epc-information-flow"),
  ],
);

describe("most events disappear, and that is the point", () => {
  it("T4078 - the first event becomes a start event and the last an end event", () => {
    const { aiElements } = tr(straight());
    const types = (t: string) => aiElements.filter((e) => e.type === t);
    expect(types("start-event").map((e) => e.label)).toEqual(["Invoice received"]);
    expect(types("end-event").map((e) => e.label)).toEqual(["Invoice posted"]);
  });

  it("T4079 - the event in the middle is dropped, and the tasks connect directly", () => {
    // A faithful import would leave "Invoice verified" between the two tasks.
    // It is a state, not something that happens TO the process.
    const { aiElements, aiConnections, report } = tr(straight());
    expect(aiElements.find((e) => e.label === "Invoice verified")).toBeUndefined();
    expect(report.droppedEvents.some((d) => d.includes("Invoice verified"))).toBe(true);
    expect(aiConnections.some((c) => c.sourceId === "f1" && c.targetId === "f2")).toBe(true);
  });

  it("T4080 - every function becomes a task", () => {
    const { aiElements, report } = tr(straight());
    expect(aiElements.filter((e) => e.type === "task").map((e) => e.label))
      .toEqual(["Verify invoice", "Post invoice"]);
    expect(report.taskCount).toBe(2);
  });
});

describe("events after a decision are branch conditions", () => {
  it("T4081 - their wording lands on the gateway's outgoing FLOWS", () => {
    // The single rule that decides whether the output is publishable.
    const { aiConnections } = tr(branched());
    const fromGateway = aiConnections.filter((c) => c.sourceId === "x1");
    expect(fromGateway.map((c) => c.label).sort()).toEqual(["Credit approved", "Credit refused"]);
  });

  it("T4082 - and the flows go straight to the tasks, not to an event", () => {
    const { aiElements, aiConnections } = tr(branched());
    expect(aiElements.find((e) => e.label === "Credit approved")).toBeUndefined();
    const targets = aiConnections.filter((c) => c.sourceId === "x1").map((c) => c.targetId).sort();
    expect(targets).toEqual(["f2", "f3"]);
  });

  it("T4083 - an XOR becomes an exclusive gateway, AND parallel, OR inclusive", () => {
    const { aiElements } = tr(branched());
    const gws = aiElements.filter((e) => e.type === "gateway");
    expect(gws).toHaveLength(2);
    for (const g of gws) expect(g.gatewayType).toBe("exclusive");

    const parallel = tr(diagram(
      [el("e0", "epc-event", "Started"), el("a1", "epc-and", ""), el("f1", "epc-function", "A"), el("f2", "epc-function", "B")],
      [arc("e0", "a1"), arc("a1", "f1"), arc("a1", "f2")],
    ));
    expect(parallel.aiElements.find((e) => e.type === "gateway")!.gatewayType).toBe("parallel");

    const inclusive = tr(diagram(
      [el("e0", "epc-event", "Started"), el("f0", "epc-function", "Decide"), el("o1", "epc-or", ""), el("f1", "epc-function", "A"), el("f2", "epc-function", "B")],
      [arc("e0", "f0"), arc("f0", "o1"), arc("o1", "f1"), arc("o1", "f2")],
    ));
    expect(inclusive.aiElements.find((e) => e.type === "gateway")!.gatewayType).toBe("inclusive");
  });

  it("T4084 - the branch conditions are reported, so nothing vanishes silently", () => {
    const { report } = tr(branched());
    expect(report.branchLabels).toHaveLength(2);
    expect(report.branchLabels.join(" ")).toContain("Credit approved");
  });
});

describe("lanes come from the model, not from geometry", () => {
  it("T4085 - each org unit becomes a lane and its function goes in it", () => {
    // This is where an EPC import beats a BPMN import: EPC records who does the
    // work as an explicit RELATIONSHIP. Every fixture element sits at x=0, so a
    // geometric guess has nothing to work with and would put everything in one
    // lane — which is exactly what makes this assertion meaningful.
    const { aiElements, report } = tr(assigned());
    const lanes = aiElements.filter((e) => e.type === "lane");
    expect(lanes.map((l) => l.label).sort()).toEqual(["Claims", "Finance"]);
    expect(report.laneCount).toBe(2);

    const lane = (id: string) => aiElements.find((e) => e.id === id)!.lane;
    const laneNamed = (n: string) => lanes.find((l) => l.label === n)!.id;
    expect(lane("f1")).toBe(laneNamed("Claims"));
    expect(lane("f2")).toBe(laneNamed("Finance"));
  });

  it("T4086 - an information object becomes a data object, out of the sequence", () => {
    const { aiElements, aiConnections } = tr(assigned());
    const data = aiElements.find((e) => e.type === "data-object");
    expect(data?.label).toBe("Claim form");
    // Attached by association, never carrying sequence.
    const touching = aiConnections.filter((c) => c.sourceId === "d1" || c.targetId === "d1");
    expect(touching).toHaveLength(1);
    expect(touching[0].type).toBeUndefined();
    // It sits in its function's lane so it lands inside the pool.
    expect(data!.lane).toBe(aiElements.find((e) => e.id === "f1")!.lane);
  });

  it("T4087 - an application system becomes a black-box IT pool, never a data store", () => {
    // The house rule: a system of record IS the black-box IT system pool.
    const { aiElements, aiConnections, report } = tr(assigned());
    expect(aiElements.some((e) => e.type === "data-store")).toBe(false);
    const sys = aiElements.find((e) => e.id === "s1")!;
    expect(sys.type).toBe("pool");
    expect(sys.poolType).toBe("black-box");
    expect(sys.isSystem).toBe(true);
    expect(report.systemPoolCount).toBe(1);
    expect(aiConnections.find((c) => c.sourceId === "s1")?.type).toBe("message");
  });

  it("T4088 - a process interface becomes a call activity", () => {
    const { aiElements, report } = tr(diagram(
      [el("e0", "epc-event", "Started"), el("f1", "epc-function", "Do it"), el("i1", "epc-interface", "Order to Cash")],
      [arc("e0", "f1"), arc("f1", "i1")],
    ));
    const call = aiElements.find((e) => e.id === "i1")!;
    expect(call.type).toBe("subprocess");
    expect(call.subprocessType).toBe("call");
    expect(report.callActivityCount).toBe(1);
  });
});

describe("what it refuses to interpret", () => {
  it("T4089 - an unbalanced split is reported and NOT closed", () => {
    const { report, aiElements } = tr(diagram(
      [
        el("e0", "epc-event", "Started"), el("f1", "epc-function", "Check credit"),
        el("x1", "epc-xor", ""), el("e1", "epc-event", "Approved"), el("e2", "epc-event", "Refused"),
        el("f2", "epc-function", "Release"), el("f3", "epc-function", "Reject"),
      ],
      [arc("e0", "f1"), arc("f1", "x1"), arc("x1", "e1"), arc("x1", "e2"), arc("e1", "f2"), arc("e2", "f3")],
    ));
    expect(report.refusals.some((r) => /XOR split/.test(r))).toBe(true);
    // No join was invented to tidy it up.
    expect(aiElements.filter((e) => e.type === "gateway")).toHaveLength(1);
  });

  it("T4090 - an event that decides is refused, because the condition is nowhere", () => {
    const { report } = tr(diagram(
      [el("e0", "epc-event", "Order received"), el("x1", "epc-xor", ""), el("f1", "epc-function", "A"), el("f2", "epc-function", "B")],
      [arc("e0", "x1"), arc("x1", "f1"), arc("x1", "f2")],
    ));
    expect(report.refusals.some((r) => r.includes("cannot decide"))).toBe(true);
  });

  it("T4091 - a connector that both splits and joins is refused", () => {
    const { report } = tr(diagram(
      [
        el("f1", "epc-function", "A"), el("f2", "epc-function", "B"), el("x1", "epc-xor", ""),
        el("e1", "epc-event", "C"), el("e2", "epc-event", "D"),
      ],
      [arc("f1", "x1"), arc("f2", "x1"), arc("x1", "e1"), arc("x1", "e2")],
    ));
    expect(report.refusals.some((r) => /both joins/.test(r))).toBe(true);
  });

  it("T4092 - two departments on one function is refused, and the first is used", () => {
    // It still produces a lane — refusing to emit anything would make the whole
    // conversion fail on one ambiguity. It says which one it picked.
    const { report, aiElements } = tr(diagram(
      [
        el("e0", "epc-event", "Started"), el("f1", "epc-function", "Approve"), el("e1", "epc-event", "Approved"),
        el("o1", "epc-org-unit", "Finance"), el("o2", "epc-org-unit", "Legal"),
      ],
      [arc("e0", "f1"), arc("f1", "e1"), arc("o1", "f1", "epc-org-assignment"), arc("o2", "f1", "epc-org-assignment")],
    ));
    expect(report.refusals.some((r) => r.includes("organisational units"))).toBe(true);
    expect(aiElements.find((e) => e.id === "f1")!.lane).toBeTruthy();
  });

  it("T4093 - a clean EPC refuses nothing", () => {
    // The floor. Refusals that fire on correct input are noise, and noise is how
    // a real one gets ignored.
    expect(tr(branched()).report.refusals).toEqual([]);
    expect(tr(straight()).report.refusals).toEqual([]);
  });
});

describe("the output is a diagram the editor can open", () => {
  for (const [name, build] of [["straight", straight], ["branched", branched], ["assigned", assigned]] as const) {
    it(`T${{ straight: 4094, branched: 4095, assigned: 4096 }[name]} - ${name} lays out with waypoints on every connector`, () => {
      // "A connector without waypoints crashes the editor" is a real regression
      // (tests/translate/flowchartToBpmn.test.ts). Running the translation
      // through the actual BPMN layout is the only way to catch it here.
      const { aiElements, aiConnections } = tr(build());
      const data = layoutBpmnDiagram(aiElements, aiConnections);
      expect(data.elements.length).toBeGreaterThan(0);
      for (const c of data.connectors) {
        expect(c.waypoints.length, `${c.id} has no waypoints`).toBeGreaterThan(0);
      }
      // Every connector must resolve to real elements.
      const ids = new Set(data.elements.map((e) => e.id));
      for (const c of data.connectors) {
        expect(ids.has(c.sourceId) && ids.has(c.targetId), `${c.id} dangles`).toBe(true);
      }
    });
  }
});

describe("the mapping table drives the prompt as well as the code", () => {
  it("T4097 - the prompt line is generated from the table", () => {
    // The flowchart precedent's best idea: one table, two consumers, so a
    // translation rule cannot exist in the code and not in the prompt.
    const text = renderEpcMappingForPrompt();
    for (const m of Object.values(EPC_TO_BPMN_MAP)) {
      expect(text, `the table's "${m.epc}" phrase is missing from the prompt`).toContain(m.promptText);
    }
  });

  it("T4098 - the prompt tells the model to drop the middle events", () => {
    // Without this the AI image path produces the very thing the code path
    // avoids: a round shape between every two tasks.
    const text = renderEpcMappingForPrompt();
    expect(text).toMatch(/drop the rest/i);
    expect(text).toMatch(/flow labels/i);
  });
});
