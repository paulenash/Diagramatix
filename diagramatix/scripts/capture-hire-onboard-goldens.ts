/**
 * Capture the Tier 2 golden figures for the Hire & Onboard example.
 *
 * These are a CHANGE DETECTOR, not a correctness argument — which is why they
 * are captured from a run rather than written by hand. Nobody can derive a
 * discrete-event mean to three significant figures, and a predicted figure
 * presented as an expectation would be a fabrication.
 *
 * Re-run ONLY when a change to the engine or the example is intended, and say
 * why in the commit message. A golden moving on its own is the signal.
 *
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix && npx tsx scripts/capture-hire-onboard-goldens.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { STARTER_EXAMPLES } from "../app/lib/simulation/exampleSeeds";
import { assemblePortfolio } from "../app/lib/simulation/network";
import { applyOverrides, type OverrideSet } from "../app/lib/simulation/overrides";
import { runMonteCarlo } from "../app/lib/simulation/runner";
import type { PoolUnit } from "../app/lib/simulation/resourcePool";
import type { AggregatedStats } from "../app/lib/simulation/statistics";
import type { WorkCalendar, SimRunConfig } from "../app/lib/simulation/types";

const pkg = STARTER_EXAMPLES.find((e) => e.slug === "hire-and-onboard")!.package;
const r2 = (n: number) => Math.round(n * 100) / 100;

const calById = Object.fromEntries((pkg.calendars ?? []).map((c) => [c.name, c.pattern as WorkCalendar]));
const teamUnits: Record<string, PoolUnit[]> = {};
for (const t of pkg.teams) if (t.members?.length) teamUnits[t.name] = t.members.map((m) => ({ id: m.name, name: m.name, skills: m.skills }));
const teamCalendars: Record<string, WorkCalendar> = {};
for (const t of pkg.teams) if (t.calendarName && calById[t.calendarName]) teamCalendars[t.name] = calById[t.calendarName];
const teamCosts = Object.fromEntries(pkg.teams.filter((t) => t.costPerHour != null).map((t) => [t.name, t.costPerHour as number]));

const root = pkg.diagrams.find((d) => d.key === pkg.study.rootKeys[0])!;
const cfg = pkg.scenarios[0].runConfig as SimRunConfig;
const net = assemblePortfolio([{ id: root.key, data: root.data }], {
  teamCapacities: Object.fromEntries(pkg.teams.map((t) => [t.name, t.capacity])),
  strictTeams: true, teamCalendars, calendarsById: calById, teamUnits,
});

const waitAt = (s: AggregatedStats, suffix: string) => {
  const hit = Object.entries(s.perNode).find(([k]) => k.endsWith(suffix));
  return hit ? hit[1].wait.mean : NaN;
};

const WANTED = [
  "As-is — today's team",
  "More desks, no more people",
  "Hire two more administrators",
  "Train a third checker",
];

const scenarios: Record<string, Record<string, number>> = {};
for (const name of WANTED) {
  const sc = pkg.scenarios.find((s) => s.name === name);
  if (!sc) throw new Error(`No scenario "${name}" in the package.`);
  const { stats } = runMonteCarlo(applyOverrides(net, (sc.overrides ?? {}) as OverrideSet), sc.runConfig, undefined, teamCosts);
  scenarios[name] = {
    completed: r2(stats.completed.mean),
    flowP50: r2(stats.caseFlow.p50),
    flowP95: r2(stats.caseFlow.p95),
    costPerCase: r2(stats.costPerCase.mean),
    vettingWait: r2(waitAt(stats, "vetting")),
    hrOpsUtil: r2(stats.perTeam["HR Operations"]?.utilization.mean ?? 0),
  };
  console.log(name.padEnd(32), JSON.stringify(scenarios[name]));
}

const out = { seed: cfg.seed, replications: cfg.replications, capturedAt: new Date().toISOString().slice(0, 10), scenarios };
const path = join(process.cwd(), "tests/simulation/hire-onboard-goldens.json");
writeFileSync(path, JSON.stringify(out, null, 2) + "\n");
console.log(`\nWrote ${path}`);
