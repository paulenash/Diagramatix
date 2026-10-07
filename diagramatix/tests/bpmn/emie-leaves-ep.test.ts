/**
 * R8.45 (Paul, 2026-10-07, from a diagram written with the new prompt skill): an edge-mounted intermediate event (EMIE) on a step INSIDE
 * an Expanded Subprocess must never be connected to anything outside that Expanded Subprocess. To get the same outcome the EMIE is mounted on
 * the Expanded Subprocess itself, and then it may lead anywhere.
 *
 * The diagram check B41 (checkEdgeMountIntermediateOutgoing) already says so, and flags it in the editor — but generation produced it
 * anyway. The cause was an ordering gap: the layout evicts the steps that only an exception path reaches (a reminder, a wait) out of the EP,
 * and the pass that repairs flows crossing the EP boundary exempted every boundary event ("its flows legitimately leave the EP") — true of an
 * event on the EP's rim, false of one on a child's rim. So the event stayed on the child while its flow left the EP.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection, type LayoutDiagnostic } from "@/app/lib/diagram/bpmnLayout";
import { checkEdgeMountIntermediateOutgoing } from "@/app/lib/diagram/checks/diagramChecks";

const run = (els: AiElement[], conns: AiConnection[]) => {
  const diagnostics: LayoutDiagnostic[] = [];
  const out = layoutBpmnDiagram(els, conns, { onDiagnostic: (d) => diagnostics.push(d) });
  return { out, diagnostics };
};

/** The shape the AI produced for "Application Assessment": a reminder path hanging off a step inside a loop. */
function plan(extra: { be1Target?: string } = {}) {
  const els: AiElement[] = [
    { id: "pOrg", type: "pool", label: "Organisation", poolType: "white-box" },
    { id: "lF", type: "lane", label: "Front Office", parentPool: "pOrg" },
    { id: "s", type: "start-event", label: "Application received", pool: "pOrg", lane: "lF", eventType: "message" },
    { id: "c1", type: "task", label: "Check for completeness", pool: "pOrg", lane: "lF" },
    { id: "g1", type: "gateway", label: "Complete?", gatewayType: "exclusive", pool: "pOrg", lane: "lF" },
    { id: "sp1", type: "subprocess-expanded", label: "Repeat Until Complete", repeatType: "loop", pool: "pOrg", lane: "lF" },
    { id: "g2", type: "gateway", label: "Complete", gatewayType: "exclusive", pool: "pOrg", lane: "lF" },
    { id: "e", type: "end-event", label: "Done", pool: "pOrg", lane: "lF" },
    { id: "ee3", type: "end-event", label: "Application lapsed", pool: "pOrg", lane: "lF" },
    // inside the loop
    { id: "is", type: "start-event", label: "", parentSubprocess: "sp1" },
    { id: "t2", type: "task", label: "Request details", taskType: "send", parentSubprocess: "sp1" },
    { id: "t3", type: "task", label: "Await reply", taskType: "receive", parentSubprocess: "sp1" },
    { id: "t6", type: "task", label: "Update details", taskType: "user", parentSubprocess: "sp1" },
    { id: "ie", type: "end-event", label: "", parentSubprocess: "sp1" },
    // the exception path's own steps — declared inside the loop, reachable only through the event
    { id: "t4", type: "task", label: "Send reminder", taskType: "send", parentSubprocess: "sp1" },
    { id: "t5", type: "task", label: "Await reply to reminder", taskType: "receive", parentSubprocess: "sp1" },
    { id: "be1", type: "intermediate-event", label: "No reply by reminder date", eventType: "timer", boundaryHost: "t3", boundarySide: "bottom" },
    { id: "be2", type: "intermediate-event", label: "Time limit exceeded", eventType: "timer", boundaryHost: "sp1", boundarySide: "bottom" },
  ];
  const conns: AiConnection[] = [
    { sourceId: "s", targetId: "c1" }, { sourceId: "c1", targetId: "g1" },
    { sourceId: "g1", targetId: "sp1", label: "No" }, { sourceId: "g1", targetId: "g2", label: "Yes" },
    { sourceId: "is", targetId: "t2" }, { sourceId: "t2", targetId: "t3" }, { sourceId: "t3", targetId: "t6" }, { sourceId: "t6", targetId: "ie" },
    { sourceId: "be1", targetId: extra.be1Target ?? "t4" }, { sourceId: "t4", targetId: "t5" }, { sourceId: "t5", targetId: "t6" },
    { sourceId: "sp1", targetId: "g2" }, { sourceId: "g2", targetId: "e" },
    { sourceId: "be2", targetId: "ee3" },
  ];
  return { els, conns };
}

const idOf = (out: ReturnType<typeof layoutBpmnDiagram>, label: string) => out.elements.find((e) => e.label === label)!;

describe("T5277 R8.45 an EMIE on a step inside an EP is mounted on the EP when its flow leaves it", () => {
  it("re-hosts the event onto the Expanded Subprocess, and says so", () => {
    const { els, conns } = plan();
    const { out, diagnostics } = run(els, conns);
    const ep = idOf(out, "Repeat Until Complete");
    const be1 = idOf(out, "No reply by reminder date");
    expect(be1.boundaryHostId).toBe(ep.id);                                   // was the task "Await reply"
    expect(diagnostics.some((d) => d.elementId === "be1" && d.field === "boundaryHost" && /R8\.45/.test(d.detail))).toBe(true);
  });

  it("leaves the exception path outside the EP and brings it back to the EP, never to a step inside it", () => {
    const { els, conns } = plan();
    const { out } = run(els, conns);
    const ep = idOf(out, "Repeat Until Complete");
    expect(idOf(out, "Send reminder").parentId).not.toBe(ep.id);
    expect(idOf(out, "Await reply to reminder").parentId).not.toBe(ep.id);
    const back = out.connectors.find((c) => c.sourceId === idOf(out, "Await reply to reminder").id && (c.type ?? "sequence") === "sequence");
    expect(back?.targetId).toBe(ep.id);
  });

  it("the generated diagram now satisfies the diagram check B41 (it did not before)", () => {
    const { els, conns } = plan();
    const { out } = run(els, conns);
    expect(checkEdgeMountIntermediateOutgoing({ elements: out.elements, connectors: out.connectors } as never)).toEqual([]);
  });

  it("an event whose path stays INSIDE the EP is left where it is", () => {
    const { els, conns } = plan({ be1Target: "t6" });                         // exception path: straight to another step in the loop
    const { out, diagnostics } = run(els, conns);
    const be1 = idOf(out, "No reply by reminder date");
    expect(be1.boundaryHostId).toBe(idOf(out, "Await reply").id);
    expect(diagnostics.some((d) => d.elementId === "be1" && d.field === "boundaryHost")).toBe(false);
  });

  it("an event already on the EP is untouched", () => {
    const { els, conns } = plan();
    const { out, diagnostics } = run(els, conns);
    expect(idOf(out, "Time limit exceeded").boundaryHostId).toBe(idOf(out, "Repeat Until Complete").id);
    expect(diagnostics.some((d) => d.elementId === "be2" && d.field === "boundaryHost")).toBe(false);
  });
});
