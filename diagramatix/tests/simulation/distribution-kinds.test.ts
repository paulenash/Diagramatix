/**
 * Every distribution the ENGINE can sample must be reachable from the UI, or
 * settable-but-unofferable — never silently absent.
 *
 * Lognormal was implemented everywhere: `sample()` draws it, `meanOf` and the
 * p99 helper handle it, BPSim import produces it, the shipped Simulator example
 * uses it eight times, and both editors already rendered its mean/sd fields.
 * It was missing from one array — the list the pickers map over — so nobody
 * could choose it, and a diagram that already had one displayed as "—".
 *
 * The guard is derived from the SimDist union via the sampler, not from a
 * hand-written list, so the next kind added to the engine fails here until
 * somebody decides whether a person may pick it.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DISTRIBUTION_KINDS, ALL_DISTRIBUTION_KINDS } from "@/app/lib/diagram/simParams";
import { sample } from "@/app/lib/simulation/distributions";
import type { SimDist } from "@/app/lib/simulation/types";
import { makeRng } from "@/app/lib/simulation/rng";

/** One valid value of every kind the engine defines. */
const EVERY_KIND: SimDist[] = [
  { kind: "fixed", value: 5 },
  { kind: "uniform", min: 1, max: 9 },
  { kind: "triangular", min: 1, mode: 5, max: 9 },
  { kind: "normal", mean: 5, sd: 1 },
  { kind: "exponential", mean: 5 },
  { kind: "lognormal", mean: 5, sd: 1 },
  { kind: "empirical", samples: [1, 4, 9] },
];

describe("distribution kinds reach the UI", () => {
  it("T4220 — lognormal is offered in the picker, not merely implemented", () => {
    // The specific regression. Paul, 2026-09-11: "Where is the lognormal
    // distribution?? It doesn't seem to be available."
    expect(DISTRIBUTION_KINDS).toContain("lognormal");

    // ...and it genuinely samples, so offering it is not a dead option.
    const rng = makeRng(42);
    const draws = Array.from({ length: 200 }, () => sample({ kind: "lognormal", mean: 5, sd: 2 }, rng));
    expect(draws.every((d) => d > 0)).toBe(true);          // lognormal is positive by definition
    expect(new Set(draws).size).toBeGreaterThan(50);        // and it actually varies
  });

  it("T4221 — every kind the engine samples is either offered or knowingly held back", () => {
    // ALL_DISTRIBUTION_KINDS is the set a stored value may BE; DISTRIBUTION_KINDS
    // is the subset a person may CHOOSE. A kind in neither is one the engine can
    // run and no screen can show — which is what lognormal was.
    for (const d of EVERY_KIND) {
      expect(ALL_DISTRIBUTION_KINDS, `engine kind "${d.kind}" is unknown to the UI`).toContain(d.kind);
    }
    // Nothing is offered that the engine cannot sample.
    const engineKinds = new Set(EVERY_KIND.map((d) => d.kind));
    for (const k of ALL_DISTRIBUTION_KINDS) expect(engineKinds).toContain(k);

    // Empirical is the ONE deliberate omission from the choosable list: it
    // carries measured samples and picking it by hand would seed an empty set.
    expect(ALL_DISTRIBUTION_KINDS.filter((k) => !DISTRIBUTION_KINDS.includes(k))).toEqual(["empirical"]);
  });

  it("T4222 — both editors can render every kind a diagram may hold", () => {
    // A picker that cannot show its own value reports the wrong distribution,
    // and the next click overwrites it. Source-read because this is a rendering
    // fact about two <select>s that a unit test cannot reach — so each assertion
    // names the exact mechanism rather than just matching a word.
    const root = path.resolve(__dirname, "..", "..");
    const panel = fs.readFileSync(path.join(root, "app/components/simulation/SimDataPanel.tsx"), "utf8");
    const props = fs.readFileSync(path.join(root, "app/components/canvas/DistributionInput.tsx"), "utf8");

    // The Simulation Data panel maps the choosable list, then adds the current
    // value when it is not in it.
    expect(panel).toContain("!DISTRIBUTION_KINDS.includes(value.kind)");
    // The Properties editor lists read-only kinds separately and shows one only
    // when it IS the current value.
    expect(props).toContain("READ_ONLY_KINDS.filter((k) => k.value === d.kind)");
    // ...and lognormal is a real choice there, with a case that seeds its params
    // (without one, selecting it would be a no-op).
    expect(props).toContain('{ value: "lognormal", label: "Lognormal" }');
    expect(props).toContain('case "lognormal": onChange({ kind, mean: meanGuess(d)');
  });
});
