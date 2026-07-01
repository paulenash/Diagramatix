/**
 * Generate the "Aardwolf Loan Approval — As-is vs To-be" comparison example and
 * merge it into app/lib/simulation/exampleData.json.
 *
 * Source: simulation/Aardwolf Loan Processes.diagramatix.json — two structurally
 * complete BPMN diagrams (as-is manual assessment, to-be AI-assisted) that carry
 * NO simulation parameters. This script parameterizes both (team per lane, task
 * cycle times, an arrival rate, gateway split probabilities) so the example runs
 * out-of-the-box and the to-be visibly beats the as-is, then packages them as a
 * single study with both diagrams as roots + two variant scenarios (As-is pinned
 * to the as-is diagram, To-be to the to-be diagram) — the shape the as-is/to-be
 * comparison feature consumes.
 *
 * Re-run with:  node scripts/gen-aardwolf-example.cjs
 */
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "simulation", "Aardwolf Loan Processes.diagramatix.json");
const OUT = path.join(__dirname, "..", "app", "lib", "simulation", "exampleData.json");
const SLUG = "aardwolf-loan-comparison";

// ── Parameter tables ───────────────────────────────────────────────────────
// Team library (capacity). The to-be's AI Agent lane is high-throughput + fast;
// the as-is Loan Assessment Team is the human bottleneck it replaces.
const TEAMS = [
  { name: "Loan Assessment Team", capacity: 3, costPerHour: 45 },       // as-is human bottleneck
  { name: "Loan Assessment AI Agent", capacity: 12, costPerHour: 3 },   // to-be automated
  { name: "Loan Assessment Specialist", capacity: 2, costPerHour: 60 }, // to-be exceptions only
  { name: "Personal Loans Team", capacity: 3, costPerHour: 40 },
  { name: "Home Loans Team", capacity: 3, costPerHour: 45 },
  { name: "Commercial Loans Team", capacity: 2, costPerHour: 55 },
];

// Task cycle times (minutes) keyed by the lane that owns the task, then label.
const AI = { "Register Application": 2, "Check Application Completeness": 2, "Verify Identity and Documents": 4, "Obtain Credit Report": 2, "Assess Eligibility and Affordability": 3, "Send Decline Letter": 1 };
const HUMAN = { "Register Application": 15, "Check Application Completeness": 20, "Verify Identity and Documents": 30, "Request Further Information": 10, "Obtain Credit Report": 20, "Receive Customer Response": 15, "Assess Eligibility and Affordability": 45, "Send Decline Letter": 8, "Send Loan Outcome": 10 };
const SPEC = { "Receive Response": 10, "Review Exception": 30, "Request Further Information": 12, "Resolve Exception": 35 };
// The loan-drafting steps (in the Personal/Home/Commercial lanes) — done by their
// own teams, so they carry real work + queue.
const DRAFT = { "Draft and Approve Personal Loan": 40, "Draft and Approve Home Loan": 60, "Draft and Approve Commercial Loan": 90 };

function cycleFor(lane, label) {
  let mean;
  if (DRAFT[label]) mean = DRAFT[label];
  else if (lane === "Loan Assessment AI Agent") mean = AI[label] ?? 3;
  else if (lane === "Loan Assessment Specialist") mean = SPEC[label] ?? 15;
  else if (lane === "Loan Assessment Team") mean = HUMAN[label] ?? 15;
  else mean = 10; // Personal/Home/Commercial handling tasks (e.g. Send Outcome)
  const sd = Math.max(0.5, Math.round(mean * 0.2 * 10) / 10);
  return { kind: "normal", mean, sd };
}

// Same arrival for both variants so the comparison is fair. Triangular
// inter-arrival (min/mode/max minutes) → ~1 application every ~67 min; keeps the
// as-is Assessment Team busy (~0.65 util) but stable, to-be barely loaded.
const ARRIVAL = { kind: "triangular", min: 40, mode: 60, max: 100 };

// Decision gateway splits: gateway label → { target element label → % }.
const SPLITS = {
  "Complete and Verified?": { "Request Further Information": 25, "Obtain Credit Report": 75 },
  "Confidence Check": { "Review Exception": 20, "Exception Handled": 80 },
  "Proceed?": { "Send Decline Letter": 20, "Determine Loan Type": 80 },
  "Determine Loan Type": { "Draft and Approve Personal Loan": 50, "Draft and Approve Home Loan": 35, "Draft and Approve Commercial Loan": 15 },
};

const RUN_CONFIG = { clockUnit: "minute", horizon: 20160, warmUp: 240, replications: 6, seed: 1, collectQueues: true }; // 2 weeks

// ── Parameterize one diagram in place ──────────────────────────────────────
function parameterize(data) {
  const els = data.elements;
  const byId = new Map(els.map((e) => [e.id, e]));
  const laneOf = (el) => {
    let cur = el;
    for (let i = 0; i < 8 && cur; i++) {
      if (cur.type === "lane") return cur.label;
      cur = cur.parentId ? byId.get(cur.parentId) : null;
    }
    return undefined;
  };
  const isProcessSource = (el) => {
    if (el.type !== "start-event" || el.boundaryHostId) return false;
    const p = el.parentId ? byId.get(el.parentId) : undefined;
    return !p || p.type === "pool" || p.type === "lane";
  };

  // The "Draft and Approve X Loan" steps are drawn as empty (bodyless)
  // subprocesses, which pass through instantly and seize no team — so the loan
  // teams would idle and the readiness check would flag them as team-less. Make
  // them real tasks so they carry work on their lane's team.
  for (const el of els) {
    if (/^Draft and Approve/.test(el.label || "") && el.type === "subprocess") el.type = "task";
  }

  for (const el of els) {
    const sim = (el.properties = el.properties || {}).sim = el.properties.sim || {};
    if (el.type === "task") {
      const lane = laneOf(el);
      if (lane) sim.teamId = lane;
      sim.cycleTime = cycleFor(lane, el.label);
      sim.resourceUnits = 1;
    } else if (isProcessSource(el)) {
      sim.arrival = ARRIVAL;
    }
  }

  // Gateway split probabilities onto the out-connectors.
  for (const el of els) {
    if (el.type !== "gateway" || !SPLITS[el.label]) continue;
    const map = SPLITS[el.label];
    for (const c of data.connectors) {
      if (c.sourceId !== el.id) continue;
      const targetLabel = byId.get(c.targetId)?.label;
      if (targetLabel && map[targetLabel] != null) c.branchProbability = map[targetLabel];
    }
  }
  return data;
}

// ── Build the package ──────────────────────────────────────────────────────
const raw = JSON.parse(fs.readFileSync(SRC, "utf8"));
const byRole = (needle) => raw.diagrams.find((d) => d.name.toLowerCase().includes(needle));
const asis = byRole("as-is") || byRole("(as");
const tobe = byRole("to-be") || byRole("(to");
if (!asis || !tobe) throw new Error("Could not find as-is / to-be diagrams in the export");

const pkg = {
  version: 1,
  teams: TEAMS,
  diagrams: [
    { key: "aardwolf-asis", name: asis.name, type: asis.type || "bpmn", data: parameterize(asis.data) },
    { key: "aardwolf-tobe", name: tobe.name, type: tobe.type || "bpmn", data: parameterize(tobe.data) },
  ],
  study: { name: "Aardwolf Loan Approval — As-is vs To-be", rootKeys: ["aardwolf-asis", "aardwolf-tobe"] },
  scenarios: [
    { name: "As-is (manual assessment)", isBaseline: true, runConfig: RUN_CONFIG, overrides: {}, variantRootKeys: ["aardwolf-asis"] },
    { name: "To-be (AI-assisted)", runConfig: RUN_CONFIG, overrides: {}, variantRootKeys: ["aardwolf-tobe"] },
  ],
};

const example = {
  slug: SLUG,
  title: "Aardwolf Loans — As-is vs To-be",
  concept: "Process comparison: does automating loan assessment with an AI agent cut cycle time and cost?",
  description:
    "A side-by-side comparison study for Aardwolf Loans' loan-application process. " +
    "The As-is scenario runs the manual process where one Loan Assessment Team handles every intake, verification and eligibility step. " +
    "The To-be scenario runs the redesigned process where a Loan Assessment AI Agent performs the routine assessment work and human specialists only handle exceptions. " +
    "Run both and open the comparison to see the drop in cycle time, queueing and human cost.",
  difficulty: "advanced",
  package: pkg,
};

// ── Merge into exampleData.json (replace any existing entry by slug) ────────
const out = JSON.parse(fs.readFileSync(OUT, "utf8"));
out.examples = out.examples.filter((e) => e.slug !== SLUG);
out.examples.push(example);
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");

console.log(`Wrote ${SLUG}: ${pkg.diagrams.length} diagrams, ${pkg.teams.length} teams, ${pkg.scenarios.length} scenarios.`);
console.log("  roots:", pkg.study.rootKeys.join(", "));
console.log("  scenarios:", pkg.scenarios.map((s) => `${s.name} → ${s.variantRootKeys.join("+")}`).join("  |  "));
