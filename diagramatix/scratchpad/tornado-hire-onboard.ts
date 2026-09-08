/**
 * Run the tornado over the authored example, offline. This is the check that the
 * example's headline claim survives contact with the real chart.
 */
import { STARTER_EXAMPLES } from "../app/lib/simulation/exampleSeeds";
import { assemblePortfolio } from "../app/lib/simulation/network";
import { applyOverrides, type OverrideSet } from "../app/lib/simulation/overrides";
import { runMonteCarlo } from "../app/lib/simulation/runner";
import { enumerateParameters, variationsFor, overrideForParam, buildTornado, type SensitivityRun } from "../app/lib/simulation/sensitivity";
import type { PoolUnit } from "../app/lib/simulation/resourcePool";
import type { WorkCalendar, SimRunConfig } from "../app/lib/simulation/types";
import type { RunMetrics } from "../app/lib/simulation/results";

const pkg = STARTER_EXAMPLES.find((e) => e.slug === "hire-and-onboard")!.package;
const teamCapacities = Object.fromEntries(pkg.teams.map((t) => [t.name, t.capacity]));
const teamCosts = Object.fromEntries(pkg.teams.filter((t) => t.costPerHour != null).map((t) => [t.name, t.costPerHour as number]));
const teamUnits: Record<string, PoolUnit[]> = {};
for (const t of pkg.teams) if (t.members?.length) teamUnits[t.name] = t.members.map((m) => ({ id: m.name, name: m.name, skills: m.skills }));
const calById = Object.fromEntries((pkg.calendars ?? []).map((c) => [c.name, c.pattern as WorkCalendar]));
const teamCalendars: Record<string, WorkCalendar> = {};
for (const t of pkg.teams) if (t.calendarName && calById[t.calendarName]) teamCalendars[t.name] = calById[t.calendarName];

const root = pkg.diagrams.find((d) => d.key === pkg.study.rootKeys[0])!;
// Fewer replications than the real run — this is a shape check, not a golden.
const cfg = { ...(pkg.scenarios[0].runConfig as SimRunConfig), replications: 4 };
const net = assemblePortfolio([{ id: root.key, data: root.data }], {
  teamCapacities, strictTeams: true, teamCalendars, calendarsById: calById, teamUnits,
});

const run = (ov: OverrideSet): RunMetrics => {
  const { stats, reps } = runMonteCarlo(applyOverrides(net, ov), cfg, undefined, teamCosts);
  return {
    stats,
    bottlenecks: Object.entries(stats.perTeam).sort((a, b) => b[1].utilization.mean - a[1].utilization.mean).map(([t]) => t),
    nodeLabels: {}, clockUnit: cfg.clockUnit, teamCapacities,
    repMeans: reps.map((r) => r.avgFlowTime),
  };
};

const params = enumerateParameters(net);
console.log(`${params.length} parameters -> ${2 * params.length + 1} runs\n`);
const baseline = run({});
console.log(`baseline bottlenecks: ${baseline.bottlenecks.slice(0, 3).join(" > ")}`);

const runs: SensitivityRun[] = params.map((p) => {
  const v = variationsFor(p, 0.2);
  return v
    ? { param: p, low: { value: v.low, metrics: run(overrideForParam(p, v.low)) }, high: { value: v.high, metrics: run(overrideForParam(p, v.high)) } }
    : { param: p, low: null, high: null };
});

const t = buildTornado(baseline, runs, "nearWorst", 0.2);
console.log(`\nobjective ${t.objectiveLabel}, baseline ${t.baselineY} ${t.unit}\n`);
console.log("verdict          swing   %   parameter");
for (const b of t.bars) {
  console.log(`${b.verdict.padEnd(14)} ${String(b.swing).padStart(8)} ${String(b.swingPct).padStart(4)}  ${b.param.kind}: ${b.param.label}`);
}
console.log(`\n${t.statement}`);
