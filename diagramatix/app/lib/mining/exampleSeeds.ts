/**
 * Starter DiagramatixMINER examples — the seed set for the Mining-Example
 * catalog. GENERATED (deterministically) by scripts/gen-mining-examples.ts into
 * miningExampleData.json; keeping the baked data in a committed JSON means the
 * seed + tests stay free of file I/O and stay fast. Regenerate with
 * `npx tsx scripts/gen-mining-examples.ts` when the source generator changes.
 *
 * Mirrors app/lib/simulation/exampleSeeds.ts.
 */
import type { MiningExamplePackage } from "./examplePackage";
import data from "./miningExampleData.json";

export interface StarterMiningExample {
  slug: string;
  title: string;
  concept: string;
  description: string;
  difficulty: string;
  package: MiningExamplePackage;
}

export const STARTER_MINING_EXAMPLES: StarterMiningExample[] =
  (data as { examples: StarterMiningExample[] }).examples;

/** Slugs the seed should retire (none yet). */
export const RETIRED_MINING_EXAMPLE_SLUGS: string[] = [];
