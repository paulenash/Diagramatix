/**
 * Hierarchical diagram→network assembly: a drawn Expanded Subprocess simulates
 * its inline body, and an Event Subprocess nested inside it becomes an engine
 * event sub — so the replay/engine actually exercise EP internals from a real
 * diagram (previously the EP was flattened to a single task).
 */
import { describe, it, expect } from "vitest";
import { assembleFromDiagram } from "@/app/lib/simulation/assemble";
import { Engine } from "@/app/lib/simulation/engine";
import type { DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";
import type { SimRunConfig } from "@/app/lib/simulation/types";

const el = (id: string, type: string, props?: object, extra?: Partial<DiagramElement>): DiagramElement =>
  ({ id, type, x: 0, y: 0, width: 80, height: 40, label: id, properties: props ?? {}, ...extra }) as DiagramElement;
const conn = (id: string, s: string, t: string): Connector =>
  ({ id, sourceId: s, targetId: t }) as unknown as Connector;

// Top: S0 → EP1 → S_END.  EP1 body: b_start → b_task → b_end.
// EP1 hosts an event sub EV1 (non-interrupting): ev_start → ev_task → ev_end.
const data: DiagramData = {
  viewport: { x: 0, y: 0, zoom: 1 },
  elements: [
    el("S0", "start-event", { sim: { arrival: { kind: "fixed", value: 1000 }, maxArrivals: 1 } }),
    el("EP1", "subprocess-expanded"),
    el("b_start", "start-event", {}, { parentId: "EP1" }),
    el("b_task", "task", { sim: { cycleTime: { kind: "fixed", value: 100 } } }, { parentId: "EP1" }),
    el("b_end", "end-event", {}, { parentId: "EP1" }),
    el("EV1", "subprocess-expanded", { subprocessType: "event" }, { parentId: "EP1" }),
    el("ev_start", "start-event", { interruptionType: "non-interrupting", sim: { eventTrigger: { kind: "fixed", value: 10 } } }, { parentId: "EV1" }),
    el("ev_task", "task", { sim: { cycleTime: { kind: "fixed", value: 5 } } }, { parentId: "EV1" }),
    el("ev_end", "end-event", {}, { parentId: "EV1" }),
    el("S_END", "end-event"),
  ],
  connectors: [
    conn("c0", "S0", "EP1"),
    conn("c1", "EP1", "S_END"),
    conn("b1", "b_start", "b_task"),
    conn("b2", "b_task", "b_end"),
    conn("v1", "ev_start", "ev_task"),
    conn("v2", "ev_task", "ev_end"),
  ],
};

describe("hierarchical assembler", () => {
  const net = assembleFromDiagram(data);
  const node = (id: string) => net.nodes.find((n) => n.id === id);

  it("maps the EP to a subprocess node with a body + event sub", () => {
    const ep = node("EP1")!;
    expect(ep.kind).toBe("subprocess");
    expect(ep.bodyStart).toBe("b_start");
    expect(ep.eventSubs).toHaveLength(1);
    const es = ep.eventSubs![0];
    expect(es.id).toBe("EV1");
    expect(es.bodyStart).toBe("ev_task");      // first handler node after the trigger
    expect(es.interrupting).toBe(false);        // non-interrupting
    expect(es.trigger).toEqual({ kind: "fixed", value: 10 });
  });

  it("scope-tags the body + makes the body start a pass-through", () => {
    expect(node("b_start")!.kind).toBe("delay");   // EP body entry, not a source
    expect(node("b_start")!.scope).toBe("EP1");
    expect(node("b_task")!.scope).toBe("EP1");
    expect(node("b_end")!.kind).toBe("sink");
    expect(node("b_end")!.scope).toBe("EP1");
    expect(node("ev_task")!.scope).toBe("EV1");
    expect(node("ev_end")!.scope).toBe("EV1");
  });

  it("skips the event-sub container + its trigger start event", () => {
    expect(node("EV1")).toBeUndefined();
    expect(node("ev_start")).toBeUndefined();
  });

  it("actually runs: body + the non-interrupting handler both execute", () => {
    const cfg: SimRunConfig = { clockUnit: "minute", horizon: 4000, warmUp: 0, replications: 1, seed: 1, collectQueues: true };
    const r = new Engine(net, cfg).run();
    expect(r.completed).toBe(1);
    expect(r.perNode.b_task.count).toBe(1);
    expect(r.perNode.ev_task.count).toBe(1); // event sub fired during the body
  });
});
