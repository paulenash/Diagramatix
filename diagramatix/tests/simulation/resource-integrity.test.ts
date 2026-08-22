import { describe, it, expect } from "vitest";
import { assembleFromDiagram } from "@/app/lib/simulation/assemble";
import type { DiagramData } from "@/app/lib/diagram/types";

/**
 * T2863 — only VISIBLE, explicitly declared resources may affect a run.
 *
 * The assembler used to create a pool for any string an activity named, at
 * capacity 1. A stale or mistyped name therefore became an invisible one-person
 * team that no setting could reach: a user raised "Sales Team" to 50 and the run
 * was byte-identical to capacity 1, because the tasks said "Sales Taem". The
 * numbers were arithmetically right and completely wrong.
 *
 * Matching is fuzzy (case + surrounding whitespace) but the RESULT never is:
 * every pool carries the library's own name, so no hidden variant can exist.
 */
const task = (id: string, team: string, x: number) =>
  ({ id, type: "task", x, y: 0, width: 90, height: 50, label: id, properties: { sim: { cycleTime: { kind: "fixed", value: 5 }, teamId: team } } } as never);

const diagram = (...teams: string[]): DiagramData => ({
  viewport: { x: 0, y: 0, zoom: 1 },
  elements: [
    { id: "s", type: "start-event", x: 0, y: 0, width: 40, height: 40, label: "S", properties: { sim: { arrival: { kind: "fixed", value: 10 } } } },
    ...teams.map((t, i) => task(`t${i}`, t, 100 + i * 120)),
  ],
  connectors: [],
} as unknown as DiagramData);

const LIB = { "Sales Team": 50 };

describe("resource integrity", () => {
  it("a name differing only by case or spacing resolves to the SAME pool", () => {
    const net = assembleFromDiagram(diagram("Sales Team", "sales team", "  Sales Team  "), {
      teamCapacities: LIB, strictTeams: true,
    });
    expect(net.teams).toHaveLength(1);
    expect(net.teams[0].id, "the library's spelling, not the task's").toBe("Sales Team");
    expect(net.teams[0].capacity, "the capacity the user set actually applies").toBe(50);
    // Every activity points at the canonical name — no hidden variants.
    expect(new Set(net.nodes.filter((n) => n.teamId).map((n) => n.teamId))).toEqual(new Set(["Sales Team"]));
  });

  it("an undeclared resource is REPORTED and gets no pool at all", () => {
    const net = assembleFromDiagram(diagram("Sales Team", "Sales Taem"), {
      teamCapacities: LIB, strictTeams: true,
    });
    expect(net.unknownTeams, "the typo is surfaced, not absorbed").toEqual(["Sales Taem"]);
    expect(net.teams.map((t) => t.id), "no phantom pool").toEqual(["Sales Team"]);
    // The activity that named it seizes nothing rather than queueing on a team
    // that exists nowhere in the user's Resources list.
    expect(net.nodes.find((n) => n.id === "t1")!.teamId).toBeUndefined();
  });

  it("the capacity the user set is never silently replaced by 1", () => {
    const net = assembleFromDiagram(diagram("Sales Team"), { teamCapacities: LIB, strictTeams: true });
    expect(net.teams[0].capacity).toBe(50);
  });

  it("without a library (tests / BPSim) the permissive behaviour is unchanged", () => {
    const net = assembleFromDiagram(diagram("Whoever"));
    expect(net.teams.map((t) => t.id)).toEqual(["Whoever"]);
    expect(net.unknownTeams).toBeUndefined();
  });

  it("reports an unknown resource even when not strict, so a caller can always show it", () => {
    const net = assembleFromDiagram(diagram("Sales Team", "Sales Taem"), { teamCapacities: LIB });
    expect(net.unknownTeams).toEqual(["Sales Taem"]);
    expect(net.teams.map((t) => t.id).sort()).toEqual(["Sales Taem", "Sales Team"]); // still pooled, but visible
  });
});
