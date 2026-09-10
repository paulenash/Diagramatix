/**
 * Queue discipline and preemption, reachable at last.
 *
 * Both were engine capabilities with nowhere to store them. `SimulationTeam` had
 * no column, the API took no field, and the team editor showed no control — so
 * the only ways to set either were a hand-built `SimNetwork` or a BPSim import.
 * They ran, they were tested, and no user could switch them on.
 *
 * That is a failure mode this codebase keeps finding, and it has one property
 * that makes it hard to catch: everything works. The tests pass, the engine is
 * correct, and nothing anywhere reports a problem — the capability simply has no
 * door. So this file tests the DOOR rather than the engine: that a team's stored
 * setting survives every hop between the database and the resource pool.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { assembleFromDiagram } from "@/app/lib/simulation/assemble";
import type { DiagramData } from "@/app/lib/diagram/types";

/** One task pointing at one team, which is all the chain needs to be exercised. */
const diagram = (): DiagramData => ({
  elements: [
    { id: "t1", type: "task", x: 0, y: 0, width: 100, height: 60, label: "Assess",
      properties: { sim: { cycleTime: { kind: "fixed", value: 5 }, teamId: "Claims" } } },
  ],
  connectors: [],
});

describe("the stored setting reaches the pool", () => {
  it("T4047 - a team that declares nothing is FIFO and does not interrupt", () => {
    // The regression bar. Every existing project has null discipline and false
    // preemptive, and must assemble exactly as it did before the columns existed.
    const net = assembleFromDiagram(diagram(), { teamCapacities: { Claims: 2 } });
    const team = net.teams.find((t) => t.id === "Claims");
    expect(team).toBeTruthy();
    expect(team!.discipline).toBeUndefined();
    expect(team!.preemptive).toBeUndefined();
  });

  it("T4048 - a stored discipline reaches the assembled team", () => {
    const net = assembleFromDiagram(diagram(), {
      teamCapacities: { Claims: 2 },
      teamDisciplines: { Claims: "priority" },
    });
    expect(net.teams.find((t) => t.id === "Claims")!.discipline).toBe("priority");
  });

  it("T4049 - so does preemption", () => {
    const net = assembleFromDiagram(diagram(), {
      teamCapacities: { Claims: 2 },
      teamPreemptive: { Claims: true },
    });
    expect(net.teams.find((t) => t.id === "Claims")!.preemptive).toBe(true);
  });

  it("T4050 - a team the library does not know still picks its settings up", () => {
    // A task can name a team that has no library row — assemble invents a
    // capacity-1 pool for it. That path is separate code, and it would have been
    // easy to wire the settings into only the other one.
    const net = assembleFromDiagram(diagram(), {
      teamDisciplines: { Claims: "shortest-first" },
      teamPreemptive: { Claims: true },
    });
    const team = net.teams.find((t) => t.id === "Claims")!;
    expect(team.discipline).toBe("shortest-first");
    expect(team.preemptive).toBe(true);
  });
});

describe("every hop in the chain exists", () => {
  // Source-level, because the hops are a Prisma column, an API field and a form
  // control — none of which a unit test can exercise, and any one of which
  // silently breaks the feature while everything still compiles and passes.
  const read = (p: string) => readFileSync(p, "utf8");

  it("T4051 - the column exists on SimulationTeam", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.slice(schema.indexOf("model SimulationTeam"), schema.indexOf("model SimulationCalendar"));
    expect(model).toMatch(/\bdiscipline\s+String\?/);
    expect(model).toMatch(/\bpreemptive\s+Boolean/);
  });

  it("T4052 - the API accepts both, on create and on update", () => {
    const put = read("app/api/projects/[id]/simulation-teams/[teamId]/route.ts");
    expect(put).toContain("body.discipline");
    expect(put).toContain("body.preemptive");
    const post = read("app/api/projects/[id]/simulation-teams/route.ts");
    expect(post).toContain("discipline:");
    expect(post).toContain("preemptive:");
  });

  it("T4053 - the run reads the columns and passes them to assemble", () => {
    // The hop that would fail most quietly: a run that never selects the column
    // produces a perfectly good simulation of the wrong queue.
    for (const route of [
      "app/api/projects/[id]/simulation/studies/[studyId]/scenarios/[scenarioId]/run/route.ts",
      "app/api/projects/[id]/simulation/studies/[studyId]/scenarios/[scenarioId]/sensitivity/route.ts",
      "app/api/projects/[id]/simulation/studies/[studyId]/scenarios/[scenarioId]/sweep/route.ts",
    ]) {
      const src = read(route);
      expect(src, `${route} does not SELECT the columns`).toMatch(/discipline:\s*true/);
      expect(src, `${route} does not pass them to assemble`).toContain("teamDisciplines");
      expect(src).toContain("teamPreemptive");
    }
  });

  it("T4054 - the team editor offers both, and gates interrupts on a priority queue", () => {
    const ui = read("app/components/simulation/TeamLibraryManager.tsx");
    expect(ui).toContain("setDiscipline");
    expect(ui).toContain("setPreemptive");
    // Preemption without priorities is meaningless — it is about who STOPS, and
    // with no priorities there is nobody to stop for. The control says so by
    // being unavailable rather than by being available and doing nothing.
    expect(ui).toMatch(/disabled=\{t\.discipline !== "priority"\}/);
  });
});
