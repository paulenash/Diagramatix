/**
 * The whole chain, in the shipped Hire & Onboard example, printed link by link.
 *
 * ArchiMate → team members' skills → the task's requirement → the pool → the
 * queue. Each link is read from the real shipped data, so this is what the
 * example actually does rather than what it is meant to do.
 */
import { STARTER_EXAMPLES } from "../app/lib/simulation/exampleSeeds";
import { skillsFromArchimate, matchSkills } from "../app/lib/simulation/skillsFromArchimate";
import { assemblePortfolio } from "../app/lib/simulation/network";
import { runMonteCarlo } from "../app/lib/simulation/runner";
import type { PoolUnit } from "../app/lib/simulation/resourcePool";
import type { WorkCalendar, SimRunConfig } from "../app/lib/simulation/types";
import type { DiagramData } from "../app/lib/diagram/types";

const pkg = STARTER_EXAMPLES.find((e) => e.slug === "hire-and-onboard")!.package;
const archi = pkg.diagrams.find((d) => d.key === "hire-operating-model")!;
const root = pkg.diagrams.find((d) => d.key === pkg.study.rootKeys[0])!;
const bpmn = root.data as DiagramData;
const TEAM = "HR Operations";
const SKILL = "Compliance Accreditation";

console.log("① ARCHIMATE — who is in the team, and who holds what");
const model = skillsFromArchimate(archi.data as DiagramData);
const team = model.teams.find((t) => t.name === TEAM)!;
console.log(`   Team "${team.name}" aggregates: ${team.members.join(", ")}`);
for (const name of team.members) {
  const p = model.people.find((x) => x.name === name)!;
  console.log(`     ${name.padEnd(14)} skills: ${p.skills.join(", ") || "(none)"}${p.roles.length ? `   post: ${p.roles.join(", ")}` : ""}`);
}

console.log("\n② FILL — what that writes onto the Team library");
const memberNames = pkg.teams.flatMap((t) => (t.members ?? []).map((m) => m.name));
const taskLabels = [...new Set(bpmn.elements.filter((e) => e.type === "task").map((e) => (e.label ?? "").trim()))];
const match = matchSkills(model, memberNames, taskLabels);
for (const u of match.units.filter((u) => (pkg.teams.find((t) => t.name === TEAM)!.members ?? []).some((m) => m.name === u.name))) {
  console.log(`   ${u.name.padEnd(14)} → ${u.skills.join(", ")}`);
}

console.log("\n③ BPMN — the task, its lane, and what it requires");
const laneOf = new Map(bpmn.elements.filter((e) => e.type === "lane").map((e) => [e.id, e.label]));
for (const el of bpmn.elements) {
  const req = (el.properties?.sim as { requiredSkills?: string[] } | undefined)?.requiredSkills;
  if (!req?.length) continue;
  const lane = el.parentId ? laneOf.get(el.parentId) : undefined;
  console.log(`   "${el.label}"  lane: ${lane ?? "(none)"}  requires: ${req.join(" + ")}`);
}

console.log("\n④ POOL — who the engine will actually consider");
const teamCapacities = Object.fromEntries(pkg.teams.map((t) => [t.name, t.capacity]));
const teamCosts = Object.fromEntries(pkg.teams.filter((t) => t.costPerHour != null).map((t) => [t.name, t.costPerHour as number]));
const teamUnits: Record<string, PoolUnit[]> = {};
for (const t of pkg.teams) if (t.members?.length) teamUnits[t.name] = t.members.map((m) => ({ id: m.name, name: m.name, skills: m.skills }));
const calById = Object.fromEntries((pkg.calendars ?? []).map((c) => [c.name, c.pattern as WorkCalendar]));
const teamCalendars: Record<string, WorkCalendar> = {};
for (const t of pkg.teams) if (t.calendarName && calById[t.calendarName]) teamCalendars[t.name] = calById[t.calendarName];

const hr = teamUnits[TEAM];
console.log(`   Team capacity: ${teamCapacities[TEAM]} people`);
console.log(`   Eligible for "${SKILL}": ${hr.filter((u) => u.skills.includes(SKILL)).map((u) => u.name).join(", ")}`);
console.log(`   NOT eligible:            ${hr.filter((u) => !u.skills.includes(SKILL)).map((u) => u.name).join(", ")}`);

console.log("\n⑤ RUN — the queue that follows");
const net = assemblePortfolio([{ id: root.key, data: bpmn }], {
  teamCapacities, strictTeams: true, teamCalendars, calendarsById: calById, teamUnits,
});
const node = net.nodes.find((n) => n.id.endsWith("vetting"))!;
console.log(`   node "${node.id}" carries requiredSkills = ${JSON.stringify(node.requiredSkills)}`);
const s = runMonteCarlo(net, pkg.scenarios[0].runConfig as SimRunConfig, undefined, teamCosts).stats;
const wait = Object.entries(s.perNode).find(([k]) => k.endsWith("vetting"))![1].wait.mean;
console.log(`   team utilisation: ${Math.round((s.perTeam[TEAM]?.utilization.mean ?? 0) * 100)}%`);
console.log(`   wait at the vetting step: ${Math.round(wait * 100) / 100} h`);
console.log("\n   The team is not busy. Two of its four people are the constraint.");
