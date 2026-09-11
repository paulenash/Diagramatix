/**
 * Can ANYTHING move this example's headline number?
 *
 * The staffing scenarios cannot: ~85% of the 988h flow time is two fixed timers
 * (gather 10 working days, start date 15), and most of the remaining 91h of
 * per-case waiting is overnight calendar boundaries, not resource contention —
 * three parallel tasks each waiting ~16h for the office to open.
 *
 * So this tries PROCESS changes instead of STAFFING ones, to confirm the model
 * responds when the thing that dominates is the thing you change.
 */
import { STARTER_EXAMPLES } from "../app/lib/simulation/exampleSeeds";
import { assemblePortfolio } from "../app/lib/simulation/network";
import { runMonteCarlo } from "../app/lib/simulation/runner";
import type { PoolUnit } from "../app/lib/simulation/resourcePool";
import type { WorkCalendar, SimRunConfig } from "../app/lib/simulation/types";
import type { DiagramData, DiagramElement } from "../app/lib/diagram/types";

const pkg = STARTER_EXAMPLES.find((e) => e.slug === "hire-and-onboard")!.package;
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

/** Rebuild the network with `sim` patches applied to named elements. */
function variant(patches: Record<string, Record<string, unknown>>) {
  const elements: DiagramElement[] = data.elements.map((el) => {
    const patch = patches[el.id];
    if (!patch) return el;
    return { ...el, properties: { ...el.properties, sim: { ...(el.properties?.sim as object), ...patch } } };
  });
  return assemblePortfolio([{ id: root.key, data: { ...data, elements } as DiagramData }], {
    teamCapacities, strictTeams: true, teamCalendars, calendarsById: calById, teamUnits,
  });
}

const CASES: { label: string; patches: Record<string, Record<string, unknown>> }[] = [
  { label: "baseline (as shipped)", patches: {} },
  { label: "advertise 10 → 5 working days", patches: { gather: { delay: { kind: "fixed", value: 5 }, delayMode: "working-days" } } },
  { label: "start date 15 → 10 working days", patches: { startDate: { delay: { kind: "fixed", value: 10 }, delayMode: "working-days" } } },
  { label: "both windows shortened", patches: {
    gather: { delay: { kind: "fixed", value: 5 }, delayMode: "working-days" },
    startDate: { delay: { kind: "fixed", value: 10 }, delayMode: "working-days" },
  } },
  { label: "vetting provider 40h → 8h (chase harder)", patches: { vetting: { cycleTime: { kind: "triangular", min: 1, mode: 3, max: 9 }, waitTime: { kind: "fixed", value: 8 }, requiredSkills: ["Compliance Accreditation"] } } },
];

console.log("variant                                     p50    p95   vs baseline");
let basis = 0;
for (const c of CASES) {
  const s = runMonteCarlo(variant(c.patches), cfg, undefined, teamCosts).stats;
  const p50 = Math.round(s.caseFlow.p50);
  if (!basis) basis = p50;
  const delta = p50 - basis;
  console.log(
    c.label.padEnd(44) +
    String(p50).padStart(4) +
    String(Math.round(s.caseFlow.p95)).padStart(7) +
    (delta === 0 ? "        —" : `   ${delta > 0 ? "+" : ""}${delta}h (${Math.round((delta / basis) * 100)}%)`),
  );
}
