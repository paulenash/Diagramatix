/**
 * Pick the arrival mean by MEASUREMENT, not arithmetic.
 *
 * A source's inter-arrival delay is sampled in ELAPSED time, added to a clock
 * that only ever sits inside an open window, and then pushed forward to the next
 * open moment. So the effective rate is neither "per elapsed hour" nor "per open
 * hour": below the open-window length it behaves like open-hours spacing, and
 * above it saturates at roughly one arrival per window. No closed form gets you
 * from a target volume to the parameter — so sweep it and read the answer off.
 */
import { STARTER_EXAMPLES } from "../app/lib/simulation/exampleSeeds";
import { assemblePortfolio } from "../app/lib/simulation/network";
import { applyOverrides, type OverrideSet } from "../app/lib/simulation/overrides";
import { runMonteCarlo } from "../app/lib/simulation/runner";
import type { PoolUnit } from "../app/lib/simulation/resourcePool";
import type { WorkCalendar, SimRunConfig } from "../app/lib/simulation/types";
import type { DiagramData } from "../app/lib/diagram/types";

const pkg = STARTER_EXAMPLES.find((e) => e.slug === "hire-and-onboard")!.package;
const r2 = (n: number) => Math.round(n * 100) / 100;

const teamCapacities = Object.fromEntries(pkg.teams.map((t) => [t.name, t.capacity]));
const teamCosts = Object.fromEntries(pkg.teams.filter((t) => t.costPerHour != null).map((t) => [t.name, t.costPerHour as number]));
const teamUnits: Record<string, PoolUnit[]> = {};
for (const t of pkg.teams) if (t.members?.length) teamUnits[t.name] = t.members.map((m) => ({ id: m.name, name: m.name, skills: m.skills }));
const calById = Object.fromEntries((pkg.calendars ?? []).map((c) => [c.name, c.pattern as WorkCalendar]));
const teamCalendars: Record<string, WorkCalendar> = {};
for (const t of pkg.teams) if (t.calendarName && calById[t.calendarName]) teamCalendars[t.name] = calById[t.calendarName];

const root = pkg.diagrams.find((d) => d.key === pkg.study.rootKeys[0])!;
const data = root.data as DiagramData;
const cfg = pkg.scenarios[0].runConfig as SimRunConfig;
const MEASURED_YEARS = (cfg.horizon - cfg.warmUp) / 8760;

/** Rebuild with a given arrival mean on the start event. */
function withArrival(mean: number) {
  const elements = data.elements.map((el) =>
    el.id === "start"
      ? { ...el, properties: { ...el.properties, sim: { ...(el.properties?.sim as object), arrival: { kind: "exponential", mean } } } }
      : el);
  return assemblePortfolio([{ id: root.key, data: { ...data, elements } as DiagramData }], {
    teamCapacities, strictTeams: true, teamCalendars, calendarsById: calById, teamUnits,
  });
}

/** Mean queue wait, in hours, at one node — the number the example lives on. */
const waitAt = (stats: { perNode: Record<string, { wait: { mean: number } }> }, suffix: string) => {
  const hit = Object.entries(stats.perNode).find(([k]) => k.endsWith(suffix));
  return hit ? hit[1].wait.mean : NaN;
};
const TRAIN: OverrideSet = { teams: { "HR Operations": { members: [{ name: "Marta Silva", skills: ["Onboarding Administration", "Compliance Accreditation"] }] } } };

console.log("mean  hires/yr  TA%  HRops%  Onb%   VETTING wait (h)          pack   flow p95");
console.log("                                    2 trained -> 3 trained    (h)     (h)");
for (const mean of [2.4, 2.8, 3.2, 3.6, 4.0, 4.6]) {
  const net = withArrival(mean);
  const base = runMonteCarlo(net, cfg, undefined, teamCosts).stats;
  const trained = runMonteCarlo(applyOverrides(net, TRAIN), cfg, undefined, teamCosts).stats;
  const perYear = (base.arrived?.mean ?? 0) / MEASURED_YEARS;
  const u = (n: string) => Math.round((base.perTeam[n]?.utilization.mean ?? 0) * 100);
  const v0 = waitAt(base, "vetting"), v1 = waitAt(trained, "vetting");
  console.log(
    `${String(mean).padEnd(5)} ${String(Math.round(perYear)).padStart(7)}  ` +
    `${String(u("Talent Acquisition")).padStart(3)}  ${String(u("HR Operations")).padStart(5)}  ${String(u("Onboarding Services")).padStart(4)}   ` +
    `${String(r2(v0)).padStart(8)} -> ${String(r2(v1)).padStart(7)}   ` +
    `${String(r2(waitAt(base, "pack"))).padStart(6)}  ${String(r2(base.caseFlow?.p95 ?? 0)).padStart(7)}`,
  );
}
console.log("\nTarget from the sizing: ~790 hires/yr, TA ~59%, HR Operations ~56%,");
console.log("and the vetting wait must COLLAPSE when a third person is trained.");
console.log("'pack' is the control: same team-ish work, no scarce skill, should barely move.");
