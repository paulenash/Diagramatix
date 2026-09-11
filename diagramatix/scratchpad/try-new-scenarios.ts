/**
 * The proposed scenario set, run through the REAL override mechanism.
 *
 * Not through a hand-patched diagram: the scenarios ship as OverrideSets, and an
 * override that silently matches no node produces a scenario identical to the
 * baseline — which is exactly the symptom being fixed, so it must not be the way
 * the fix is verified.
 */
import { STARTER_EXAMPLES } from "../app/lib/simulation/exampleSeeds";
import { assemblePortfolio } from "../app/lib/simulation/network";
import { applyOverrides, type OverrideSet } from "../app/lib/simulation/overrides";
import { runMonteCarlo } from "../app/lib/simulation/runner";
import type { PoolUnit } from "../app/lib/simulation/resourcePool";
import type { WorkCalendar, SimRunConfig } from "../app/lib/simulation/types";
import type { DiagramData } from "../app/lib/diagram/types";

const pkg = STARTER_EXAMPLES.find((e) => e.slug === "hire-and-onboard")!.package;
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

// What are the node ids actually called? An override keyed wrongly is a no-op.
const timerIds = net.nodes.filter((n) => /gather|startDate/i.test(n.id)).map((n) => n.id);
console.log("timer node ids:", timerIds.join(", "), "\n");

const GATHER = timerIds.find((i) => /gather/i.test(i))!;
const START = timerIds.find((i) => /startDate/i.test(i))!;

const HR = "HR Operations";
const trainMarta = { name: "Marta Silva", skills: ["Onboarding Administration", "Compliance Accreditation"] };
const d = (v: number) => ({ delay: { kind: "fixed" as const, value: v } });

const SCENARIOS: { name: string; ov: OverrideSet }[] = [
  { name: "As-is — today's team", ov: {} },
  { name: "More desks, no more people", ov: { teams: { [HR]: { capacity: 6 } } } },
  { name: "Hire two more administrators", ov: { teams: { [HR]: { capacity: 6, members: [
    { name: "New Starter A", skills: ["Onboarding Administration"] },
    { name: "New Starter B", skills: ["Onboarding Administration"] },
  ] } } } },
  { name: "Train a third checker", ov: { teams: { [HR]: { members: [trainMarta] } } } },
  { name: "Advertise for one week, not two", ov: { elements: { [GATHER]: d(5) } } },
  { name: "Advertise one week + four-week notice", ov: { elements: { [GATHER]: d(5), [START]: d(10) } } },
  { name: "Both windows + a third checker", ov: {
    elements: { [GATHER]: d(5), [START]: d(10) },
    teams: { [HR]: { members: [trainMarta] } },
  } },
];

const cfg = pkg.scenarios[0].runConfig as SimRunConfig;
console.log("scenario                                 p50   p95   sd  completed  cost/case  vs baseline");
let basis = 0;
for (const s of SCENARIOS) {
  const n = Object.keys(s.ov).length ? applyOverrides(net, s.ov as OverrideSet) : net;
  const st = runMonteCarlo(n, cfg, undefined, teamCosts).stats;
  const p50 = Math.round(st.caseFlow.p50);
  if (!basis) basis = p50;
  const dlt = p50 - basis;
  console.log(
    s.name.padEnd(40) +
    String(p50).padStart(5) +
    String(Math.round(st.caseFlow.p95)).padStart(6) +
    String(Math.round(st.caseFlow.sd)).padStart(5) +
    String(Math.round(st.completed.mean)).padStart(10) +
    ("$" + Math.round(st.costPerCase.mean)).padStart(11) +
    (dlt === 0 ? "        —" : `   ${dlt > 0 ? "+" : ""}${dlt}h (${Math.round((dlt / basis) * 100)}%)`),
  );
}
