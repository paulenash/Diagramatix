/**
 * Sizing arithmetic for the Hire & Onboard example, done BEFORE authoring it.
 *
 * The example's whole argument is "the constraint is the skill, not the
 * headcount". That is a claim about utilisation, and it is either true of these
 * numbers or it is not. Checking it here is cheaper than building the model and
 * discovering the bottleneck is somewhere else.
 *
 * FIRST DRAFT FAILED: at 260 hires/yr every team sat near 20% and nothing
 * queued anywhere. The volume below (925/yr) is what makes the argument true.
 */

const triMean = (a, m, b) => (a + m + b) / 3;
const triCv = (a, m, b) => {
  const mean = (a + m + b) / 3;
  const varr = (a * a + m * m + b * b - a * m - a * b - m * b) / 18;
  return Math.sqrt(varr) / mean;
};
const r = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

const OPEN_HOURS_YEAR = 1850; // 7.5 h/day x 5 x 52, less ~8 holidays + shutdown

// ── Rework ────────────────────────────────────────────────────────────────
const pBackEarly = 0.28, pBackLate = 0.14;
const pBack = pBackEarly + (1 - pBackEarly) * pBackLate;
const passes = 1 / (1 - pBack);
const latePasses = passes * (1 - pBackEarly);

const COMPLIANCE = [2.5, 3.5, 5];
const work = {
  "Hiring Manager": [["Draft role profile", triMean(1, 1.5, 3), 1], ["Approve requisition", triMean(0.25, 0.5, 1.5), 1]],
  "Talent Acquisition": [
    ["Advertise role", 0.75, 1],
    ["Screen applications", triMean(2, 3, 5), 1],
    ["Shortlist & schedule interviews", triMean(0.75, 1, 2), passes],
    ["Interview panel", triMean(1.5, 2, 3), passes],
    ["Negotiate offer", triMean(0.5, 1, 2.5), latePasses],
  ],
  "HR Operations": [
    ["Prepare offer", triMean(0.5, 0.75, 1.25), latePasses],
    ["Compliance & vetting review", triMean(...COMPLIANCE), 1],
  ],
  "Onboarding Services": [["Prepare onboarding pack", 0.6, 1], ["Day-one induction", 3.0, 1]],
  "IT Provisioning": [["Provision laptop & accounts", triMean(0.5, 0.75, 1.5), 1]],
  Payroll: [["Create payroll record", 0.4, 1]],
};
const skilled = {
  "Compliance & vetting review": { holders: 2 },
  "Negotiate offer": { holders: 3 },
  "Create payroll record": { holders: 1 },
};
const capacity = {
  "Hiring Manager": 6, "Talent Acquisition": 8, "HR Operations": 4,
  "Onboarding Services": 3, "IT Provisioning": 2, Payroll: 1,
};

const LAMBDA = 2.0;
const rate = 1 / LAMBDA;

console.log(`REWORK  P(return) = ${r(pBack, 4)}  ->  ${r(passes, 3)} shortlist passes/case, ${r(latePasses, 3)} offer passes/case`);
console.log(`VOLUME  1 case / ${LAMBDA} open-hours  ->  ~${Math.round(OPEN_HOURS_YEAR / LAMBDA)} hires/yr\n`);
console.log("TEAM UTILISATION (the number a manager looks at)");
for (const [team, tasks] of Object.entries(work)) {
  const hours = tasks.reduce((s, [, t, n]) => s + t * n, 0);
  const util = (hours * rate) / capacity[team];
  console.log(`  ${team.padEnd(20)} ${r(hours).toString().padStart(6)} h/case  ${r(hours * rate).toString().padStart(5)} of ${capacity[team]}  = ${(util * 100).toFixed(0).padStart(3)}%`);
}
console.log("\nSKILL UTILISATION (the number that actually decides the queue)");
for (const [, tasks] of Object.entries(work)) {
  for (const [label, t, n] of tasks) {
    const sk = skilled[label];
    if (!sk) continue;
    const u = (t * n * rate) / sk.holders;
    console.log(`  ${label.padEnd(32)} over ${sk.holders} holder(s) = ${(u * 100).toFixed(0).padStart(3)}%${u > 0.85 ? "   <-- THE CONSTRAINT" : ""}`);
  }
}

// ── Queue wait at the constraint, M/M/c with a variability correction ──────
function erlangC(c, a) {
  let s = 0, term = 1;
  for (let k = 0; k < c; k++) { if (k > 0) term *= a / k; s += term; }
  const last = term * (a / c);
  const rho = a / c;
  return last / (1 - rho) / (s + last / (1 - rho));
}
const compMean = triMean(...COMPLIANCE);
const cs2 = triCv(...COMPLIANCE) ** 2;
console.log(`\nQUEUE AT THE CONSTRAINT  (service ${r(compMean)} h, Cs^2 = ${r(cs2, 3)}, arrivals Poisson)`);
for (const holders of [2, 3, 4, 5, 6]) {
  const a = compMean * rate;               // offered load in erlangs
  if (a >= holders) { console.log(`  ${holders} trained -> UNSTABLE (load ${r(a, 2)} >= ${holders})`); continue; }
  const wqMM = erlangC(holders, a) / (holders / compMean - rate);
  const wq = wqMM * (1 + cs2) / 2;         // Allen-Cunneen
  console.log(`  ${holders} trained -> ${((a / holders) * 100).toFixed(0).padStart(3)}% util, queue wait ~${r(wq, 1).toString().padStart(6)} open-h  (~${r(wq / 7.5, 2)} working days)`);
}

// ── Where does it saturate? The knee the arrival sweep should find. ────────
console.log("\nSATURATION VOLUME (where the arrival sweep's knee should sit)");
for (const holders of [2, 3]) {
  const lamCrit = compMean / holders;      // inter-arrival at 100% load
  console.log(`  ${holders} trained: 100% at ${r(lamCrit, 2)} h between hires (${Math.round(OPEN_HOURS_YEAR / lamCrit)}/yr); ` +
              `85% at ${r(lamCrit / 0.85, 2)} h (${Math.round(OPEN_HOURS_YEAR / (lamCrit / 0.85))}/yr)`);
}

// ── Tornado budget ────────────────────────────────────────────────────────
const teams = Object.keys(capacity).length;
const tasks = Object.values(work).flat().length;
const params = teams + 1 + tasks;
console.log(`\nTORNADO  ${teams} teams + 1 source + ${tasks} tasks = ${params} parameters -> ${2 * params + 1} runs`);
console.log(`  maxSweepSteps is 24, so only ${Math.floor((24 - 1) / 2)} parameters fit; ${params - Math.floor((24 - 1) / 2)} would be DROPPED.`);
console.log(`  maxWork check: ${2 * params + 1} runs x 8760 h x 10 reps = ${((2 * params + 1) * 8760 * 10 / 1e6).toFixed(2)}M of the 5M budget.`);
