/**
 * Does the authored example actually behave the way the plan predicted?
 *
 * This is the check that matters: the sizing arithmetic said HR Operations would
 * sit near 56% while its two accredited people ran at 92%. If the built model
 * disagrees, the example teaches nothing and the numbers in the plan are wrong.
 */
import { STARTER_EXAMPLES } from "../app/lib/simulation/exampleSeeds";
import { validateExamplePackage } from "../app/lib/simulation/examplePackage";
import { assemblePortfolio } from "../app/lib/simulation/network";
import { applyOverrides, type OverrideSet } from "../app/lib/simulation/overrides";
import { runMonteCarlo } from "../app/lib/simulation/runner";
import { skillsFromArchimate, matchSkills } from "../app/lib/simulation/skillsFromArchimate";
import type { PoolUnit } from "../app/lib/simulation/resourcePool";
import type { WorkCalendar } from "../app/lib/simulation/types";
import type { DiagramData } from "../app/lib/diagram/types";

const ex = STARTER_EXAMPLES.find((e) => e.slug === "hire-and-onboard")!;
const pkg = ex.package;
const r2 = (n: number) => Math.round(n * 100) / 100;

console.log("── validation ──");
const errs = validateExamplePackage(pkg);
console.log(errs.length ? errs.map((e) => "  ✗ " + e).join("\n") : "  ✓ package valid");

// ── assemble exactly as a run does ────────────────────────────────────────
const teamCapacities = Object.fromEntries(pkg.teams.map((t) => [t.name, t.capacity]));
const teamCosts = Object.fromEntries(pkg.teams.filter((t) => t.costPerHour != null).map((t) => [t.name, t.costPerHour as number]));
const teamUnits: Record<string, PoolUnit[]> = {};
for (const t of pkg.teams) {
  if (!t.members?.length) continue;
  teamUnits[t.name] = t.members.map((m) => ({ id: m.name, name: m.name, skills: m.skills }));
}
const calById = Object.fromEntries((pkg.calendars ?? []).map((c) => [c.name, c.pattern as WorkCalendar]));
const teamCalendars: Record<string, WorkCalendar> = {};
for (const t of pkg.teams) if (t.calendarName && calById[t.calendarName]) teamCalendars[t.name] = calById[t.calendarName];

const root = pkg.diagrams.find((d) => d.key === pkg.study.rootKeys[0])!;
const baseline = assemblePortfolio([{ id: root.key, data: root.data }], {
  teamCapacities, strictTeams: true, teamCalendars, calendarsById: calById, teamUnits,
});

console.log("\n── the model reaching the engine ──");
console.log(`  nodes ${baseline.nodes.length}, teams ${baseline.teams.length}`);
for (const t of baseline.teams) {
  const holders = (t.units ?? []).length;
  console.log(`  ${t.id.padEnd(22)} capacity ${t.capacity}${holders ? `, ${holders} named` : " (counted pool)"}`);
}
const skilled = baseline.nodes.filter((n) => n.requiredSkills?.length);
console.log(`  tasks with a skill requirement: ${skilled.length}`);
for (const n of skilled) console.log(`    ${(n.label ?? n.id).padEnd(32)} needs ${n.requiredSkills!.join(" + ")}`);
const batched = baseline.nodes.filter((n) => n.batch);
console.log(`  delay nodes: ${baseline.nodes.filter((n) => n.kind === "delay").length}, batched: ${batched.length}`);

// ── run each scenario ─────────────────────────────────────────────────────
console.log("\n── scenarios ──");
type Row = { name: string; util: Record<string, number>; p50: number; p95: number; queue: number; proc: number; done: number; arrived: number; cost: number };
const rows: Row[] = [];
for (const sc of pkg.scenarios) {
  const net = applyOverrides(baseline, (sc.overrides ?? {}) as OverrideSet);
  const { stats } = runMonteCarlo(net, sc.runConfig, sc.runConfig.interventions, teamCosts);
  const done = stats.completed?.mean ?? 0;
  rows.push({
    name: sc.name,
    util: Object.fromEntries(Object.entries(stats.perTeam).map(([k, v]) => [k, v.utilization.mean])),
    p50: stats.caseFlow?.p50 ?? stats.flowTime.p50,
    p95: stats.caseFlow?.p95 ?? stats.flowTime.p95,
    queue: done > 0 && stats.queueWait ? stats.queueWait.mean / done : NaN,
    proc: done > 0 && stats.processWait ? stats.processWait.mean / done : NaN,
    done,
    arrived: stats.arrived?.mean ?? 0,
    cost: stats.costPerCase?.mean ?? 0,
  });
}

const OPEN_DAY = 7.5;
for (const r of rows) {
  console.log(`\n  ${r.name}`);
  console.log(`    arrived ${Math.round(r.arrived)}  completed ${Math.round(r.done)}   flow p50 ${r2(r.p50)} h   p95 ${r2(r.p95)} h   cost/case ${r2(r.cost)}`);
  console.log(`    queue wait/case ${r2(r.queue)} h = ${r2(r.queue / OPEN_DAY)} wd    process wait/case ${r2(r.proc)} h = ${r2(r.proc / OPEN_DAY)} wd`);
  console.log(`    utilisation: ${Object.entries(r.util).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(", ")}`);
}

console.log("\n── the argument ──");
const base = rows[0], desks = rows[1], hire = rows[2], train = rows[3];
const busiest = Math.max(...Object.values(base.util));
console.log(`  busiest TEAM at baseline: ${Math.round(busiest * 100)}%  (plan said < 65%)`);
console.log(`  baseline queue/case: ${r2(base.queue / OPEN_DAY)} working days  (plan said ~1.9)`);
console.log(`  "more desks" identical to baseline? p50 ${desks.p50 === base.p50}, p95 ${desks.p95 === base.p95}, completed ${desks.done === base.done}`);
console.log(`  "hire two"  queue: ${r2(hire.queue / OPEN_DAY)} d   (expected ~= baseline)`);
console.log(`  "train one" queue: ${r2(train.queue / OPEN_DAY)} d   (plan said ~0.1)`);
console.log(`  train vs baseline queue ratio: ${r2(train.queue / base.queue)}  (plan said < 0.25)`);

// ── the ArchiMate fill ────────────────────────────────────────────────────
console.log("\n── ArchiMate fill ──");
const companion = pkg.diagrams.find((d) => d.key === (pkg.companionKeys ?? [])[0])!;
const model = skillsFromArchimate(companion.data as DiagramData);
const memberNames = pkg.teams.flatMap((t) => (t.members ?? []).map((m) => m.name));
const taskLabels = [...new Set((root.data as DiagramData).elements.filter((e) => e.type === "task").map((e) => (e.label ?? "").trim()))];
const match = matchSkills(model, memberNames, taskLabels);
console.log(`  actors ${model.people.length}, leaf skills ${model.skills.length}: ${model.skills.join(", ")}`);
console.log(`  would fill ${match.units.length} members and ${Object.keys(match.taskSkills).length} tasks`);
console.log(`  unmatched actors : ${match.unmatchedActors.join(", ") || "(none)"}`);
console.log(`  unmatched members: ${match.unmatchedMembers.join(", ") || "(none)"}`);
console.log(`  unmatched work   : ${match.unmatchedWork.join(", ") || "(none)"}`);
console.log(`  warnings         : ${match.warnings.join(" | ") || "(none)"}`);
const accredited = match.units.filter((u) => u.skills.includes("Compliance Accreditation"));
console.log(`  hold Compliance Accreditation: ${accredited.length} — ${accredited.map((u) => u.name).join(", ")}`);
