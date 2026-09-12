import { STARTER_EXAMPLES } from "../app/lib/simulation/exampleSeeds";
import { assemblePortfolio } from "../app/lib/simulation/network";
import { runMonteCarlo } from "../app/lib/simulation/runner";
import type { PoolUnit } from "../app/lib/simulation/resourcePool";
import type { WorkCalendar, SimRunConfig } from "../app/lib/simulation/types";
import type { DiagramData } from "../app/lib/diagram/types";
const pkg = STARTER_EXAMPLES.find((e) => e.slug === "hire-and-onboard")!.package;
const root = pkg.diagrams.find((d) => d.key === pkg.study.rootKeys[0])!;
const TEAM = "HR Operations", SKILL = "Compliance Accreditation", ONB = "Onboarding Administration";
const teamCapacities = Object.fromEntries(pkg.teams.map((t) => [t.name, t.capacity]));
const teamCosts = Object.fromEntries(pkg.teams.filter((t) => t.costPerHour != null).map((t) => [t.name, t.costPerHour as number]));
const calById = Object.fromEntries((pkg.calendars ?? []).map((c) => [c.name, c.pattern as WorkCalendar]));
const teamCalendars: Record<string, WorkCalendar> = {};
for (const t of pkg.teams) if (t.calendarName && calById[t.calendarName]) teamCalendars[t.name] = calById[t.calendarName];
function run(members: { name: string; skills: string[] }[]) {
  const units: Record<string, PoolUnit[]> = {};
  for (const t of pkg.teams) { const r = t.name === TEAM ? members : (t.members ?? []); if (r.length) units[t.name] = r.map((m) => ({ id: m.name, name: m.name, skills: m.skills })); }
  const net = assemblePortfolio([{ id: root.key, data: root.data as DiagramData }], { teamCapacities, strictTeams: true, teamCalendars, calendarsById: calById, teamUnits: units });
  const s = runMonteCarlo(net, pkg.scenarios[0].runConfig as SimRunConfig, undefined, teamCosts).stats;
  const hit = Object.entries(s.perNode).find(([k]) => k.endsWith("vetting"));
  return { wait: hit ? hit[1].wait.mean : NaN, util: s.perTeam[TEAM]?.utilization.mean ?? 0, p50: s.caseFlow.p50, done: s.completed.mean };
}
const two = [{name:"Grace Oduya",skills:[ONB,SKILL]},{name:"Ruth Ellis",skills:[ONB,SKILL]},{name:"Ben Carter",skills:[ONB]},{name:"Marta Silva",skills:[ONB]}];
const one = two.map(m=>m.name==="Ruth Ellis"?{name:m.name,skills:[ONB]}:m);
const three = two.map(m=>m.name==="Ben Carter"?{name:m.name,skills:[ONB,SKILL]}:m);
for (const [n, ms] of [["3 of 4", three], ["2 of 4", two], ["1 of 4", one]] as const) {
  const r = run(ms as {name:string;skills:string[]}[]);
  console.log(`${n}  vetting wait ${String(Math.round(r.wait*100)/100).padStart(7)} h   team util ${Math.round(r.util*100)}%   p50 ${Math.round(r.p50)} h   completed ${Math.round(r.done)}`);
}
