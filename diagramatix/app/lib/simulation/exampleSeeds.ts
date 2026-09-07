/**
 * Starter example simulations — the catalog seed.
 *
 * THE COMMITTED DATA IS THE SOURCE OF TRUTH. exampleData.json is authored, not
 * generated: edit it (or capture a package out of a real project via the admin
 * "Save as example" path) and commit the result. There is no regeneration step,
 * and re-deriving these packages from their original sources is NOT supported.
 *
 * Why (Paul's decision, 2026-09-07). loan-origination and car-repair-rework-loop
 * were first derived from the OMG/WfMC BPSim example files in
 * "new features/BPsim/Examples" by scripts/gen-bpmn-examples.ts (importBpmnXml →
 * applyBpsimToDiagram → autofillSimulation). The committed packages then moved
 * ahead of that script: backfill-example-calendars.cjs added the working
 * calendars, team names were relabelled to lane labels, and the import/BPSim/
 * autofill pipeline itself changed. Re-running the generator produced materially
 * WORSE examples — car-repair fell from 33 connectors to 15, with no team and no
 * calendar — so the script was RETIRED AND DELETED rather than repaired. Its
 * source is in git history if that derivation is ever needed again.
 *
 * The same staleness affects the two surviving per-example generators
 * (gen-aardwolf-example.cjs, gen-sales-marketing-example.cjs): both still emit a
 * package with NO calendar and would undo the backfill. They carry warnings; do
 * not run them without reading audit/Simulator-Extensions-Plan.md section 0.4.
 *
 * Keeping the data in a committed JSON also keeps the seed + tests free of file
 * I/O and fast. Every package here is executed by
 * tests/simulation/exampleSeeds.test.ts, which runs each scenario and asserts it
 * completes work — that suite, not a generator, is what keeps these honest.
 */

import type { ExamplePackage } from "./examplePackage";
import data from "./exampleData.json";

export interface StarterExample {
  slug: string;
  title: string;
  concept: string;
  description: string;
  difficulty: string;
  package: ExamplePackage;
}

export const STARTER_EXAMPLES: StarterExample[] = (data as { examples: StarterExample[] }).examples;

/** Slugs the seed should retire (superseded by the BPSim-derived examples). */
export const RETIRED_EXAMPLE_SLUGS = ["single-bottleneck", "shared-team-two-processes", "surge-intervention"];
