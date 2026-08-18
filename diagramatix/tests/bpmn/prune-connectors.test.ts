/**
 * Regression net for `pruneRedundantBpmnConnectors` (app/lib/ai/planBpmn.ts) — the
 * code-enforced BPMN cleanup that runs at the end of normaliseAiPlan:
 *
 *   (a) delete a gateway with exactly ONE incoming + ONE outgoing sequence flow
 *       (a pointless pass-through / stranded merge), reconnecting source→target;
 *   (b) remove a redundant back-edge sequence flow inside a Standard-Loop
 *       expanded subprocess (the loop marker already means "repeat").
 *
 * It must NOT touch real decision (1-in/2-out) or merge (2-in/1-out) gateways,
 * must leave message flows alone, and must be idempotent.
 */
import { describe, it, expect } from "vitest";
import { pruneRedundantBpmnConnectors } from "@/app/lib/ai/planBpmn";
import type { AiElement, AiConnection } from "@/app/lib/diagram/bpmnLayout";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const el = (id: string, type: string, extra: Record<string, unknown> = {}): AiElement => ({ id, type, label: id, ...extra } as any);
const seq = (sourceId: string, targetId: string, label?: string): AiConnection => ({ sourceId, targetId, type: "sequence", ...(label ? { label } : {}) });
const msg = (sourceId: string, targetId: string): AiConnection => ({ sourceId, targetId, type: "message" });

describe("pruneRedundantBpmnConnectors — pass-through gateway removal (issue #4)", () => {
  it("deletes a 1-in/1-out gateway and reconnects source→target", () => {
    const parsed = {
      elements: [el("a", "task"), el("g", "gateway", { gatewayType: "exclusive" }), el("b", "task")],
      connections: [seq("a", "g"), seq("g", "b", "onwards")],
    };
    pruneRedundantBpmnConnectors(parsed);
    expect(parsed.elements.find((e) => e.id === "g")).toBeUndefined();
    const flows = parsed.connections.filter((c) => c.type !== "message");
    expect(flows).toHaveLength(1);
    expect(flows[0]).toMatchObject({ sourceId: "a", targetId: "b", label: "onwards" });
  });

  it("keeps a real DECISION gateway (1-in/2-out)", () => {
    const parsed = {
      elements: [el("a", "task"), el("g", "gateway"), el("b", "task"), el("end", "end-event")],
      connections: [seq("a", "g"), seq("g", "b", "yes"), seq("g", "end", "no")],
    };
    pruneRedundantBpmnConnectors(parsed);
    expect(parsed.elements.find((e) => e.id === "g")).toBeDefined();
    expect(parsed.connections.filter((c) => c.type !== "message")).toHaveLength(3);
  });

  it("keeps a real MERGE gateway (2-in/1-out)", () => {
    const parsed = {
      elements: [el("a", "task"), el("b", "task"), el("g", "gateway"), el("c", "task")],
      connections: [seq("a", "g"), seq("b", "g"), seq("g", "c")],
    };
    pruneRedundantBpmnConnectors(parsed);
    expect(parsed.elements.find((e) => e.id === "g")).toBeDefined();
  });

  it("collapses a chain of two pass-through gateways (fixpoint)", () => {
    const parsed = {
      elements: [el("a", "task"), el("g1", "gateway"), el("g2", "gateway"), el("b", "task")],
      connections: [seq("a", "g1"), seq("g1", "g2"), seq("g2", "b")],
    };
    pruneRedundantBpmnConnectors(parsed);
    expect(parsed.elements.filter((e) => e.type === "gateway")).toHaveLength(0);
    const flows = parsed.connections.filter((c) => c.type !== "message");
    expect(flows).toHaveLength(1);
    expect(flows[0]).toMatchObject({ sourceId: "a", targetId: "b" });
  });

  it("does NOT remove a gateway that also has a message flow attached", () => {
    const parsed = {
      elements: [el("a", "task"), el("g", "gateway"), el("b", "task"), el("p", "pool")],
      connections: [seq("a", "g"), seq("g", "b"), msg("p", "g")],
    };
    pruneRedundantBpmnConnectors(parsed);
    expect(parsed.elements.find((e) => e.id === "g")).toBeDefined();
  });
});

describe("pruneRedundantBpmnConnectors — loop-EP back-edge removal (issue #3)", () => {
  it("removes a back-edge inside a Standard-Loop expanded subprocess", () => {
    const parsed = {
      elements: [
        el("sp", "subprocess-expanded", { repeatType: "loop" }),
        el("t1", "task", { parentSubprocess: "sp" }),
        el("g", "gateway", { parentSubprocess: "sp" }),
        el("end", "end-event", { parentSubprocess: "sp" }),
      ],
      connections: [
        seq("t1", "g"),
        seq("g", "end", "yes"),
        seq("g", "t1", "no"), // the redundant back-edge
      ],
    };
    pruneRedundantBpmnConnectors(parsed);
    // The back-edge g->t1 is gone.
    expect(parsed.connections.some((c) => c.sourceId === "g" && c.targetId === "t1")).toBe(false);
    // (and with only one outgoing branch left, the loop gateway then collapses too)
    expect(parsed.connections.some((c) => c.sourceId === "t1" && c.targetId === "end")).toBe(true);
  });

  it("does NOT remove a back-edge in a subprocess WITHOUT a loop marker", () => {
    const parsed = {
      elements: [
        el("sp", "subprocess-expanded", { repeatType: "none" }),
        el("t1", "task", { parentSubprocess: "sp" }),
        el("t2", "task", { parentSubprocess: "sp" }),
      ],
      connections: [seq("t1", "t2"), seq("t2", "t1")],
    };
    const before = parsed.connections.length;
    pruneRedundantBpmnConnectors(parsed);
    expect(parsed.connections).toHaveLength(before);
  });

  it("is idempotent — a second run changes nothing", () => {
    const parsed = {
      elements: [el("a", "task"), el("g", "gateway"), el("b", "task")],
      connections: [seq("a", "g"), seq("g", "b")],
    };
    pruneRedundantBpmnConnectors(parsed);
    const snapshot = JSON.stringify(parsed);
    pruneRedundantBpmnConnectors(parsed);
    expect(JSON.stringify(parsed)).toEqual(snapshot);
  });
});
