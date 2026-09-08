/**
 * The seven gaps found while planning the Hire & Onboard example.
 *
 * Every one of them was invisible: the code ran, produced numbers, and quietly
 * did something other than what the model said. That is the failure mode these
 * tests exist for — not crashes, but confident wrong answers.
 *
 * Each block states the gap it closes and, where it matters, proves the OLD
 * behaviour is still intact when the new field is absent. That regression bar is
 * the more important half: a scenario that declares nothing must run exactly as
 * it did before any of this existed.
 */
import { describe, it, expect } from "vitest";
import { applyOverrides, type OverrideSet } from "@/app/lib/simulation/overrides";
import { validateExamplePackage, type ExamplePackage } from "@/app/lib/simulation/examplePackage";
import { clampSensitivity, clampSweep, RUN_LIMITS } from "@/app/lib/simulation/runner";
import { checkSimReadiness } from "@/app/lib/simulation/readiness";
import { assembleFromDiagram } from "@/app/lib/simulation/assemble";
import type { SimNetwork } from "@/app/lib/simulation/model";
import type { DiagramData } from "@/app/lib/diagram/types";
import type { SimRunConfig } from "@/app/lib/simulation/types";

// ── fixtures ──────────────────────────────────────────────────────────────
const person = (name: string, ...skills: string[]) => ({ id: name, name, skills });

function net(): SimNetwork {
  return {
    nodes: [
      { id: "vet", kind: "task", label: "Vetting", teamId: "HR Ops", cycleTime: { kind: "fixed", value: 4 }, requiredSkills: ["Compliance"] },
      { id: "pack", kind: "task", label: "Pack", teamId: "HR Ops", cycleTime: { kind: "fixed", value: 1 } },
    ],
    edges: [],
    teams: [{ id: "HR Ops", capacity: 4, units: [person("Grace", "Compliance"), person("Ruth", "Compliance"), person("Ben"), person("Marta")] }],
  };
}
const teamOf = (n: SimNetwork) => n.teams.find((t) => t.id === "HR Ops")!;
const skillsOf = (n: SimNetwork, who: string) => teamOf(n).units!.find((u) => u.name === who)!.skills;

// ═══════════════════════════════════════════════════════════════════════════
describe("Gap E - cross-training is askable as a scenario", () => {
  it("T3563 - training one person changes only that person", () => {
    const before = net();
    const after = applyOverrides(before, {
      teams: { "HR Ops": { members: [{ name: "Marta", skills: ["Compliance"] }] } },
    });
    expect(skillsOf(after, "Marta")).toEqual(["Compliance"]);
    // The other three are untouched - a whole-list replacement would have
    // deleted them, which is the bug this merge exists to avoid.
    expect(teamOf(after).units!.map((u) => u.name)).toEqual(["Grace", "Ruth", "Ben", "Marta"]);
    expect(skillsOf(after, "Grace")).toEqual(["Compliance"]);
    expect(skillsOf(after, "Ben")).toEqual([]);
  });

  it("T3564 - the BASELINE is not touched, so sibling scenarios cannot corrupt each other", () => {
    const baseline = net();
    applyOverrides(baseline, { teams: { "HR Ops": { members: [{ name: "Marta", skills: ["Compliance"] }] } } });
    applyOverrides(baseline, { teams: { "HR Ops": { members: [{ name: "Ben", skills: ["Compliance"] }] } } });
    // cloneNetwork shallow-copies each team, so the units array and the unit
    // objects inside it are SHARED. Editing in place would rewrite the baseline
    // and every other scenario derived from it.
    expect(skillsOf(baseline, "Marta")).toEqual([]);
    expect(skillsOf(baseline, "Ben")).toEqual([]);
  });

  it("T3565 - a name the team does not have is ADDED, which is how you hire someone", () => {
    const after = applyOverrides(net(), {
      teams: { "HR Ops": { capacity: 6, members: [{ name: "New Starter A", skills: [] }, { name: "New Starter B", skills: [] }] } },
    });
    expect(teamOf(after).units!.map((u) => u.name)).toEqual(["Grace", "Ruth", "Ben", "Marta", "New Starter A", "New Starter B"]);
    expect(teamOf(after).capacity).toBe(6);
    // ...and the new people cannot do the specialist work.
    expect(teamOf(after).units!.filter((u) => u.skills.includes("Compliance"))).toHaveLength(2);
  });

  it("T3566 - names match case- and whitespace-insensitively, so a typo retrains rather than clones", () => {
    const after = applyOverrides(net(), {
      teams: { "HR Ops": { members: [{ name: "   MARTA  ", skills: ["Compliance"] }] } },
    });
    expect(teamOf(after).units).toHaveLength(4);            // not 5
    expect(skillsOf(after, "Marta")).toEqual(["Compliance"]); // library spelling kept
  });

  it("T3567 - capacity alone adds no one: a desk is not a person", () => {
    const after = applyOverrides(net(), { teams: { "HR Ops": { capacity: 12 } } });
    expect(teamOf(after).capacity).toBe(12);
    expect(teamOf(after).units).toHaveLength(4);
    expect(teamOf(after).units!.filter((u) => u.skills.includes("Compliance"))).toHaveLength(2);
  });

  it("T3568 - a task's requiredSkills is overridable, and an EMPTY array means 'needs nothing'", () => {
    const relaxed = applyOverrides(net(), { elements: { vet: { requiredSkills: [] } } });
    expect(relaxed.nodes.find((n) => n.id === "vet")!.requiredSkills).toEqual([]);
    // Absent is different from empty: it leaves the baseline alone.
    const untouched = applyOverrides(net(), { elements: { vet: { cycleTime: { kind: "fixed", value: 9 } } } });
    expect(untouched.nodes.find((n) => n.id === "vet")!.requiredSkills).toEqual(["Compliance"]);
  });

  it("T3569 - REGRESSION: an override set that declares none of this changes nothing", () => {
    const before = net();
    const after = applyOverrides(before, { teams: { "HR Ops": { capacity: 4 } } } as OverrideSet);
    expect(after.teams).toEqual(before.teams);
    expect(after.nodes).toEqual(before.nodes);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Gap G - a tornado gets its own budget", () => {
  const cfg: SimRunConfig = { clockUnit: "hour", horizon: 8760, warmUp: 0, replications: 10, seed: 1, collectQueues: true };

  it("T3570 - a 20-parameter model gets all 41 of its runs", () => {
    // The real Hire & Onboard shape: 6 teams + 1 source + 13 tasks.
    const { steps, clamped } = clampSensitivity(cfg, 41);
    expect(steps).toBe(41);
    expect(clamped).toBe(false);
  });

  it("T3571 - which the SWEEP cap would have cut to 24, dropping nine parameters", () => {
    // Kept as a live comparison: this is the exact behaviour that made the
    // tornado useless on any realistic model.
    expect(clampSweep(cfg, 41).steps).toBe(24);
    expect(RUN_LIMITS.maxSensitivityRuns).toBeGreaterThan(RUN_LIMITS.maxSweepSteps);
  });

  it("T3572 - maxWork still binds, and REPLICATIONS give before parameters do", () => {
    const big: SimRunConfig = { ...cfg, horizon: 50_000, replications: 20 };
    const { steps, cfg: out, clamped } = clampSensitivity(big, 41);
    expect(clamped).toBe(true);
    expect(steps).toBe(41);                       // every parameter still tested
    expect(out.replications).toBeLessThan(20);    // the band widens instead
    expect(steps * out.horizon * out.replications).toBeLessThanOrEqual(RUN_LIMITS.maxWork);
  });

  it("T3573 - a pathological model is still bounded", () => {
    expect(clampSensitivity(cfg, 100_000).steps).toBeLessThanOrEqual(RUN_LIMITS.maxSensitivityRuns);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Gaps A + C - skills and the business case survive a package", () => {
  const base = (): ExamplePackage => ({
    version: 1,
    teams: [{ name: "HR Ops", capacity: 2, members: [{ name: "Grace", skills: ["Compliance"] }, { name: "Ben", skills: [] }] }],
    diagrams: [{ key: "d1", name: "P", type: "bpmn", data: { elements: [], connectors: [] } as unknown as DiagramData }],
    study: { name: "S", rootKeys: ["d1"], businessCase: { implementationCost: 4500, annualVolume: 790 } },
    scenarios: [],
  });

  it("T3574 - a package carrying people and inputs is valid", () => {
    expect(validateExamplePackage(base())).toEqual([]);
  });

  it("T3575 - a team naming fewer people than its capacity is reported", () => {
    // The spare capacity is unreachable: pickUnits can only choose people who
    // exist. Legitimate to model, but silent, and in an EXAMPLE almost always
    // an authoring mistake.
    const pkg = base();
    pkg.teams[0].capacity = 5;
    expect(validateExamplePackage(pkg).some((e) => /names only 2 people/.test(e))).toBe(true);
  });

  it("T3576 - a duplicated or nameless person is reported", () => {
    const dup = base();
    dup.teams[0].members = [{ name: "Grace", skills: [] }, { name: " grace ", skills: [] }];
    expect(validateExamplePackage(dup).some((e) => /names "\s*grace\s*" twice/i.test(e))).toBe(true);

    const blank = base();
    blank.teams[0].members = [{ name: "  ", skills: [] }, { name: "Ben", skills: [] }];
    expect(validateExamplePackage(blank).some((e) => /member with no name/.test(e))).toBe(true);
  });

  it("T3577 - REGRESSION: a package with no members and no inputs is still valid", () => {
    const old: ExamplePackage = {
      version: 1,
      teams: [{ name: "T", capacity: 1 }],
      diagrams: [{ key: "d1", name: "P", type: "bpmn", data: { elements: [], connectors: [] } as unknown as DiagramData }],
      study: { name: "S", rootKeys: ["d1"] },
      scenarios: [],
    };
    expect(validateExamplePackage(old)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Gap B - a companion diagram can travel", () => {
  const withCompanion = (): ExamplePackage => ({
    version: 1,
    teams: [],
    diagrams: [
      { key: "proc", name: "Hire", type: "bpmn", data: { elements: [], connectors: [] } as unknown as DiagramData },
      { key: "arch", name: "Operating model", type: "archimate", data: { elements: [], connectors: [] } as unknown as DiagramData },
    ],
    study: { name: "S", rootKeys: ["proc"] },
    scenarios: [],
    companionKeys: ["arch"],
  });

  it("T3578 - an ArchiMate companion alongside a BPMN root is valid", () => {
    expect(validateExamplePackage(withCompanion())).toEqual([]);
  });

  it("T3579 - a companion that names no diagram is reported", () => {
    const pkg = withCompanion();
    pkg.companionKeys = ["ghost"];
    expect(validateExamplePackage(pkg).some((e) => /Companion diagram "ghost"/.test(e))).toBe(true);
  });

  it("T3580 - a diagram cannot be both a root and a companion", () => {
    // Roots are RUN; companions exist precisely because they are not.
    const pkg = withCompanion();
    pkg.companionKeys = ["proc"];
    expect(validateExamplePackage(pkg).some((e) => /both a study root and a companion/.test(e))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Gap F - a skill requirement that does nothing is reported", () => {
  const diagram = (requiredSkills?: string[]): DiagramData => ({
    elements: [
      { id: "lane", type: "lane", label: "HR Ops", x: 0, y: 0, width: 600, height: 200 },
      {
        id: "t1", type: "task", label: "Vetting", x: 40, y: 40, width: 120, height: 60,
        properties: { sim: { teamId: "HR Ops", ...(requiredSkills ? { requiredSkills } : {}) } },
      },
    ],
    connectors: [],
  } as unknown as DiagramData);

  it("T3581 - a skill required from a team that names NOBODY is an error, not a silent no-op", () => {
    const issues = checkSimReadiness([diagram(["Compliance"])], [{ name: "HR Ops", capacity: 4, members: [] }]);
    const hit = issues.find((i) => /requirement is IGNORED/.test(i.message));
    expect(hit, JSON.stringify(issues, null, 2)).toBeTruthy();
    expect(hit!.severity).toBe("error");
  });

  it("T3582 - a skill nobody on the team holds is reported as unstartable work", () => {
    const issues = checkSimReadiness(
      [diagram(["Compliance"])],
      [{ name: "HR Ops", capacity: 2, members: [{ name: "Ben", skills: [] }] }],
    );
    expect(issues.some((i) => /can never start/.test(i.message))).toBe(true);
  });

  it("T3583 - a requirement somebody actually holds is silent", () => {
    const issues = checkSimReadiness(
      [diagram(["Compliance"])],
      [{ name: "HR Ops", capacity: 2, members: [{ name: "Grace", skills: ["Compliance"] }] }],
    );
    expect(issues.filter((i) => /Compliance/.test(i.message))).toEqual([]);
  });

  it("T3584 - REGRESSION: a task with no skill requirement is unaffected by a memberless team", () => {
    const issues = checkSimReadiness([diagram()], [{ name: "HR Ops", capacity: 4 }]);
    expect(issues.filter((i) => /IGNORED|never start/.test(i.message))).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Gap D - batching is reachable from a diagram", () => {
  const withBatch = (batch?: unknown): DiagramData => ({
    elements: [
      { id: "lane", type: "lane", label: "Finance", x: 0, y: 0, width: 600, height: 200 },
      { id: "start", type: "start-event", label: "In", x: 10, y: 60, width: 36, height: 36, properties: { sim: { arrival: { kind: "fixed", value: 10 } } } },
      { id: "post", type: "task", label: "Post", x: 80, y: 40, width: 120, height: 60, properties: { sim: { teamId: "Finance", cycleTime: { kind: "fixed", value: 5 }, ...(batch ? { batch } : {}) } } },
      { id: "end", type: "end-event", label: "Out", x: 260, y: 60, width: 36, height: 36 },
    ],
    connectors: [
      { id: "c1", type: "sequence", sourceId: "start", targetId: "post" },
      { id: "c2", type: "sequence", sourceId: "post", targetId: "end" },
    ],
  } as unknown as DiagramData);

  const postOf = (d: DiagramData) => assembleFromDiagram(d).nodes.find((n) => n.id === "post")!;

  it("T3585 - a size and a cut-off written on a task reach the engine's node", () => {
    // The engine has honoured SimNode.batch since Phase 5 and is covered by
    // T3486-T3488, but nothing ever WROTE it - so "posted at 4pm" could not be
    // expressed on a diagram at all.
    expect(postOf(withBatch({ size: 50, cutoff: "16:00" })).batch).toEqual({ size: 50, cutoff: "16:00" });
  });

  it("T3586 - either rule alone is enough", () => {
    expect(postOf(withBatch({ size: 25 })).batch).toEqual({ size: 25 });
    expect(postOf(withBatch({ cutoff: "16:00" })).batch).toEqual({ cutoff: "16:00" });
  });

  it("T3587 - a batch of one, or a malformed cut-off, is NOT a batch", () => {
    // A size of 1 sends every case down the batch path to be released alone -
    // the same answer by a slower and much less obvious route.
    expect(postOf(withBatch({ size: 1 })).batch).toBeUndefined();
    expect(postOf(withBatch({ cutoff: "4pm" })).batch).toBeUndefined();
    expect(postOf(withBatch({})).batch).toBeUndefined();
  });

  it("T3588 - REGRESSION: a task that says nothing about batching gets no batch", () => {
    expect(postOf(withBatch()).batch).toBeUndefined();
  });
});
