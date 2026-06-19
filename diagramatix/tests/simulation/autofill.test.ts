/**
 * Autofill of missing simulation attributes (for testing partially-complete
 * processes): fills source arrival, task cycle + team (from lane), decision
 * branch probabilities; never overwrites existing user values.
 */
import { describe, it, expect } from "vitest";
import { autofillSimulation } from "@/app/lib/simulation/autofill";
import { getSimParams } from "@/app/lib/diagram/simParams";
import type { DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";

const el = (id: string, type: string, over?: Partial<DiagramElement>): DiagramElement =>
  ({ id, type, x: 0, y: 0, width: 80, height: 40, label: id, properties: {}, ...over }) as DiagramElement;
const conn = (id: string, s: string, t: string, over?: object): Connector =>
  ({ id, sourceId: s, targetId: t, ...over }) as unknown as Connector;

describe("autofillSimulation", () => {
  const data: DiagramData = {
    viewport: { x: 0, y: 0, zoom: 1 },
    elements: [
      el("lane1", "lane", { label: "Finance Team" }),
      el("src", "start-event"),
      el("a", "task", { parentId: "lane1" }),
      el("b", "task", { properties: { sim: { cycleTime: { kind: "fixed", value: 9 } } } }), // pre-set
      el("g", "gateway"),
      el("x", "task", { parentId: "lane1" }),
      el("y", "task"),
      el("end", "end-event"),
    ],
    connectors: [
      conn("c0", "src", "a"),
      conn("c1", "a", "g"),
      conn("g1", "g", "x"),
      conn("g2", "g", "y"),
      conn("g3", "g", "end"),
    ],
  };

  const { data: out, filled } = autofillSimulation(data);
  const byId = new Map(out.elements.map((e) => [e.id, e]));

  it("fills the source arrival", () => {
    expect(getSimParams(byId.get("src")!).arrival).toBeDefined();
  });

  it("fills task cycle time + assigns the lane team, keeps units", () => {
    const a = getSimParams(byId.get("a")!);
    expect(a.cycleTime).toBeDefined();
    expect(a.teamId).toBe("finance-team");
    expect(a.resourceUnits).toBe(1);
  });

  it("preserves user-entered values", () => {
    expect(getSimParams(byId.get("b")!).cycleTime).toEqual({ kind: "fixed", value: 9 });
  });

  it("splits decision branch probabilities to 100", () => {
    const probs = out.connectors.filter((c) => c.sourceId === "g").map((c) => c.branchProbability);
    expect(probs.every((p) => typeof p === "number")).toBe(true);
    expect(probs.reduce<number>((s, p) => s + (p ?? 0), 0)).toBe(100);
  });

  it("reports how many attributes it filled", () => {
    expect(filled).toBeGreaterThan(0);
  });
});
