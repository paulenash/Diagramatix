/**
 * Generate the starter example catalog from the real BPSim example files
 * (Car Repair + Loan). Pipeline per file:
 *   importBpmnXml → applyBpsimToDiagram (real timings/branches/conditions) →
 *   autofillSimulation (fill any gaps so it RUNS) → derive teams + scenarios →
 *   ExamplePackage. Writes app/lib/simulation/exampleData.json, which
 *   exampleSeeds.ts imports (keeping the seed/tests free of file I/O).
 *
 * Run:  cd diagramatix && npx tsx scripts/gen-bpmn-examples.ts
 *
 * !! DO NOT RUN THIS WITHOUT READING audit/Simulator-Extensions-Plan.md section 0.4.
 * The committed exampleData.json entries for BOTH slugs below are AHEAD of what
 * this script now produces: calendars were added afterwards by
 * backfill-example-calendars.cjs, team names were relabelled to lane labels, and
 * the import -> BPSim -> autofill pipeline has moved since they were generated.
 * Regenerating today gives loan-origination 25 connectors instead of 32, and
 * car-repair 15 instead of 33 with no team and no calendar - materially worse
 * examples. Test T0571 fails if you commit that, but this comment is the sooner
 * check. (Writing the whole file, rather than merging by slug as main() now does,
 * additionally DELETED the three examples this script does not own.)
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { importBpmnXml } from "../app/lib/diagram/bpmn/importBpmnXml";
import { parseBpsimScenarios } from "../app/lib/simulation/bpsim/importBpsim";
import { applyBpsimToDiagram } from "../app/lib/simulation/bpsim/applyBpsimToDiagram";
import { autofillSimulation } from "../app/lib/simulation/autofill";
import { getSimParams } from "../app/lib/diagram/simParams";
import type { DiagramData } from "../app/lib/diagram/types";
import type { ExamplePackage, ExampleTeam } from "../app/lib/simulation/examplePackage";
import type { ScenarioRunConfig } from "../app/lib/simulation/types";

const EX = "new features/BPsim/Examples";
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Meta { file: string; key: string; slug: string; title: string; concept: string; description: string; difficulty: string }

const METAS: Meta[] = [
  {
    file: "Loan Process v2.0.0.bpmn", key: "loan", slug: "loan-origination",
    title: "Loan origination", concept: "A multi-team loan process with real task timings — find the team that gates throughput.",
    difficulty: "core",
    description: [
      "A loan application flows across several teams with real per-task processing",
      "times and approval branches (imported from the BPSim example).",
      "",
      "**Demo:** Run the *Baseline* and open the results — one team sits near 100%",
      "utilisation while applications queue. Then *Add staff* and **⇄ compare** to",
      "see the flow-time fall. Launch the **Replay** to watch tokens stack at the",
      "busy step, or the **Heatmap** for the hotspot at a glance.",
    ].join("\n"),
  },
  {
    file: "Car Repair Process v2.0.0.bpmn", key: "carrepair", slug: "car-repair-rework-loop",
    title: "Car repair — rework loop", concept: "A repair that loops until every issue is fixed — see how rework multiplies the load.",
    difficulty: "advanced",
    description: [
      "Each car arrives with a number of issues; the process works an issue, then",
      "loops back while issues remain (a BPSim property + condition-driven loop:",
      "`noOfIssues > 0`). Rework multiplies the demand on the workshop.",
      "",
      "**Demo:** Run the *Baseline* — the rework loop drives repeated visits to the",
      "repair task and a growing queue. *Add a mechanic* and compare. Watch the",
      "**Replay** to see tokens loop back through the repair step.",
    ].join("\n"),
  },
];

function teamsFromData(data: DiagramData): ExampleTeam[] {
  const names = new Set<string>();
  for (const el of data.elements) { const t = getSimParams(el).teamId; if (t) names.add(t); }
  // Capacity 1 so contention is visible out of the box; the staffing scenario relieves it.
  return [...names].map((name) => ({ name, capacity: 1 }));
}

/** One catalog entry as stored in exampleData.json. */
interface GeneratedExample { slug: string; title: string; concept: string; description: string; difficulty: string; package: ExamplePackage }

async function build(meta: Meta): Promise<GeneratedExample> {
  const xml = readFileSync(join(process.cwd(), EX, meta.file), "utf8");
  const r = await importBpmnXml(xml, meta.file);
  const scenarios = parseBpsimScenarios(xml, "minute");
  const richest = scenarios.reduce((a, b) => (Object.keys(b.elements).length > Object.keys(a.elements).length ? b : a), scenarios[0] ?? { elements: {} });

  let data = applyBpsimToDiagram(r.data, r.idMap, richest as Parameters<typeof applyBpsimToDiagram>[2]);
  data = autofillSimulation(data).data;

  const teams = teamsFromData(data);
  const horizon = clamp(Math.round(richest?.horizon ?? 2000), 800, 4000);
  const replications = clamp(Math.round(richest?.replication ?? 8), 6, 12);
  const cfg = (over: Partial<ScenarioRunConfig> = {}): ScenarioRunConfig =>
    ({ clockUnit: "minute", horizon, warmUp: Math.round(horizon * 0.1), replications, seed: 1, collectQueues: true, ...over });

  // "Add staff" = every team's capacity bumped.
  const staffOverrides = { teams: Object.fromEntries(teams.map((t) => [t.name, { capacity: t.capacity + 2 }])) };

  const pkg: ExamplePackage = {
    version: 1,
    teams,
    diagrams: [{ key: meta.key, name: meta.title, type: "bpmn", data }],
    study: { name: meta.title, rootKeys: [meta.key] },
    scenarios: [
      { name: "Baseline", isBaseline: true, runConfig: cfg() },
      { name: "Add staff", runConfig: cfg(), overrides: staffOverrides },
    ],
  };
  return { slug: meta.slug, title: meta.title, concept: meta.concept, description: meta.description, difficulty: meta.difficulty, package: pkg };
}

async function main() {
  const examples: GeneratedExample[] = [];
  for (const m of METAS) {
    const e = await build(m);
    const t = e.package.diagrams[0].data;
    console.log(`${e.slug}: ${t.elements.length} els, ${t.connectors.length} conns, ${e.package.teams.length} team(s)`);
    examples.push(e);
  }
  const out = join(process.cwd(), "app/lib/simulation/exampleData.json");

  // MERGE by slug — never write the whole file. This generator owns ONLY its own
  // METAS; exampleData.json also holds entries produced by other generators
  // (gen-aardwolf-example.cjs, gen-sales-marketing-example.cjs) and
  // `simple-process`, which no generator owns at all. A wholesale write deleted
  // every one of them — irrecoverably for `simple-process`. Same merge shape as
  // gen-aardwolf-example.cjs: replace an entry in place, append a new one.
  const existing: GeneratedExample[] = existsSync(out)
    ? ((JSON.parse(readFileSync(out, "utf8")) as { examples?: GeneratedExample[] }).examples ?? [])
    : [];
  const merged = [...existing];
  for (const e of examples) {
    const i = merged.findIndex((x) => x.slug === e.slug);
    if (i >= 0) merged[i] = e;
    else merged.push(e);
  }
  writeFileSync(out, JSON.stringify({ examples: merged }, null, 2) + "\n", "utf8");
  console.log(`Wrote ${out} — ${merged.length} example(s): ${merged.map((e) => e.slug).join(", ")}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
