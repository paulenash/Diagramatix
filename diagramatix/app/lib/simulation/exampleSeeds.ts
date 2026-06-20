/**
 * Starter example simulations — the seed set for the catalog (Phase 6).
 *
 * The packages are GENERATED from the real OMG/WfMC BPSim example files
 * (Car Repair + Loan) by scripts/gen-bpmn-examples.ts, which imports each .bpmn,
 * applies its BPSim parameters, autofills any gaps so it runs, and writes
 * exampleData.json. Regenerate with `npx tsx scripts/gen-bpmn-examples.ts`
 * whenever the source files or the mapping change. Keeping the baked data in a
 * committed JSON means the seed + tests stay free of file I/O and stay fast.
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
