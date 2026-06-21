/**
 * Linked-subprocess roll-up: a subprocess that links to a separate diagram is
 * flattened into an inline expanded subprocess so the child's tasks/teams/times
 * simulate as part of the run — including nested links, parallel concurrency +
 * shared-team contention, per-use-site isolation, the summary opt-out, and
 * cycle safety.
 */
import { describe, it, expect } from "vitest";
import { spliceLinkedSubprocesses } from "@/app/lib/simulation/spliceLinks";
import { assembleFromDiagram } from "@/app/lib/simulation/assemble";
import { Engine } from "@/app/lib/simulation/engine";
import type { DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";
import type { SimRunConfig } from "@/app/lib/simulation/types";

const el = (id: string, type: string, props?: object, extra?: Partial<DiagramElement>): DiagramElement =>
  ({ id, type, x: 0, y: 0, width: 80, height: 40, label: id, properties: props ?? {}, ...extra }) as DiagramElement;
const conn = (id: string, s: string, t: string): Connector =>
  ({ id, sourceId: s, targetId: t }) as unknown as Connector;
const diag = (elements: DiagramElement[], connectors: Connector[]): DiagramData =>
  ({ viewport: { x: 0, y: 0, zoom: 1 }, elements, connectors });

const cfg: SimRunConfig = { clockUnit: "minute", horizon: 3000, warmUp: 0, replications: 1, seed: 1, collectQueues: true };

// A child process: start → task (team "C", cycle 8) → end.
const child = (team = "C", cycle = 8) => diag(
  [el("cstart", "start-event"), el("ctask", "task", { sim: { cycleTime: { kind: "fixed", value: cycle }, teamId: team } }), el("cend", "end-event")],
  [conn("cc1", "cstart", "ctask"), conn("cc2", "ctask", "cend")],
);

describe("linked-subprocess roll-up", () => {
  it("flattens a linked subprocess into an inline body and simulates it", () => {
    const parent = diag(
      [el("pstart", "start-event", { sim: { arrival: { kind: "fixed", value: 1000 }, maxArrivals: 1 } }),
       el("SUB", "subprocess", { linkedDiagramId: "child" }), el("pend", "end-event")],
      [conn("p1", "pstart", "SUB"), conn("p2", "SUB", "pend")],
    );
    const byId = new Map([["child", child()]]);
    const spliced = spliceLinkedSubprocesses(parent, "parent", byId);

    // SUB became an inline expanded subprocess with the child cloned under it.
    const sub = spliced.elements.find((e) => e.id === "SUB")!;
    expect(sub.type).toBe("subprocess-expanded");
    expect(sub.properties.linkedDiagramId).toBeUndefined();
    const ctask = spliced.elements.find((e) => e.id === "SUB~ctask");
    expect(ctask?.parentId).toBe("SUB");

    const net = assembleFromDiagram(spliced);
    expect(net.nodes.find((n) => n.id === "SUB")?.bodyStart).toBe("SUB~cstart");
    expect(net.nodes.find((n) => n.id === "SUB~ctask")?.scope).toBe("SUB");

    const r = new Engine(net, cfg).run();
    expect(r.completed).toBe(1);
    expect(r.perNode["SUB~ctask"].count).toBe(1);   // the child task actually ran
    expect(r.perTeam.C.utilization).toBeGreaterThan(0);
  });

  it("subMode 'summary' keeps it a black box (not rolled up)", () => {
    const parent = diag(
      [el("pstart", "start-event", { sim: { arrival: { kind: "fixed", value: 1000 }, maxArrivals: 1 } }),
       el("SUB", "subprocess", { linkedDiagramId: "child", sim: { subMode: "summary", cycleTime: { kind: "fixed", value: 3 } } }),
       el("pend", "end-event")],
      [conn("p1", "pstart", "SUB"), conn("p2", "SUB", "pend")],
    );
    const net = assembleFromDiagram(spliceLinkedSubprocesses(parent, "parent", new Map([["child", child()]])));
    expect(net.nodes.find((n) => n.id === "SUB~ctask")).toBeUndefined(); // child not spliced
    expect(net.nodes.find((n) => n.id === "SUB")?.kind).toBe("task");     // black-box task
  });

  it("two parallel linked subprocesses stay isolated and contend on a shared team", () => {
    const parent = diag(
      [el("pstart", "start-event", { sim: { arrival: { kind: "fixed", value: 6 } } }),
       el("g", "gateway", {}, { gatewayType: "parallel" }),
       el("SUB1", "subprocess", { linkedDiagramId: "child" }),
       el("SUB2", "subprocess", { linkedDiagramId: "child" }),
       el("pend", "end-event")],
      [conn("p0", "pstart", "g"), conn("pa", "g", "SUB1"), conn("pb", "g", "SUB2"), conn("p1", "SUB1", "pend"), conn("p2", "SUB2", "pend")],
    );
    const net = assembleFromDiagram(spliceLinkedSubprocesses(parent, "parent", new Map([["child", child()]])));
    // Same child, two use-sites → two distinct, isolated bodies.
    expect(net.nodes.find((n) => n.id === "SUB1~ctask")).toBeDefined();
    expect(net.nodes.find((n) => n.id === "SUB2~ctask")).toBeDefined();
    // Both feed team C (capacity 1) → heavy contention.
    const r = new Engine({ ...net, teams: [{ id: "C", capacity: 1 }] }, cfg).run();
    expect(r.perTeam.C.utilization).toBeGreaterThan(0.7);
    expect(r.perNode["SUB1~ctask"].count).toBeGreaterThan(0);
    expect(r.perNode["SUB2~ctask"].count).toBeGreaterThan(0);
  });

  it("rolls up NESTED links (A → B → C)", () => {
    const a = diag(
      [el("astart", "start-event", { sim: { arrival: { kind: "fixed", value: 1000 }, maxArrivals: 1 } }),
       el("AB", "subprocess", { linkedDiagramId: "B" }), el("aend", "end-event")],
      [conn("a1", "astart", "AB"), conn("a2", "AB", "aend")],
    );
    const b = diag(
      [el("bstart", "start-event"), el("BC", "subprocess", { linkedDiagramId: "C" }), el("bend", "end-event")],
      [conn("b1", "bstart", "BC"), conn("b2", "BC", "bend")],
    );
    const c = diag(
      [el("cstart", "start-event"), el("deepTask", "task", { sim: { cycleTime: { kind: "fixed", value: 4 }, teamId: "X" } }), el("cend", "end-event")],
      [conn("cc1", "cstart", "deepTask"), conn("cc2", "deepTask", "cend")],
    );
    const byId = new Map([["B", b], ["C", c]]);
    const net = assembleFromDiagram(spliceLinkedSubprocesses(a, "A", byId));
    // The deep C task is nested under AB → BC.
    expect(net.nodes.find((n) => n.id === "AB~BC~deepTask")).toBeDefined();
    const r = new Engine(net, cfg).run();
    expect(r.completed).toBe(1);
    expect(r.perTeam.X.utilization).toBeGreaterThan(0);
  });

  it("a cyclic link terminates (no infinite loop)", () => {
    const a = diag([el("astart", "start-event"), el("AB", "subprocess", { linkedDiagramId: "B" }), el("aend", "end-event")],
      [conn("a1", "astart", "AB"), conn("a2", "AB", "aend")]);
    const b = diag([el("bstart", "start-event"), el("BA", "subprocess", { linkedDiagramId: "A" }), el("bend", "end-event")],
      [conn("b1", "bstart", "BA"), conn("b2", "BA", "bend")]);
    const spliced = spliceLinkedSubprocesses(a, "A", new Map([["B", b]]));
    // Finite result: B spliced into A, but B's link back to A stays a black box.
    expect(spliced.elements.length).toBeLessThan(20);
    expect(spliced.elements.find((e) => e.id === "AB~BA")?.type).toBe("subprocess"); // still a black box
  });
});
