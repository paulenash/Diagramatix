/**
 * Paul, 2026-09-11: the gateway question, Entity Drift, and the way back.
 *
 * The first is a prompt property and the other two are UI facts, so most of
 * this file is source-text tripwires. That is the right tool: what regresses is
 * a gate quietly disappearing or a type list drifting apart, and every one of
 * those still compiles when it is wrong.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { mergeRefinement } from "@/app/lib/ai/refineFlowchartBpmn";
import { findDrillBackAnchor } from "@/app/lib/diagram/drillBackAnchor";
import type { AiElement, AiConnection } from "@/app/lib/diagram/bpmnLayout";
import type { DiagramElement, Connector } from "@/app/lib/diagram/types";

const read = (p: string) => readFileSync(p, "utf8");

describe("item 1 — the gateway asks the question, the flows answer it", () => {
  const prompt = () => read("app/lib/ai/refineEpcBpmn.ts");

  it("T4139 - the pass is told to write the gateway's question and the answers", () => {
    // An EPC connector is an unlabelled circle, so every converted gateway
    // arrives nameless with its branches carrying the outcome events' wording.
    // BPMN says it the other way round.
    const s = prompt();
    expect(s).toMatch(/GATEWAY DECISIONS/);
    expect(s, "the gateway must be asked for a question").toMatch(/ending in .\?./);
    expect(s, "the flows must be asked for answers").toMatch(/"Yes" \/ "No"/);
  });

  it("T4140 - …and warned that the mapping must not move", () => {
    // The failure that matters: swapping which answer goes on which branch
    // inverts the process and leaves a diagram that looks perfectly correct.
    const s = prompt();
    expect(s).toMatch(/MAPPING MUST NOT MOVE/);
    expect(s, "it must be told to do nothing when unsure").toMatch(/leave that gateway's labels exactly as they are/);
  });

  it("T4141 - a join and a parallel gateway are left alone", () => {
    // A join has nothing to ask, and a parallel gateway takes every branch, so
    // there is no question. Labelling them would invent a decision.
    const s = prompt();
    expect(s).toMatch(/Leave joins unlabelled/);
    expect(s).toMatch(/Leave parallel gateways unlabelled/);
  });

  it("T4142 - a label can only land on the flow it was written for", () => {
    // The structural half, and the one the prompt cannot guarantee: the merge
    // matches a refined connection to the deterministic one by (source,
    // target). A response that names a flow which does not exist changes
    // nothing, rather than having its label absorbed by whichever flow came
    // next in the array.
    const elements: AiElement[] = [
      { id: "g1", type: "gateway", label: "", pool: "p", gatewayType: "exclusive" },
      { id: "t1", type: "task", label: "Release order", pool: "p" },
      { id: "t2", type: "task", label: "Notify customer", pool: "p" },
    ];
    const connections: AiConnection[] = [
      { sourceId: "g1", targetId: "t1", type: "sequence", label: "Credit approved" },
      { sourceId: "g1", targetId: "t2", type: "sequence", label: "Credit refused" },
    ];
    const refined = {
      elements: [{ id: "g1", label: "Credit approved?" }],
      connections: [
        // Deliberately out of order, plus one flow that does not exist.
        { sourceId: "g1", targetId: "t2", label: "No" },
        { sourceId: "g1", targetId: "NOWHERE", label: "Maybe" },
        { sourceId: "g1", targetId: "t1", label: "Yes" },
      ],
    };
    const out = mergeRefinement(elements, connections, refined as never);

    expect(out.elements.find((e) => e.id === "g1")!.label).toBe("Credit approved?");
    const label = (to: string) => out.connections.find((c) => c.targetId === to)!.label;
    expect(label("t1"), "the approved branch must keep its own answer").toBe("Yes");
    expect(label("t2")).toBe("No");
    expect(out.connections).toHaveLength(2);       // the invented flow is not added
    expect(out.connections.some((c) => c.label === "Maybe")).toBe(false);
  });
});

describe("item 2 — Entity Drift does not apply to an EPC", () => {
  it("T4143 - the button is hidden on an EPC diagram", () => {
    // It rings pool / lane, participant, IT system, document and data-store
    // names against the project's Entity Structure. An EPC has none of those,
    // so the check would answer "no drift" every time — which reads as a pass.
    const editor = read("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
    expect(editor).toContain('{entityHasNames && diagramType !== "epc" && (');
  });
});

describe("item 3 — there is always a way back", () => {
  const canvas = () => read("app/components/canvas/Canvas.tsx");

  it("T4144 - which element carries the marker is ONE decision", () => {
    // It used to be a type test written out at both call sites. An EPC has
    // neither a start-event nor an initial-state, so a drilled-into EPC had no
    // way back at all — and a type list in two places is one edit away from the
    // marker appearing in one render path and not the other.
    const src = canvas();
    expect(src).toContain("const drillBackAnchorId = useMemo(");
    expect(src, "the rule must live in the shared function").toContain("findDrillBackAnchor(");
    const uses = (src.match(/onDrillBack=\{el\.id === drillBackAnchorId \? onDrillBack : undefined\}/g) ?? []).length;
    expect(uses, "both render paths must ask the same question").toBe(2);
    // The old type test must be gone from BOTH, or one path still disagrees.
    expect(src).not.toMatch(/onDrillBack=\{\(el\.type === "start-event"/);
  });

  it("T4145 - an EPC's anchor is the event nothing flows into", () => {
    // The same idea as a start event, in a notation with no start symbol.
    // The first version of this read Canvas's SOURCE and stayed green when the
    // EPC branch was neutered, because the string it looked for occurs twice in
    // that file. The rule is a pure function now, so this calls it.
    const el = (id: string, type: string, y: number): DiagramElement => ({
      id, type: type as DiagramElement["type"], label: id,
      x: 0, y, width: 160, height: 50, properties: {},
    });
    const arc = (from: string, to: string, type = "epc-control-flow"): Connector =>
      ({ id: `c${from}${to}`, sourceId: from, targetId: to, type, waypoints: [] } as unknown as Connector);

    const els = [el("e1", "epc-event", 100), el("f1", "epc-function", 200), el("e2", "epc-event", 300)];
    const arcs = [arc("e1", "f1"), arc("f1", "e2")];
    expect(findDrillBackAnchor(els, arcs, "epc")).toBe("e1");

    // An ASSIGNMENT arc does not stop something being the start of the chain —
    // only control flow counts. This has to be tested on the START element: put
    // the assignment on a function that already has inbound control flow and
    // counting every arc changes nothing, which is how the first version of
    // this stayed green with the filter removed.
    //
    // A chain beginning on a function breaks E2, and real imported models do it
    // constantly — the way back must not depend on the model being correct.
    // The start sits BELOW the element it leads to, so the cycle fallback (top-left)
    // would give a different answer. Without that, counting every arc still lands on
    // the right element by accident and the test proves nothing.
    const startsOnFn = [el("f0", "epc-function", 300), el("e9", "epc-event", 100), el("o1", "epc-org-unit", 300)];
    const withAssignment = [arc("f0", "e9"), arc("o1", "f0", "epc-org-assignment")];
    expect(
      findDrillBackAnchor(startsOnFn, withAssignment, "epc"),
      "an assignment arc was counted as inbound control flow",
    ).toBe("f0");

    // A chain that is entirely a cycle has no start: it must still offer a way
    // back rather than leaving the reader stranded inside the diagram.
    const cycle = [arc("e1", "f1"), arc("f1", "e2"), arc("e2", "e1")];
    expect(findDrillBackAnchor(els, cycle, "epc")).toBe("e1"); // top-left

    // A BPMN diagram still anchors on its start event, not on geometry — and
    // NOT on a start event mounted on the boundary of a task, which is where
    // something is caught mid-process rather than where the process begins.
    // The boundary one sits higher on purpose: without the guard it would win
    // on the top-left tie-break.
    const bpmn: DiagramElement[] = [
      { ...el("b1", "start-event", 20), boundaryHostId: "t1" },
      { ...el("t1", "task", 50) },
      { ...el("s1", "start-event", 400) },
    ];
    expect(
      findDrillBackAnchor(bpmn, [], "bpmn"),
      "a boundary event was treated as the start of the process",
    ).toBe("s1");

    // A type with no start symbol and no EPC rule gets no marker at all,
    // rather than one on an arbitrary box.
    expect(findDrillBackAnchor([el("x", "task", 0)], [], "flowchart")).toBeNull();
  });

  it("T4146 - the renderer no longer second-guesses the type", () => {
    const src = read("app/components/canvas/SymbolRenderer.tsx");
    expect(src, "the renderer must not re-test the element type")
      .not.toMatch(/\{\(element\.type === "start-event" \|\| element\.type === "initial-state"\) && onDrillBack/);
    expect(src).toContain("{onDrillBack && !element.boundaryHostId && (");
  });
});
