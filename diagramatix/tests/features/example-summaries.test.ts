/**
 * The Summary button on both example galleries, and the lists behind it.
 *
 * The problem it solves: a capability that appears in exactly ONE example is
 * invisible in a catalog of cards, because the only way to find it is to adopt
 * every entry into a project you then have to tidy up. The audit that prompted
 * this found slicing taught by a single example and three input capabilities
 * taught by none.
 *
 * The failure mode it introduces is worse than the one it fixes, and is what
 * most of these tests are about: **a feature list is a claim.** Written by hand
 * it goes stale in silence — an example whose log stops carrying a resource
 * column keeps advertising hand-offs, and nothing anywhere goes red. So the
 * lists are DERIVED from each example's own package, and these tests pin the
 * derivation to the shipped catalog.
 *
 * The second thing they pin is the floors. Every detector returns something on
 * almost every log, and a summary that lists everything it found lists mostly
 * noise — which teaches the reader to stop believing the list.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { STARTER_MINING_EXAMPLES } from "@/app/lib/mining/exampleSeeds";
import { STARTER_EXAMPLES } from "@/app/lib/simulation/exampleSeeds";
import { minerExampleFeatures } from "@/app/lib/mining/exampleFeatures";
import { simulatorExampleFeatures } from "@/app/lib/simulation/exampleFeatures";
import type { ExampleFeature, ExampleFeatureGroup } from "@/app/lib/exampleFeature";

const flat = (groups: ExampleFeatureGroup[]): ExampleFeature[] => groups.flatMap((g) => g.features);

function minerFor(slug: string): ExampleFeature[] {
  const ex = STARTER_MINING_EXAMPLES.find((e) => e.slug === slug);
  expect(ex, `the catalog no longer contains "${slug}"`).toBeTruthy();
  return flat(minerExampleFeatures(ex!.package as never));
}
const has = (fs: ExampleFeature[], id: string) => fs.some((f) => f.id === id);
const one = (fs: ExampleFeature[], id: string) => fs.find((f) => f.id === id)!;

describe("Example summaries — every shipped example says something", () => {
  it("T3982 - every Miner example produces at least one feature", () => {
    // A card with a Summary button that opens an empty panel is worse than no
    // button: it reads as a broken screen rather than as an example with
    // nothing unusual in it.
    for (const ex of STARTER_MINING_EXAMPLES) {
      const groups = minerExampleFeatures(ex.package as never);
      expect(flat(groups).length, `${ex.slug} summarises to nothing`).toBeGreaterThan(0);
    }
  });

  it("T3983 - every Simulator example produces at least one feature", () => {
    for (const ex of STARTER_EXAMPLES) {
      const groups = simulatorExampleFeatures(ex.package as never);
      expect(flat(groups).length, `${ex.slug} summarises to nothing`).toBeGreaterThan(0);
    }
  });

  it("T3984 - no feature is advertised with a missing or nonsense figure", () => {
    // The derivation quotes measured numbers. A null median, an absent value
    // list or a zero count must OMIT the feature, never print itself into the
    // sentence — "runs undefined× per case" is how a reader learns the whole
    // panel is generated and unread.
    const all = [
      ...STARTER_MINING_EXAMPLES.flatMap((e) => flat(minerExampleFeatures(e.package as never))),
      ...STARTER_EXAMPLES.flatMap((e) => flat(simulatorExampleFeatures(e.package as never))),
    ];
    expect(all.length).toBeGreaterThan(20);
    for (const f of all) {
      const text = `${f.label} ${f.detail}`;
      expect(text, `nonsense in "${f.label}"`).not.toMatch(/undefined|NaN|\bnull\b|\[object/);
      expect(f.detail.trim().length, `empty detail on "${f.label}"`).toBeGreaterThan(20);
    }
  });
});

describe("Example summaries — the Miner catalog, as derived", () => {
  it("T3985 - the three-team example advertises hand-offs and a ping-pong pair", () => {
    const fs = minerFor("three-team-handover");
    expect(has(fs, "handovers")).toBe(true);
    expect(one(fs, "ping-pong").detail).toMatch(/Finance ↔ Legal|Legal ↔ Finance/);
  });

  it("T3986 - the rework example advertises rework, with the measured rate", () => {
    const fs = minerFor("credit-check-rework");
    const rework = one(fs, "rework");
    expect(rework.detail).toContain("Credit Check");
    const rate = Number(rework.detail.match(/([0-9.]+)× per case/)![1]);
    expect(rate).toBeGreaterThan(2);
  });

  it("T3987 - Order-to-Cash advertises slicing, and names both dimensions", () => {
    const slicing = one(minerFor("order-to-cash-lifecycle"), "slicing");
    expect(slicing.detail).toContain("Region");
    expect(slicing.detail).toContain("Channel");
    // With their actual values, because "supports filtering" is a manual and
    // "slice to EMEA" is an instruction.
    expect(slicing.detail).toContain("EMEA");
  });

  it("T3988 - Accounts Payable advertises comparison and alerts, because it ships three periods", () => {
    const fs = minerFor("accounts-payable-invoice-lifecycle");
    expect(has(fs, "scenario-picker")).toBe(true);
    expect(has(fs, "compare")).toBe(true);
    expect(has(fs, "alerts")).toBe(true);
  });

  it("T3989 - the live example advertises the live source, and nothing it lacks", () => {
    const fs = minerFor("live-order-processing");
    expect(has(fs, "live-source")).toBe(true);
    // It carries no reference model and no SLA. Advertising conformance here
    // would send a reader to a tab that correctly reports having nothing.
    expect(has(fs, "conformance")).toBe(false);
    expect(has(fs, "sla")).toBe(false);
  });

  it("T3990 - hand-offs are named by the log's own column, not called 'teams'", () => {
    // Half these logs record individual people and half record functions.
    // Calling Alice Chen a team is the small lie that makes a reader stop
    // believing the rest of the list.
    expect(one(minerFor("accounts-payable-invoice-lifecycle"), "handovers").detail).toContain("“Resource”");
    expect(one(minerFor("three-team-handover"), "handovers").detail).toContain("“Team”");
  });
});

describe("Example summaries — the floors, which are the point", () => {
  it("T3991 - a trivial rework rate is NOT advertised as rework", () => {
    // The Service Desk log repeats "Investigate" at 1.1× per case in 16 of 168.
    // True, and not a thing that example teaches. A reader who opens it looking
    // for rework and finds a rounding error stops trusting every other line.
    expect(has(minerFor("service-desk-ticket-lifecycle"), "rework")).toBe(false);
  });

  it("T3992 - a bounce pattern touching a handful of cases is NOT advertised", () => {
    // Order-to-Cash has one, in about 3% of cases. Below the floor.
    expect(has(minerFor("order-to-cash-lifecycle"), "ping-pong")).toBe(false);
  });

  it("T3993 - a malformed package summarises to nothing rather than throwing", () => {
    // A catalog row whose package failed to parse must not 500 the endpoint
    // behind a button; the route says plainly that there is nothing to show.
    expect(minerExampleFeatures(undefined as never)).toEqual([]);
    expect(simulatorExampleFeatures(undefined as never)).toEqual([]);
    expect(minerExampleFeatures({} as never)).toEqual([]);
    expect(simulatorExampleFeatures({} as never)).toEqual([]);
  });
});

describe("Example summaries — the Simulator catalog, as derived", () => {
  const simFor = (slug: string): ExampleFeature[] => {
    const ex = STARTER_EXAMPLES.find((e) => e.slug === slug);
    expect(ex, `the catalog no longer contains "${slug}"`).toBeTruthy();
    return flat(simulatorExampleFeatures(ex!.package as never));
  };

  it("T3994 - the comparison example advertises as-is against to-be", () => {
    const fs = simFor("aardwolf-loan-comparison");
    expect(has(fs, "as-is-to-be")).toBe(true);
    expect(has(fs, "scenarios")).toBe(true);
    expect(has(fs, "costs")).toBe(true);
  });

  it("T3995 - an example with a companion model says so", () => {
    expect(has(simFor("hire-and-onboard"), "companions")).toBe(true);
  });

  it("T3996 - teams are listed with their capacities, because capacity is the point", () => {
    // A simulation differs from a spreadsheet precisely because the team runs
    // out. A feature line that says "has teams" and not how many of each is a
    // line that could be true of a diagram.
    expect(simFor("simple-process").find((f) => f.id === "teams")!.detail).toMatch(/\(\d+\)/);
  });
});

describe("Example summaries — the button reaches a real route", () => {
  // A handler can be perfect and unreachable. Both galleries build the summary
  // URL as a template string; rename the route folder and the button 404s
  // behind a modal that says only "Could not load the summary".
  const gallery = (p: string) => readFileSync(p, "utf8");
  const MINER = "app/(dashboard)/dashboard/mining-examples/MiningExamplesGallery.tsx";
  const SIM = "app/(dashboard)/dashboard/simulator-examples/ExamplesGallery.tsx";

  it("T3997 - each gallery's advertised summary path resolves to a route file", () => {
    for (const p of [MINER, SIM]) {
      const src = gallery(p);
      const m = src.match(/\/api\/([a-z-]+)\/\$\{[^}]+\}\/summary/);
      expect(m, `${p} no longer fetches a summary endpoint`).toBeTruthy();
      const route = join("app", "api", m![1], "[id]", "summary", "route.ts");
      expect(existsSync(route), `${p} advertises /api/${m![1]}/…/summary and ${route} does not exist`).toBe(true);
    }
  });

  it("T3998 - both galleries actually render the Summary button", () => {
    for (const p of [MINER, SIM]) {
      expect(gallery(p)).toContain("ExampleSummaryModal");
      expect(gallery(p)).toMatch(/Summary/);
    }
  });

  it("T3999 - the modal renders what the server computed, and computes nothing", () => {
    // Same rule as the Compare view. The derivation mines a log and pulls in
    // half the mining library; doing it in the browser would put all of that
    // in the client bundle, and let the panel and the endpoint disagree.
    const src = readFileSync("app/components/examples/ExampleSummaryModal.tsx", "utf8");
    for (const fn of ["minerExampleFeatures", "simulatorExampleFeatures", "buildEventLog", "computeAnalytics", "renderHelpMarkdown"]) {
      expect(src, `the modal calls ${fn}()`).not.toMatch(new RegExp(`\\b${fn}\\s*\\(`));
    }
    // The only thing it may take from the lib is the SHAPE.
    for (const line of src.split("\n").filter((l) => /^import .*exampleFeature"/.test(l))) {
      expect(line).toMatch(/^import type /);
    }
  });

  it("T4000 - both cascades are the new ones, not the katakana default", () => {
    // Paul, 2026-09-07: the Simulator's rain is green BPMN symbols and the
    // Miner's is brown rocks and BPMN. The consoles and the entry bursts were
    // changed then; these two screens were missed and kept falling katakana,
    // so the galleries did not match the product they open into.
    expect(gallery(MINER)).toContain('glyphs="rocks-and-bpmn"');
    expect(gallery(SIM)).toContain('glyphs="bpmn"');
  });
});
