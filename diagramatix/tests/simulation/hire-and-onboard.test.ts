/**
 * The Hire & Onboard example, as an END-TO-END ACCEPTANCE TEST.
 *
 * Plan: audit/Example-Hire-and-Onboard-Plan.md §6. This is the only place the
 * calendar, the pool, the skills model, the significance test and the tornado
 * are asserted TOGETHER on one realistic model — every other simulation test
 * exercises them one at a time on a fixture built to suit.
 *
 * Three tiers, because they fail for different reasons:
 *
 *  · TIER 0 — invariants readable from the package with no run. Fast, and they
 *    catch an edit that quietly destroys the example's argument.
 *  · TIER 1 — the argument itself. If one of these fails, either the engine
 *    regressed or the example has stopped teaching what it says on the tin.
 *  · TIER 2 — seed-pinned golden figures (hire-onboard-goldens.json). A
 *    change-detector, not a correctness argument: any movement is a real
 *    behavioural change, and the question is "was that intended?", never
 *    "adjust the number until it passes".
 *
 * WHY THE ASSERTIONS ARE ON THE VETTING NODE, not on total queue wait. With a
 * 7.5-hour working day and ~13 seizing steps, most "waiting for a resource" is
 * waiting for Monday: total queue wait is ~13 working days at teams running
 * under 60%, and it is dominated by closed hours. Only the wait AT THE
 * CONSTRAINED STEP, and the DIFFERENCE between scenarios, isolate contention.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STARTER_EXAMPLES } from "@/app/lib/simulation/exampleSeeds";
import { assemblePortfolio } from "@/app/lib/simulation/network";
import { applyOverrides, type OverrideSet } from "@/app/lib/simulation/overrides";
import { runMonteCarlo } from "@/app/lib/simulation/runner";
import { compareSamples } from "@/app/lib/simulation/significance";
import { skillsFromArchimate, matchSkills } from "@/app/lib/simulation/skillsFromArchimate";
import type { PoolUnit } from "@/app/lib/simulation/resourcePool";
import type { AggregatedStats } from "@/app/lib/simulation/statistics";
import type { WorkCalendar, SimRunConfig } from "@/app/lib/simulation/types";
import type { DiagramData } from "@/app/lib/diagram/types";

const ex = STARTER_EXAMPLES.find((e) => e.slug === "hire-and-onboard");
const pkg = ex!.package;
const SKILL = "Compliance Accreditation";
const HR = "HR Operations";
const r2 = (n: number) => Math.round(n * 100) / 100;

// ── assemble the way the RUN ROUTE does ───────────────────────────────────
const calById = Object.fromEntries((pkg.calendars ?? []).map((c) => [c.name, c.pattern as WorkCalendar]));
const teamUnits: Record<string, PoolUnit[]> = {};
for (const t of pkg.teams) if (t.members?.length) teamUnits[t.name] = t.members.map((m) => ({ id: m.name, name: m.name, skills: m.skills }));
const teamCalendars: Record<string, WorkCalendar> = {};
for (const t of pkg.teams) if (t.calendarName && calById[t.calendarName]) teamCalendars[t.name] = calById[t.calendarName];
const teamCosts = Object.fromEntries(pkg.teams.filter((t) => t.costPerHour != null).map((t) => [t.name, t.costPerHour as number]));

const root = pkg.diagrams.find((d) => d.key === pkg.study.rootKeys[0])!;
const cfg = pkg.scenarios[0].runConfig as SimRunConfig;
const baseNet = assemblePortfolio([{ id: root.key, data: root.data }], {
  teamCapacities: Object.fromEntries(pkg.teams.map((t) => [t.name, t.capacity])),
  strictTeams: true, teamCalendars, calendarsById: calById, teamUnits,
});

/** Run one scenario by name. Memoised — each is a full 10-replication year. */
const cache = new Map<string, { stats: AggregatedStats; repMeans: number[] }>();
function scenario(name: string) {
  if (!cache.has(name)) {
    const sc = pkg.scenarios.find((s) => s.name === name);
    if (!sc) throw new Error(`No scenario "${name}" — the example was renamed without updating this test.`);
    const { stats, reps } = runMonteCarlo(applyOverrides(baseNet, (sc.overrides ?? {}) as OverrideSet), sc.runConfig, undefined, teamCosts);
    cache.set(name, { stats, repMeans: reps.map((r) => r.avgFlowTime) });
  }
  return cache.get(name)!;
}
/** Mean queue wait at one node, in hours. Node ids are namespaced by diagram. */
const waitAt = (s: AggregatedStats, suffix: string) => {
  const hit = Object.entries(s.perNode).find(([k]) => k.endsWith(suffix));
  return hit ? hit[1].wait.mean : NaN;
};
const util = (s: AggregatedStats, team: string) => s.perTeam[team]?.utilization.mean ?? 0;

const AS_IS = "As-is — today's team";
const DESKS = "More desks, no more people";
const HIRE = "Hire two more administrators";
const TRAIN = "Train a third checker";
const ADVERT = "Advertise for one week, not two";
const BOTH = "Advertise one week, start a week sooner";

describe("Hire & Onboard — Tier 0: the design, without running anything", () => {
  it("T3589 - the example is in the catalog, at advanced level, with both diagrams", () => {
    expect(ex, "hire-and-onboard missing from exampleData.json").toBeTruthy();
    expect(ex!.difficulty).toBe("advanced");
    expect(pkg.diagrams.map((d) => d.type).sort()).toEqual(["archimate", "bpmn"]);
    // The ArchiMate model is carried but never run.
    expect(pkg.companionKeys).toEqual(["hire-operating-model"]);
    expect(pkg.study.rootKeys).not.toContain("hire-operating-model");
  });

  it("T3590 - EXACTLY TWO people are accredited — the whole example rests on this", () => {
    const holders = pkg.teams.flatMap((t) => (t.members ?? []).filter((m) => m.skills.includes(SKILL)).map((m) => `${t.name}/${m.name}`));
    expect(holders.sort()).toEqual(["HR Operations/Grace Oduya", "HR Operations/Ruth Ellis"]);
  });

  it("T3591 - every task requiring a skill sits on a team that NAMES people", () => {
    // A skill required from a memberless pool is granted to anyone, silently
    // (resourcePool `if (!this.skilled)`). One careless edit and the example
    // still runs, still looks fine, and teaches the opposite of what it claims.
    const byName = new Map(pkg.teams.map((t) => [t.name, t]));
    const els = (root.data as DiagramData).elements;
    const laneTeam = new Map(els.filter((e) => e.type === "lane").map((e) => [e.id, (e.properties?.sim as { teamId?: string })?.teamId]));
    let checked = 0;
    for (const el of els) {
      const sim = el.properties?.sim as { requiredSkills?: string[]; teamId?: string } | undefined;
      if (!sim?.requiredSkills?.length) continue;
      checked++;
      const team = sim.teamId ?? laneTeam.get(el.parentId ?? "");
      expect(byName.get(team ?? "")?.members?.length, `${el.label} on "${team}"`).toBeGreaterThan(0);
    }
    expect(checked, "no task carries a skill requirement any more").toBe(5);
  });

  it("T3592 - every calendar anchors to a MONDAY and its exceptions land inside the run", () => {
    // The weekly pattern anchors t=0 to Monday 00:00; without a Monday epoch the
    // weekday pattern and the dated exceptions disagree by a constant offset —
    // and without an epoch at all the exceptions are ignored entirely.
    const horizonMs = cfg.horizon * 3600 * 1000;
    for (const c of pkg.calendars ?? []) {
      const p = c.pattern as WorkCalendar;
      expect(p.epochDate, `${c.name} has no epochDate, so its exceptions are ignored`).toBeTruthy();
      const epoch = new Date(`${p.epochDate}T00:00:00Z`);
      expect(epoch.getUTCDay(), `${c.name} epoch ${p.epochDate} is not a Monday`).toBe(1);
      const inWindow = (p.exceptions ?? []).filter((e) => {
        const at = (new Date(`${e.date}T00:00:00Z`).getTime() - epoch.getTime()) / horizonMs;
        return at > 0.2 && at < 0.95;
      });
      expect(inWindow.length, `${c.name}: too few exceptions land mid-run to be exercised`).toBeGreaterThanOrEqual(6);
    }
  });

  it("T3593 - the business case has the inputs a payback month needs", () => {
    expect(pkg.study.businessCase).toMatchObject({ implementationCost: 4500, annualVolume: 790 });
    // Training one person must be far cheaper than the alternative it is
    // compared against, or the comparison proves nothing.
    expect(pkg.study.businessCase!.implementationCost!).toBeLessThan(10_000);
  });
});

describe("Hire & Onboard — Tier 1: the argument", () => {
  it("T3594 - the busiest TEAM looks healthy, and it is HR Operations", () => {
    const { stats } = scenario(AS_IS);
    const busiest = Math.max(...Object.values(stats.perTeam).map((t) => t.utilization.mean));
    expect(busiest, "a team above 65% would make headcount a plausible answer").toBeLessThan(0.65);
    expect(util(stats, HR)).toBeCloseTo(busiest, 5);
  });

  it("T3595 - ...yet there is a real queue at the accredited step", () => {
    expect(waitAt(scenario(AS_IS).stats, "vetting")).toBeGreaterThan(8);
  });

  it("T3596 - MORE DESKS is bit-identical: capacity cannot exceed the people who exist", () => {
    const a = scenario(AS_IS).stats, b = scenario(DESKS).stats;
    expect(b.completed.mean).toBe(a.completed.mean);
    expect(b.caseFlow.p50).toBe(a.caseFlow.p50);
    expect(b.caseFlow.p95).toBe(a.caseFlow.p95);
    expect(waitAt(b, "vetting")).toBe(waitAt(a, "vetting"));
  });

  it("T3597 - HIRING TWO MORE does not touch the accredited queue", () => {
    const base = waitAt(scenario(AS_IS).stats, "vetting");
    const hired = waitAt(scenario(HIRE).stats, "vetting");
    expect(Math.abs(hired - base) / base, "two untrained administrators must not relieve a skill constraint").toBeLessThan(0.15);
  });

  it("T3598 - TRAINING ONE PERSON halves it, and leaves the control step alone", () => {
    const a = scenario(AS_IS).stats, t = scenario(TRAIN).stats;
    expect(waitAt(t, "vetting") / waitAt(a, "vetting")).toBeLessThan(0.6);
    // The control: same kind of admin work, no scarce skill. If this moved too,
    // the effect would be global and would prove nothing about the skill.
    const packBase = waitAt(a, "pack");
    expect(Math.abs(waitAt(t, "pack") - packBase) / packBase).toBeLessThan(0.1);
  });

  it("T3599 - and it is the CHEAPER of the two answers", () => {
    // £4,500 of training against two salaries. Asserted from the package so a
    // future edit cannot quietly invert the comparison.
    expect(pkg.study.businessCase!.implementationCost!).toBeLessThan(2 * 88_000);
  });

  it("T3600 - the significance test agrees: hiring is noise, training is real", () => {
    const a = scenario(AS_IS), h = scenario(HIRE), t = scenario(TRAIN);
    const band = (s: AggregatedStats) => Math.max(0, (s.flowTime.p95 - s.flowTime.p5) / 2);
    const cmp = (x: typeof a) => compareSamples(a.repMeans, x.repMeans, {
      lowerIsBetter: true,
      baseMeanFallback: a.stats.flowTime.mean, compareMeanFallback: x.stats.flowTime.mean,
      approxHalfWidth: Math.max(band(a.stats), band(x.stats)),
    });
    expect(cmp(h).exceedsBand, "hiring two administrators should read as noise").toBe(false);
    expect(cmp(t).exceedsBand, "training a third checker should read as a real difference").toBe(true);
  });
});

describe("Hire & Onboard — Tier 1: the skills matrix is READ, not typed", () => {
  const companion = pkg.diagrams.find((d) => d.key === "hire-operating-model")!;
  const model = skillsFromArchimate(companion.data as DiagramData);
  const memberNames = pkg.teams.flatMap((t) => (t.members ?? []).map((m) => m.name));
  const taskLabels = [...new Set((root.data as DiagramData).elements.filter((e) => e.type === "task").map((e) => (e.label ?? "").trim()))];
  const match = matchSkills(model, memberNames, taskLabels);

  it("T3601 - the fill reaches every named person the architecture knows", () => {
    // Zero here is this feature's failure mode, and it looked exactly like
    // success until an example was built: the reader matched an element type no
    // real diagram carries, so a real operating model filled nothing.
    //
    // 19 of 20, not 20: Isla Fraser is on the team and absent from the
    // architecture, on purpose — see T3603.
    expect(model.pattern).toBe("capability");
    expect(match.units).toHaveLength(19);
    expect(match.units.filter((u) => u.skills.includes(SKILL)).map((u) => u.name).sort())
      .toEqual(["Grace Oduya", "Ruth Ellis"]);
  });

  it("T4283 - the diagram supplies WHO CAN DO WHAT, and never what the work requires", () => {
    // Paul, step 5: a task's required skills are the user's choice from the
    // master Skills list. The operating model must therefore fill nobody's
    // task, or a fill would silently overwrite a deliberate decision.
    expect(Object.keys(match.taskSkills)).toHaveLength(0);
    expect(model.work).toEqual([]);
  });

  it("T4284 - a POST is not a skill", () => {
    // The whole point of the redraw. "Accredited Vetting Officer" is a post
    // Grace holds; "Compliance Accreditation" is something she can do. Under
    // the old drawing these were one element, so the model could not say that
    // Dev Nair holds the accreditation while filling no post.
    expect(model.skills).not.toContain("Accredited Vetting Officer");
    expect(model.skills).not.toContain("Senior Recruiter");
    const grace = model.people.find((p) => p.name === "Grace Oduya")!;
    expect(grace.roles).toEqual(["Accredited Vetting Officer"]);
    expect(grace.skills).not.toContain("Accredited Vetting Officer");
  });

  it("T4285 - the teams are READ from the model, not matched by name alone", () => {
    expect(model.teams.map((t) => t.name).sort()).toEqual(
      ["HR Operations", "IT Provisioning", "Onboarding Services", "Payroll", "Talent Acquisition"]);
    // A team is an Actor too, and must never be offered as a person.
    expect(model.people.map((p) => p.name)).not.toContain("HR Operations");
  });

  it("T4287 - every has-skill association is LABELLED", () => {
    // Paul specified the label — "relationship label = has skill or possesses.
    // That makes the semantic meaning very clear to a reader" — and it was
    // omitted on the first redraw, because the READER does not need it: the
    // relationship is identified by what it connects. That is exactly why it
    // needed pinning. A bare line between a person and a capability says
    // nothing to the human looking at the picture, and Association is the one
    // ArchiMate relationship with no inherent meaning of its own.
    const conns = (companion.data as DiagramData).connectors;
    const assoc = conns.filter((c) => c.type === "archi-association");
    expect(assoc.length).toBeGreaterThan(20);
    const unlabelled = assoc.filter((c) => !(c.label ?? "").trim());
    expect(unlabelled, "an association with no label states nothing").toEqual([]);

    // The team's capability is labelled differently on purpose: it is the
    // organisation's, not a person's, and the picture should say so without
    // the reader having to know the stereotype convention.
    const kinds = new Set(assoc.map((c) => (c.label ?? "").trim()));
    expect([...kinds].sort()).toEqual(["has capability", "has skill"]);
  });

  it("T4286 - an organisational capability is not somebody's skill", () => {
    // "Workforce Onboarding" hangs off the HR Operations TEAM. Both it and a
    // personal skill are Capability elements; only the stereotype — and the
    // fact that it is held by a team — tells them apart.
    expect(model.skills).not.toContain("Workforce Onboarding");
    expect(model.people.flatMap((p) => p.skills)).not.toContain("Workforce Onboarding");
  });

  it("T3602 - a role that AGGREGATES others resolves to the skills it is made of", () => {
    const grace = match.units.find((u) => u.name === "Grace Oduya")!;
    expect(grace.skills.sort()).toEqual(["Compliance Accreditation", "Onboarding Administration"]);
  });

  it("T3603 - things deliberately do not match, in BOTH directions, and are reported", () => {
    // An example whose unmatched report comes back empty teaches the reader to
    // ignore it. The two directions are different failures and a real operating
    // model has both:
    //   • modelled but not on the team  — the architecture is ahead
    //   • on the team but not modelled  — the architecture is behind
    expect(match.unmatchedActors).toEqual(["Dev Nair (Contractor)"]);
    expect(match.unmatchedMembers).toEqual(["Isla Fraser"]);
    // Work is no longer read at all under the capability pattern, so there is
    // nothing to report as unmatched — see T4283.
    expect(match.unmatchedWork).toEqual([]);
  });
});

describe("Hire & Onboard — Tier 2: golden figures", () => {
  const GOLDENS = join(process.cwd(), "tests/simulation/hire-onboard-goldens.json");
  type Golden = { seed: number; replications: number; scenarios: Record<string, Record<string, number>> };
  const golden = JSON.parse(readFileSync(GOLDENS, "utf8")) as Golden;

  it("T3604 - the goldens were captured at the config the example still ships", () => {
    expect(golden.seed).toBe(cfg.seed);
    expect(golden.replications).toBe(cfg.replications);
  });

  /** A difference here is a REAL behavioural change in the engine. Ask "was that
   *  intended?" — never adjust the number until it passes. The commit that moves
   *  a golden must say why. */
  const reproduces = (name: string) => {
    const g = golden.scenarios[name];
    expect(g, `no goldens for "${name}" — re-run scripts/capture-hire-onboard-goldens.ts`).toBeTruthy();
    const { stats } = scenario(name);
    expect({
      completed: r2(stats.completed.mean),
      flowP50: r2(stats.caseFlow.p50),
      flowP95: r2(stats.caseFlow.p95),
      costPerCase: r2(stats.costPerCase.mean),
      vettingWait: r2(waitAt(stats, "vetting")),
      hrOpsUtil: r2(util(stats, HR)),
    }).toEqual(g);
  };

  // Written out rather than generated: a `T${n + i}` is invisible to the grep
  // that keeps TESTS_SUMMARY.md honest, so a computed ref is an unrecorded one.
  it("T3605 - the baseline reproduces its goldens exactly", () => reproduces(AS_IS));
  it("T3606 - more desks reproduces its goldens exactly", () => reproduces(DESKS));
  it("T3607 - hiring two more reproduces its goldens exactly", () => reproduces(HIRE));
  it("T3608 - training a third checker reproduces its goldens exactly", () => reproduces(TRAIN));
  it("T4240 - advertising for one week reproduces its goldens exactly", () => reproduces(ADVERT));
  it("T4241 - the two-lever scenario reproduces its goldens exactly", () => reproduces(BOTH));

  it("T4242 - every scenario the package ships has goldens", () => {
    // The capture list used to be written out by hand beside the package. Two
    // scenarios were added and captured nothing — a scenario with no golden is
    // one whose numbers nothing is watching, and it looks exactly like one that
    // is fine.
    const missing = pkg.scenarios.map((s) => s.name).filter((n) => !golden.scenarios[n]);
    expect(missing, "re-run scripts/capture-hire-onboard-goldens.ts").toEqual([]);
  });

  it("T4243 - the example DEMONSTRATES something: a scenario visibly moves the headline", () => {
    // Paul, 2026-09-11: "Too little difference in the example simulation runs to
    // show that the feature can be successfully used." Every scenario then was a
    // staffing lever, and ~85% of this process's elapsed time is two fixed
    // timers, so all five landed within 3 hours of each other.
    //
    // The guard is on the OUTCOME, not on the presence of a named scenario: a
    // flagship example whose scenarios all agree teaches that the simulator
    // cannot tell things apart, whatever it is called.
    const baseline = golden.scenarios[AS_IS].flowP50;
    const shifts = Object.entries(golden.scenarios)
      .map(([name, g]) => ({ name, pct: Math.abs((g.flowP50 - baseline) / baseline) * 100 }));

    const best = shifts.reduce((a, b) => (b.pct > a.pct ? b : a));
    expect(best.pct, `the widest scenario moves p50 by only ${best.pct.toFixed(1)}% — the example shows nothing`).toBeGreaterThan(10);

    // ...and the staffing levers still legitimately move nothing. That contrast
    // IS the lesson, so it is asserted rather than left to chance.
    for (const n of [DESKS, HIRE]) {
      const pct = shifts.find((x) => x.name === n)!.pct;
      expect(pct, `"${n}" should change the elapsed time by ~nothing`).toBeLessThan(1);
    }
  });
});
