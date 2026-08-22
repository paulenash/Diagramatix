/**
 * "Fill missing" provenance: filled values are tagged (sim.autofilled +
 * connector branchProbabilityAuto); a manual edit un-tags a field; "Unfill
 * missing" clears only still-tagged values, keeping manual overrides.
 */
import { describe, it, expect } from "vitest";
import { autofillSimulation, unfillSimulation } from "@/app/lib/simulation/autofill";
import { getSimParams, simPatch } from "@/app/lib/diagram/simParams";
import type { DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";

const el = (id: string, type: string, extra?: Partial<DiagramElement>): DiagramElement =>
  ({ id, type, x: 0, y: 0, width: 80, height: 40, label: id, properties: {}, ...extra }) as DiagramElement;
const conn = (id: string, s: string, t: string): Connector => ({ id, sourceId: s, targetId: t, type: "sequence" }) as unknown as Connector;

// The tasks sit in a LANE: a team is only ever named after something the user
// drew, so without one there is no team to fill (and nothing is invented).
const base = (): DiagramData => ({
  viewport: { x: 0, y: 0, zoom: 1 },
  elements: [
    el("p", "pool", { x: 0, y: 0, width: 800, height: 200, label: "Co" } as Partial<DiagramElement>),
    el("l", "lane", { parentId: "p", x: 40, y: 0, width: 760, height: 200, label: "Ops" } as Partial<DiagramElement>),
    el("s", "start-event", { parentId: "l" } as Partial<DiagramElement>),
    el("g", "gateway", { parentId: "l", gatewayType: "exclusive" } as Partial<DiagramElement>),
    el("a", "task", { parentId: "l" } as Partial<DiagramElement>), el("b", "task", { parentId: "l" } as Partial<DiagramElement>),
  ],
  connectors: [conn("c0", "s", "g"), conn("ga", "g", "a"), conn("gb", "g", "b")],
});

describe("fill-missing provenance (T2837)", () => {
  it("tags filled element keys and connector branch %s", () => {
    const { data } = autofillSimulation(base());
    const a = data.elements.find((e) => e.id === "a")!;
    expect(getSimParams(a).cycleTime).toBeTruthy();
    expect(getSimParams(a).autofilled).toEqual(expect.arrayContaining(["cycleTime", "teamId"]));
    const ga = data.connectors.find((c) => c.id === "ga")!;
    expect(ga.branchProbability).toBe(50);
    expect(ga.branchProbabilityAuto).toBe(true);
  });

  it("a manual edit un-tags that field (simPatch)", () => {
    const { data } = autofillSimulation(base());
    const a = data.elements.find((e) => e.id === "a")!;
    const patched = simPatch(a, { cycleTime: { kind: "fixed", value: 99 } }).sim;
    expect(patched.autofilled).not.toContain("cycleTime"); // manually overridden
    expect(patched.autofilled).toContain("teamId");        // still auto
  });

  it("unfill clears only still-tagged values, keeping manual overrides", () => {
    const filled = autofillSimulation(base()).data;
    // Manually override task a's cycle time (un-tags cycleTime).
    const a = filled.elements.find((e) => e.id === "a")!;
    const withManual: DiagramData = {
      ...filled,
      elements: filled.elements.map((e) => (e.id === "a" ? { ...e, properties: { ...e.properties, ...simPatch(a, { cycleTime: { kind: "fixed", value: 99 } }) } } : e)),
    };
    const { data: unfilled, cleared } = unfillSimulation(withManual);
    const a2 = unfilled.elements.find((e) => e.id === "a")!;
    expect(getSimParams(a2).cycleTime).toEqual({ kind: "fixed", value: 99 }); // manual override kept
    expect(getSimParams(a2).teamId).toBeUndefined();                          // auto teamId cleared
    expect(getSimParams(a2).autofilled).toBeUndefined();
    const ga = unfilled.connectors.find((c) => c.id === "ga")!;
    expect(ga.branchProbability).toBeUndefined();                             // auto branch % cleared
    expect(cleared).toBeGreaterThan(0);
  });
});
