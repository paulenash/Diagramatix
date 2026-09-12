/**
 * Does NAMING people change a run when no task requires a skill?
 *
 * Step 3 says the other examples must "work as they currently do without any
 * skills constraints". Giving their teams named members with skills is the
 * obvious way to populate them — but naming anybody flips ResourcePool from its
 * counted path (`if (!this.skilled)`) onto `pickUnits`, which selects specific
 * individuals and sorts them least-flexible-first.
 *
 * If that changes a single number, populating the examples breaks the promise.
 * So: measure it before doing it.
 */
import { STARTER_EXAMPLES } from "../app/lib/simulation/exampleSeeds";
import { assemblePortfolio } from "../app/lib/simulation/network";
import { runMonteCarlo } from "../app/lib/simulation/runner";
import type { PoolUnit } from "../app/lib/simulation/resourcePool";
import type { WorkCalendar, SimRunConfig } from "../app/lib/simulation/types";
import type { DiagramData } from "../app/lib/diagram/types";

const r2 = (n: number) => Math.round(n * 100) / 100;

for (const ex of STARTER_EXAMPLES) {
  const pkg = ex.package;
  if (!pkg?.study?.rootKeys?.length || !pkg.scenarios?.length) continue;

  const root = pkg.diagrams.find((d) => d.key === pkg.study.rootKeys[0]);
  if (!root) continue;

  const teamCapacities = Object.fromEntries(pkg.teams.map((t) => [t.name, t.capacity]));
  const teamCosts = Object.fromEntries(pkg.teams.filter((t) => t.costPerHour != null).map((t) => [t.name, t.costPerHour as number]));
  const calById = Object.fromEntries((pkg.calendars ?? []).map((c) => [c.name, c.pattern as WorkCalendar]));
  const teamCalendars: Record<string, WorkCalendar> = {};
  for (const t of pkg.teams) if (t.calendarName && calById[t.calendarName]) teamCalendars[t.name] = calById[t.calendarName];

  // AS SHIPPED.
  const asIs: Record<string, PoolUnit[]> = {};
  for (const t of pkg.teams) if (t.members?.length) asIs[t.name] = t.members.map((m) => ({ id: m.name, name: m.name, skills: m.skills }));

  // WITH EVERY TEAM NAMED: capacity-many people, each holding one skill nothing
  // asks for. The question is whether the mere presence of names moves anything.
  const named: Record<string, PoolUnit[]> = { ...asIs };
  for (const t of pkg.teams) {
    if (asIs[t.name]) continue;
    named[t.name] = Array.from({ length: t.capacity }, (_, i) => ({
      id: `${t.name} ${i + 1}`, name: `${t.name} ${i + 1}`, skills: ["Case Assessment"],
    }));
  }

  const cfg = pkg.scenarios[0].runConfig as SimRunConfig;
  const build = (units: Record<string, PoolUnit[]>) => assemblePortfolio(
    [{ id: root.key, data: root.data as DiagramData }],
    { teamCapacities, strictTeams: true, teamCalendars, calendarsById: calById, teamUnits: units },
  );

  const a = runMonteCarlo(build(asIs), cfg, undefined, teamCosts).stats;
  const b = runMonteCarlo(build(named), cfg, undefined, teamCosts).stats;

  const same =
    r2(a.completed.mean) === r2(b.completed.mean) &&
    r2(a.caseFlow.p50) === r2(b.caseFlow.p50) &&
    r2(a.caseFlow.p95) === r2(b.caseFlow.p95);

  console.log(
    ex.slug.padEnd(32) +
    (same ? "IDENTICAL" : "CHANGED  ").padEnd(11) +
    `completed ${r2(a.completed.mean)} → ${r2(b.completed.mean)}   ` +
    `p50 ${r2(a.caseFlow.p50)} → ${r2(b.caseFlow.p50)}   ` +
    `p95 ${r2(a.caseFlow.p95)} → ${r2(b.caseFlow.p95)}`,
  );
}
