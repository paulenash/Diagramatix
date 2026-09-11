/**
 * What actually differs between the Hire & Onboard scenarios?
 *
 * Paul, 2026-09-11: "Too little difference in the example simulation runs to
 * show that the feature can be successfully used." The comparison table shows
 * every scenario landing within a couple of hours of the baseline.
 *
 * The hypothesis this measures: flow time is dominated by two FIXED timers
 * (applications gather, 10 working days; wait for start date, 15 working days),
 * so the queueing relief a staffing change buys is real but is a rounding error
 * against ~1000 hours of calendar. If so, `queueWait` — already computed, never
 * displayed — separates cleanly where flow time cannot.
 */
import { STARTER_EXAMPLES } from "../app/lib/simulation/exampleSeeds";
import { assemblePortfolio } from "../app/lib/simulation/network";
import { applyOverrides, type OverrideSet } from "../app/lib/simulation/overrides";
import { runMonteCarlo } from "../app/lib/simulation/runner";
import type { PoolUnit } from "../app/lib/simulation/resourcePool";
import type { WorkCalendar, SimRunConfig } from "../app/lib/simulation/types";
import type { DiagramData } from "../app/lib/diagram/types";

const pkg = STARTER_EXAMPLES.find((e) => e.slug === "hire-and-onboard")!.package;
const r1 = (n: number) => Math.round(n * 10) / 10;

const teamCapacities = Object.fromEntries(pkg.teams.map((t) => [t.name, t.capacity]));
const teamCosts = Object.fromEntries(pkg.teams.filter((t) => t.costPerHour != null).map((t) => [t.name, t.costPerHour as number]));
const teamUnits: Record<string, PoolUnit[]> = {};
for (const t of pkg.teams) if (t.members?.length) teamUnits[t.name] = t.members.map((m) => ({ id: m.name, name: m.name, skills: m.skills }));
const calById = Object.fromEntries((pkg.calendars ?? []).map((c) => [c.name, c.pattern as WorkCalendar]));
const teamCalendars: Record<string, WorkCalendar> = {};
for (const t of pkg.teams) if (t.calendarName && calById[t.calendarName]) teamCalendars[t.name] = calById[t.calendarName];

const root = pkg.diagrams.find((d) => d.key === pkg.study.rootKeys[0])!;
const net = assemblePortfolio([{ id: root.key, data: root.data as DiagramData }], {
  teamCapacities, strictTeams: true, teamCalendars, calendarsById: calById, teamUnits,
});

console.log("scenario                                    p50   p95  queueWait  processWait  topUtil  completed");
console.log("                                            (h)   (h)      (h)         (h)");

for (const sc of pkg.scenarios) {
  const cfg = sc.runConfig as SimRunConfig;
  const n = Object.keys(sc.overrides ?? {}).length ? applyOverrides(net, sc.overrides as OverrideSet) : net;
  const s = runMonteCarlo(n, cfg, undefined, teamCosts).stats;

  const topUtil = Math.max(...Object.values(s.perTeam).map((t) => t.utilization.mean));
  console.log(
    sc.name.padEnd(42) +
    String(Math.round(s.caseFlow.p50)).padStart(5) +
    String(Math.round(s.caseFlow.p95)).padStart(6) +
    String(r1(s.queueWait?.mean ?? NaN)).padStart(11) +
    String(r1(s.processWait?.mean ?? NaN)).padStart(13) +
    String(Math.round(topUtil * 100) + "%").padStart(9) +
    String(Math.round(s.completed.mean)).padStart(11),
  );
}

console.log("\nIf queueWait separates the scenarios while p50 does not, the example is");
console.log("sound and the COMPARISON TABLE is what hides it.");

// Where does the ~100h/case of "queueing" actually sit?
console.log("\nBaseline per-node mean wait (h), largest first:");
const base = runMonteCarlo(net, pkg.scenarios[0].runConfig as SimRunConfig, undefined, teamCosts).stats;
Object.entries(base.perNode)
  .map(([k, v]) => [k.split(":").pop() ?? k, v.wait.mean] as const)
  .filter(([, w]) => w > 0.05)
  .sort((a, b) => b[1] - a[1])
  .forEach(([k, w]) => console.log(`  ${String(k).padEnd(24)} ${r1(w).toString().padStart(8)}`));
const total = Object.values(base.perNode).reduce((s, v) => s + v.wait.mean, 0);
console.log(`  ${"— sum per case".padEnd(24)} ${r1(total).toString().padStart(8)}`);
