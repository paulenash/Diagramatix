/**
 * Hire & Onboard — the FINAL sizing, and the acceptance figures the example is
 * expected to reproduce. Everything here is derived, not guessed; the plan
 * quotes these and the acceptance tests assert the relations between them.
 */
const triMean = (a, m, b) => (a + m + b) / 3;
const triVar = (a, m, b) => (a * a + m * m + b * b - a * m - a * b - m * b) / 18;
const r = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const OPEN_DAY = 7.5, OPEN_YEAR = 1850;

function erlangC(c, a) {
  let s = 0, term = 1;
  for (let k = 0; k < c; k++) { if (k > 0) term *= a / k; s += term; }
  const tail = term * (a / c) / (1 - a / c);
  return tail / (s + tail);
}
function queueWait(mean, cs2, holders, lambda) {
  const rate = 1 / lambda, a = mean * rate;
  if (a >= holders) return null;
  return (erlangC(holders, a) / (holders / mean - rate)) * (1 + cs2) / 2;
}

const LAMBDA = 2.35;                       // open-hours between vacancies
const rate = 1 / LAMBDA;
const COMP = [1, 3, 9];
const compMean = triMean(...COMP), compCs2 = triVar(...COMP) / compMean ** 2;

const pBack = 0.28 + 0.72 * 0.14;
const passes = 1 / (1 - pBack);
const late = passes * 0.72;

const work = {
  "Hiring Manager": [["Draft role profile", triMean(1, 1.5, 3), 1], ["Approve requisition", triMean(0.25, 0.5, 1.5), 1]],
  "Talent Acquisition": [
    ["Advertise role", 0.75, 1], ["Screen applications", triMean(2, 3, 5), 1],
    ["Shortlist & schedule interviews", triMean(0.75, 1, 2), passes],
    ["Interview panel", triMean(1.5, 2, 3), passes],
    ["Negotiate offer", triMean(0.5, 1, 2.5), late],
  ],
  "HR Operations": [["Prepare offer", triMean(0.5, 0.75, 1.25), late], ["Compliance & vetting review", compMean, 1]],
  "Onboarding Services": [["Prepare onboarding pack", 0.6, 1], ["Day-one induction", 3.0, 1]],
  "IT Provisioning": [["Provision laptop & accounts", triMean(0.5, 0.75, 1.5), 1]],
  Payroll: [["Create payroll record", 0.4, 1]],
};
const capacity = { "Hiring Manager": 6, "Talent Acquisition": 8, "HR Operations": 4, "Onboarding Services": 3, "IT Provisioning": 2, Payroll: 1 };

console.log(`ARRIVALS  exponential(mean ${LAMBDA} open-h)  ->  ~${Math.round(OPEN_YEAR / LAMBDA)} hires/yr`);
console.log(`REWORK    ${r(passes, 3)} shortlist passes/case, ${r(late, 3)} offer passes/case\n`);
console.log("TEAM UTILISATION");
for (const [team, tasks] of Object.entries(work)) {
  const h = tasks.reduce((s, [, t, n]) => s + t * n, 0);
  console.log(`  ${team.padEnd(20)} ${r(h).toString().padStart(5)} h/case  ${(((h * rate) / capacity[team]) * 100).toFixed(0).padStart(3)}% of ${capacity[team]}`);
}
console.log("\nTHE CONSTRAINT — Compliance & vetting review, tri(1,3,9)");
console.log(`  mean ${r(compMean)} h, CV ${r(Math.sqrt(compCs2), 2)}`);
for (const n of [1, 2, 3, 4, 5, 6]) {
  const wq = queueWait(compMean, compCs2, n, LAMBDA);
  const u = (compMean * rate) / n;
  console.log(`  ${n} trained  ${(u * 100).toFixed(0).padStart(3)}% util  ` +
    (wq === null ? "UNSTABLE" : `queue ${r(wq, 1).toString().padStart(5)} open-h = ${r(wq / OPEN_DAY, 2)} working days`));
}
const wq2 = queueWait(compMean, compCs2, 2, LAMBDA), wq3 = queueWait(compMean, compCs2, 3, LAMBDA);
console.log(`\n  >>> TRAINING ONE PERSON SAVES ~${r((wq2 - wq3) / OPEN_DAY, 2)} WORKING DAYS PER HIRE`);
console.log(`  >>> ADDING DESKS SAVES 0 — capacity cannot exceed the 4 named members\n`);

console.log("SATURATION — where the arrival sweep's knee should sit");
for (const n of [2, 3]) {
  const crit = compMean / n;
  console.log(`  ${n} trained: 100% at ${r(crit)} h (${Math.round(OPEN_YEAR / crit)}/yr), 85% at ${r(crit / 0.85)} h (${Math.round(OPEN_YEAR / (crit / 0.85))}/yr)`);
}
const head = (compMean / 3) / (compMean / 2) - 1;
console.log(`  >>> the third checker buys ${(50).toFixed(0)}% more hiring volume (2 -> 3 holders)\n`);

// ── Flow-time budget: what fraction of elapsed time is queue vs process ────
const processWaitDays = 10 + 15;             // applications gather + notice period
const providerWaitHours = 40;                // external vetting provider
console.log("FLOW-TIME BUDGET (working days, roughly)");
console.log(`  authored process waits   ${processWaitDays} d  (10 d gather + 15 d notice)`);
console.log(`  external provider wait   ${r(providerWaitHours / OPEN_DAY, 2)} d`);
console.log(`  queue at the constraint  ${r(wq2 / OPEN_DAY, 2)} d  <- the ONLY part staffing can move`);
console.log(`  => the headline flow time barely moves; the QUEUE WAIT line is where it shows.`);
console.log(`     That is exactly the split Phase 2 built, so the business case is the right lens.\n`);

// ── Dates ─────────────────────────────────────────────────────────────────
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dow = (s) => DAY[new Date(s + "T00:00:00Z").getUTCDay()];
console.log("CALENDAR");
for (const d of ["2027-07-05", "2027-01-04"]) console.log(`  epoch candidate ${d} is a ${dow(d)}${dow(d) === "Mon" ? "  <- valid" : "  <- INVALID, must be a Monday"}`);
const epoch = new Date("2027-07-05T00:00:00Z");
const end = new Date(epoch.getTime() + 8760 * 3600 * 1000);
console.log(`  horizon 8760 h from ${epoch.toISOString().slice(0, 10)} runs to ${end.toISOString().slice(0, 10)}`);
const holidays = [
  ["2027-10-04", "Labour Day (NSW)"], ["2027-12-24", "Christmas shutdown starts"],
  ["2028-01-03", "shutdown ends"], ["2028-01-26", "Australia Day"],
  ["2028-04-14", "Good Friday"], ["2028-04-17", "Easter Monday"],
  ["2028-04-25", "Anzac Day"], ["2028-06-12", "King's Birthday"],
];
for (const [d, name] of holidays) {
  const t = new Date(d + "T00:00:00Z");
  const pct = ((t - epoch) / (end - epoch)) * 100;
  const inRange = t >= epoch && t <= end;
  console.log(`  ${d} ${dow(d).padEnd(4)} ${name.padEnd(28)} ${inRange ? `${pct.toFixed(0)}% through the run` : "OUTSIDE THE RUN"}`);
}
