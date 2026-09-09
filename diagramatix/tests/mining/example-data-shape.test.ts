/**
 * Phase 0.5 — the baked example catalog, and whether it is still current.
 *
 * `miningExampleData.json` is a 2.9 MB file written wholesale by
 * `scripts/gen-mining-examples.ts`. That is the same arrangement that cost the
 * Simulator three examples: regenerating produced materially worse packages and
 * the generator was retired. So the question the plan gates Phase 1 on is
 * whether this generator can be trusted, and the answer had to be evidence.
 *
 * It can. Regenerating reproduced every sample log byte-for-byte and every case
 * count, variant and diagram exactly; the only change was that all five packages
 * gained the analytics fields Phase 1 added. In other words the generator is
 * deterministic and the baked file was merely stale — the opposite of the
 * Simulator's problem, and the fix was to run it.
 *
 * What this test does is make "merely stale" detectable. The generator is not
 * run here (it writes files and takes seconds); instead the properties that
 * matter about its output are asserted, so a bake left behind by a later phase
 * fails in CI rather than surfacing as an example that teaches the old views.
 */
import { describe, it, expect } from "vitest";
import data from "@/app/lib/mining/miningExampleData.json";
import { validateMiningExamplePackage, type MiningExamplePackage, type MiningExampleRun } from "@/app/lib/mining/examplePackage";
import type { RunAnalytics } from "@/app/lib/mining/analytics";

interface Entry { slug?: string; title?: string; package: MiningExamplePackage }
const examples = (data as unknown as { examples: Entry[] }).examples;
const runsOf = (e: Entry): MiningExampleRun[] => e.package.runs ?? (e.package.run ? [e.package.run] : []);
const name = (e: Entry) => e.slug ?? e.title ?? "(unnamed)";

describe("Phase 0.5 — the catalog is intact", () => {
  it("T3756 - every baked package validates, by the same check the capture tool uses", () => {
    for (const e of examples) expect(validateMiningExamplePackage(e.package), name(e)).toEqual([]);
  });

  it("T3757 - every example has a run with a log in it", () => {
    expect(examples.length).toBeGreaterThanOrEqual(5);
    for (const e of examples) {
      const runs = runsOf(e);
      expect(runs.length, name(e)).toBeGreaterThan(0);
      for (const r of runs) {
        expect(r.stats.cases, name(e)).toBeGreaterThan(0);
        expect(r.variants.length, name(e)).toBeGreaterThan(0);
      }
    }
  });
});

describe("Phase 0.5 — the bake is not stale", () => {
  it("T3758 - every run carries the CURRENT analytics shape", () => {
    // The failure this catches: a phase reshapes analytics, nobody re-runs the
    // generator, and five examples go on teaching the previous version of the
    // product. `detail` absent is exactly what an old bake looks like.
    for (const e of examples) {
      for (const r of runsOf(e)) {
        const a = r.analytics as RunAnalytics | undefined;
        expect(a, name(e)).toBeTruthy();
        expect(a!.detail, name(e)).toBe("full");
        expect(Array.isArray(a!.resourceDict), name(e)).toBe(true);
      }
    }
  });

  it("T3759 - the per-event vectors line up with the events they describe", () => {
    // `durs` is "until the next event", so it is one shorter than the case; `res`
    // is per event, so it is exactly as long. Filtering an activity metric reads
    // these positionally — a length that disagrees silently attributes one
    // step's time to another.
    for (const e of examples) {
      for (const r of runsOf(e)) {
        for (const c of (r.analytics as RunAnalytics).cases) {
          expect(c.durs, `${name(e)} case ${c.caseId}`).toHaveLength(Math.max(0, c.events - 1));
          expect(c.res, `${name(e)} case ${c.caseId}`).toHaveLength(c.events);
        }
      }
    }
  });

  it("T3760 - every resource index points at a real name, or at nothing", () => {
    for (const e of examples) {
      for (const r of runsOf(e)) {
        const a = r.analytics as RunAnalytics;
        const dict = a.resourceDict ?? [];
        for (const c of a.cases) {
          for (const i of c.res ?? []) {
            expect(i, name(e)).toBeGreaterThanOrEqual(-1);
            expect(i, name(e)).toBeLessThan(dict.length);
          }
        }
      }
    }
  });

  it("T3761 - the case index and the stats agree about how many cases there are", () => {
    for (const e of examples) {
      for (const r of runsOf(e)) {
        const a = r.analytics as RunAnalytics;
        expect(a.totalCases, name(e)).toBe(r.stats.cases);
        // The index is a strided sample above the cap; below it, it is complete.
        expect(a.cases.length, name(e)).toBe(a.capped ? a.cases.length : r.stats.cases);
      }
    }
  });

  it("T3762 - variant frequencies add up to the case count", () => {
    for (const e of examples) {
      for (const r of runsOf(e)) {
        expect(r.variants.reduce((s, v) => s + v.count, 0), name(e)).toBe(r.stats.cases);
      }
    }
  });
});
