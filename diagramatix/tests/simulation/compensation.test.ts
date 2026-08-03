/**
 * BPMN compensation semantics in the simulator (spec: full-BPMN/compensation-simulation-spec.md).
 *
 * Goal A (assemble): the boundary-compensation association is NOT a control-flow
 *   edge; the catch event is not a node; the host carries compensationHandlers;
 *   the inline throw is tagged compensationThrow.
 * Goal B (engine): a compensation handler fires ONLY if its host executed, ONLY
 *   when an inline throwing compensation event is reached, in reverse-completion
 *   (LIFO) order, globally, as real work (T2220).
 */
import { describe, it, expect } from "vitest";
import { assembleFromDiagram } from "@/app/lib/simulation/assemble";
import { Engine } from "@/app/lib/simulation/engine";
import type { SimNetwork } from "@/app/lib/simulation/model";
import type { SimRunConfig } from "@/app/lib/simulation/types";
import type { DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";

// ── Goal A: assemble ───────────────────────────────────────────────────────
const el = (id: string, type: string, extra: Partial<DiagramElement> = {}): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label: id, x: 0, y: 0, width: 100, height: 60, properties: {}, ...extra });
const cn = (id: string, s: string, t: string, type: string): Connector =>
  ({ id, sourceId: s, targetId: t, type } as unknown as Connector);

describe("assemble — compensation wiring (T2220)", () => {
  const data: DiagramData = {
    elements: [
      el("S", "start-event"),
      el("HOST", "task"),
      el("CE", "intermediate-event", { eventType: "compensation", flowType: "catching", boundaryHostId: "HOST" }),
      el("H", "task", { properties: { isForCompensation: true } }),
      el("TE", "intermediate-event", { eventType: "compensation", flowType: "throwing" }),
      el("E", "end-event"),
    ],
    connectors: [
      cn("s1", "S", "HOST", "sequence"),
      cn("s2", "HOST", "TE", "sequence"),
      cn("s3", "TE", "E", "sequence"),
      cn("a1", "CE", "H", "associationBPMN"),
    ],
  } as DiagramData;
  const net = assembleFromDiagram(data);

  it("skips the boundary compensation catch event (not a flow node)", () => {
    expect(net.nodes.find((n) => n.id === "CE")).toBeUndefined();
  });
  it("arms the host with its compensation handler", () => {
    expect(net.nodes.find((n) => n.id === "HOST")?.compensationHandlers).toEqual(["H"]);
  });
  it("tags the inline throwing compensation event", () => {
    expect(net.nodes.find((n) => n.id === "TE")?.compensationThrow).toBe(true);
  });
  it("does NOT make the association a control-flow edge, and the handler has no incoming edge", () => {
    expect(net.edges.some((e) => e.source === "CE" || e.target === "CE")).toBe(false);
    expect(net.edges.some((e) => e.target === "H")).toBe(false);
    expect(net.nodes.find((n) => n.id === "H")).toBeDefined(); // handler still a node (dispatched separately)
  });
});

// ── Goal B: engine ─────────────────────────────────────────────────────────
const cfg = (over: Partial<SimRunConfig> = {}): SimRunConfig =>
  ({ clockUnit: "minute", horizon: 1000, warmUp: 0, replications: 1, seed: 1, collectQueues: false, ...over });

const D = (v: number) => ({ kind: "fixed" as const, value: v });

/** src → A → THROW → sink ; A hosts compA (fixed 5). One token. */
function net1(withThrow: boolean): SimNetwork {
  return {
    teams: [],
    nodes: [
      { id: "src", kind: "source", arrival: D(1), maxArrivals: 1 },
      { id: "A", kind: "task", cycleTime: D(2), compensationHandlers: ["compA"] },
      { id: "TH", kind: "delay", ...(withThrow ? { compensationThrow: true } : {}) },
      { id: "sink", kind: "sink" },
      { id: "compA", kind: "task", cycleTime: D(5) }, // isolated handler
    ],
    edges: [
      { id: "e1", source: "src", target: "A" },
      { id: "e2", source: "A", target: "TH" },
      { id: "e3", source: "TH", target: "sink" },
    ],
  };
}

describe("engine — compensation firing (T2220)", () => {
  it("fires the handler when the host executed AND a throw is reached", () => {
    const r = new Engine(net1(true), cfg()).run();
    expect(r.perNode.compA?.count).toBe(1);
  });

  it("never fires the handler when there is no throwing event", () => {
    const r = new Engine(net1(false), cfg()).run();
    expect(r.perNode.compA?.count ?? 0).toBe(0);
  });

  it("counts the handler's duration as real work (flow time includes it)", () => {
    // A(2) + compA(5) + throw(0) = flow ~7. Without compensation it'd be ~2.
    const withComp = new Engine(net1(true), cfg()).run();
    const noComp = new Engine(net1(false), cfg()).run();
    expect(withComp.avgFlowTime).toBeGreaterThan(noComp.avgFlowTime + 4);
  });

  it("does NOT fire a handler whose host was branched around", () => {
    // src → G(decision) →[p=0] A(host) →... and →[p=1] BYPASS → THROW → sink
    const net: SimNetwork = {
      teams: [],
      nodes: [
        { id: "src", kind: "source", arrival: D(1), maxArrivals: 1 },
        { id: "G", kind: "gateway", gateway: "decision" },
        { id: "A", kind: "task", cycleTime: D(2), compensationHandlers: ["compA"] },
        { id: "BYP", kind: "task", cycleTime: D(1) },
        { id: "TH", kind: "delay", compensationThrow: true },
        { id: "sink", kind: "sink" },
        { id: "compA", kind: "task", cycleTime: D(5) },
      ],
      edges: [
        { id: "e0", source: "src", target: "G" },
        { id: "eA", source: "G", target: "A", probability: 0 },
        { id: "eB", source: "G", target: "BYP", probability: 1, isDefault: true },
        { id: "eA2", source: "A", target: "TH" },
        { id: "eB2", source: "BYP", target: "TH" },
        { id: "e3", source: "TH", target: "sink" },
      ],
    };
    const r = new Engine(net, cfg()).run();
    expect(r.perNode.compA?.count ?? 0).toBe(0); // A never ran → its handler is disarmed
  });

  it("fires multiple handlers in reverse-completion (LIFO) order", () => {
    // src → A → B → THROW → sink ; A→compA, B→compB. Expect compB before compA.
    const net: SimNetwork = {
      teams: [],
      nodes: [
        { id: "src", kind: "source", arrival: D(1), maxArrivals: 1 },
        { id: "A", kind: "task", cycleTime: D(1), compensationHandlers: ["compA"] },
        { id: "B", kind: "task", cycleTime: D(1), compensationHandlers: ["compB"] },
        { id: "TH", kind: "delay", compensationThrow: true },
        { id: "sink", kind: "sink" },
        { id: "compA", kind: "task", cycleTime: D(1) },
        { id: "compB", kind: "task", cycleTime: D(1) },
      ],
      edges: [
        { id: "e1", source: "src", target: "A" },
        { id: "e2", source: "A", target: "B" },
        { id: "e3", source: "B", target: "TH" },
        { id: "e4", source: "TH", target: "sink" },
      ],
    };
    const e = new Engine(net, cfg(), undefined, { trace: true });
    e.run();
    const svc = e.getTrace().filter((t) => t.kind === "service");
    const iA = svc.findIndex((t) => t.nodeId === "compA");
    const iB = svc.findIndex((t) => t.nodeId === "compB");
    expect(iB).toBeGreaterThanOrEqual(0);
    expect(iA).toBeGreaterThanOrEqual(0);
    expect(iB).toBeLessThan(iA); // B completed last → compensates first (LIFO)
  });
});
