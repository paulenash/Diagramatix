/**
 * Generate the "Sales & Marketing Enquiry — subprocess drill-through" example and
 * merge it into app/lib/simulation/exampleData.json.
 *
 * Source: simulation/Sales and Marketing Enquiry Process.diagramatix.json — a
 * project export of 3 BPMN diagrams: a parent (P01 Sales Enquiry Process) whose
 * two collapsed subprocesses link to P01.1 Sales Process and P01.2 Marketing
 * Process. All tasks are already parameterised (cycle time + team + arrival).
 *
 * The parent's subprocess `linkedDiagramId` references the children by their
 * ORIGINAL diagram ids; we rewrite them to the package KEYS so the adopt route
 * can remap them to the freshly-minted ids (drill-down + simulation resolve them).
 *
 * Re-run:  node scripts/gen-sales-marketing-example.cjs
 */
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "simulation", "Sales and Marketing Enquiry Process.diagramatix.json");
const OUT = path.join(__dirname, "..", "app", "lib", "simulation", "exampleData.json");
const SLUG = "sales-marketing-drill-through";

// diagram name → package key. The parent is the study root; the two children are
// pulled in via the parent's subprocess links.
const KEY_BY_NAME = {
  "P01 Sales Enquiry Process": "sm-parent",
  "P01.1 Sales Process": "sm-sales",
  "P01.2 Marketing Process": "sm-marketing",
};

const TEAMS = [
  { name: "Enquiry Team", capacity: 2, costPerHour: 45 },   // parent front door
  { name: "Sales Team", capacity: 3, costPerHour: 55 },      // inside the Sales subprocess
  { name: "Marketing Team", capacity: 2, costPerHour: 50 },  // inside the Marketing subprocess
];

const RUN_CONFIG = { clockUnit: "minute", horizon: 2880, warmUp: 120, replications: 6, seed: 1, collectQueues: true }; // 2 days

const raw = JSON.parse(fs.readFileSync(SRC, "utf8"));

// originalId → package key, so subprocess links can be rewritten to keys.
const idToKey = {};
for (const d of raw.diagrams) {
  const key = KEY_BY_NAME[d.name];
  if (!key) throw new Error(`Unmapped diagram name: "${d.name}" — update KEY_BY_NAME`);
  idToKey[d.originalId] = key;
}

const diagrams = raw.diagrams.map((d) => {
  const data = JSON.parse(JSON.stringify(d.data));
  for (const el of data.elements || []) {
    const linked = el.properties?.linkedDiagramId;
    if (linked && idToKey[linked]) el.properties.linkedDiagramId = idToKey[linked];
  }
  return { key: KEY_BY_NAME[d.name], name: d.name, type: d.type || "bpmn", data };
});

const pkg = {
  version: 1,
  teams: TEAMS,
  diagrams,
  study: { name: "Sales & Marketing Enquiry", rootKeys: ["sm-parent"] },
  scenarios: [{ name: "Baseline", isBaseline: true, runConfig: RUN_CONFIG, overrides: {} }],
};

const example = {
  slug: SLUG,
  title: "Sales & Marketing Enquiry — subprocess drill-through",
  concept: "A parent process whose steps are collapsed subprocesses linked to their own diagrams — shows how the Simulator flattens, simulates and drills through nested subprocesses.",
  description:
    "A three-diagram sample for exploring subprocess drill-through. The parent " +
    "(P01 Sales Enquiry Process) has two collapsed subprocesses — Sales and " +
    "Marketing — each linked to its own diagram (P01.1, P01.2). Run it and the " +
    "engine flattens the linked children in, so a token flows through the parent " +
    "AND the work inside each subprocess (with the child's own teams and times). " +
    "In the replay, double-click a subprocess to drill into its child animation; " +
    "in Simulation Data, a linked subprocess offers “⤢ edit child →” to edit the " +
    "child's tasks.",
  difficulty: "advanced",
  package: pkg,
};

const out = JSON.parse(fs.readFileSync(OUT, "utf8"));
out.examples = out.examples.filter((e) => e.slug !== SLUG);
out.examples.push(example);
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");

console.log(`Wrote ${SLUG}: ${pkg.diagrams.length} diagrams, ${pkg.teams.length} teams, ${pkg.scenarios.length} scenario.`);
console.log("  keys:", diagrams.map((d) => `${d.key} (${d.name})`).join(" | "));
