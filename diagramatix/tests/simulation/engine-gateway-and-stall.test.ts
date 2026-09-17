/**
 * Wave G batch 3 — two ways the simulator produced a confident wrong answer.
 *
 * SIM-02  A decision gateway with nothing configured on any branch — no
 *         probability, no condition, no default flow — sent EVERY case down
 *         the first edge. The readiness check tells the modeller the opposite
 *         in as many words ("they'll be split evenly"), and an unconfigured
 *         gateway is routine on AI-generated and imported diagrams, which is
 *         why that warning exists. The result looked like a finished run while
 *         a whole branch was never visited.
 *
 * SIM-03  The runaway guard watched the token population, which only catches a
 *         model ACCUMULATING work. A cycle whose steps all take zero time
 *         accumulates nothing: the same token goes round for ever, the clock
 *         never advances toward the horizon, and the loop never exits — hanging
 *         the request thread permanently, server-side. An unconfigured
 *         intermediate event inside an always-true loop-back is enough.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(process.cwd(), "app/lib/simulation/engine.ts"), "utf8");
const chooseEdge = SRC.slice(SRC.indexOf("private chooseEdge("), SRC.indexOf("private completeToken("));

describe("simulation engine — unconfigured gateway and zero-duration cycle", () => {
  it("T4435 — SIM-02: an entirely unconfigured split is drawn evenly, from the seeded generator", () => {
    expect(chooseEdge, "detect the case where no branch carries anything").toMatch(
      /out\.every\(\(e\) => !this\.condCache\.has\(e\.id\) && this\.probOf\(e\) === undefined\)/,
    );
    // Must be a draw, and must use the run's seeded RNG so a run stays reproducible.
    expect(chooseEdge, "draw a branch rather than taking the first").toMatch(/this\.rng\.next\(\) \* out\.length/);
    // A configured default flow still wins over the draw.
    expect(
      chooseEdge.indexOf("isDefault"),
      "the default flow is BPMN's own answer and must be preferred to a draw",
    ).toBeLessThan(chooseEdge.indexOf("unconfigured"));

    // The readiness text is the promise this fix keeps; if one changes the
    // other has to, so pin them together.
    const readiness = readFileSync(join(process.cwd(), "app/lib/simulation/readiness.ts"), "utf8");
    expect(readiness).toMatch(/split evenly/);
  });

  it("T4436 — SIM-03: the guard watches the clock, not just the population, and reports a stall", () => {
    const guard = SRC.slice(SRC.indexOf("Runaway guard"), SRC.indexOf("private overloadedAt"));
    expect(guard, "a flat population is not proof of progress — watch the clock").toMatch(/this\.clock === lastProgressClock/);
    expect(guard, "and stop once it has clearly stopped moving").toMatch(/MAX_EVENTS_WITHOUT_PROGRESS/);
    expect(guard, "stopping must be recorded, not silent").toMatch(/this\.stalledAt = this\.clock/);

    // The caller needs to be able to tell a stall from a completed horizon.
    expect(SRC, "expose the stall the way overload is exposed").toMatch(/get stalled\(\): \{ at: number \} \| undefined/);

    // The budget must be far above a legitimate simultaneous batch.
    const cap = /const MAX_EVENTS_WITHOUT_PROGRESS = ([0-9_]+);/.exec(SRC);
    expect(cap, "the budget must be a named constant").toBeTruthy();
    expect(Number(cap![1].replace(/_/g, "")), "generous enough not to trip a real burst").toBeGreaterThanOrEqual(100_000);
  });
});
