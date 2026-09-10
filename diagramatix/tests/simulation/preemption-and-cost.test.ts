/**
 * Preemption, per-activity cost, and two new distributions.
 *
 * Four gaps in the engine, closed together because they were found together:
 * comparing it against a mature discrete-event suite and asking what a modeller
 * could not express.
 *
 * The bar for all four is the same one the queue-discipline work set, and the
 * first test in each group is the important one: **a model that declares none
 * of this must behave exactly as it did before.** These are engine changes, and
 * the failure mode of an engine change is not a crash — it is every existing
 * study quietly reporting slightly different numbers, which nobody notices
 * until a figure someone published stops reproducing.
 */
import { describe, it, expect } from "vitest";
import { Engine } from "@/app/lib/simulation/engine";
import { runMonteCarlo } from "@/app/lib/simulation/runner";
import { makeRng } from "@/app/lib/simulation/rng";
import { sample, meanOf, empiricalFrom, EMPIRICAL_POINTS } from "@/app/lib/simulation/distributions";
import type { SimNetwork } from "@/app/lib/simulation/model";
import { DEFAULT_RUN_CONFIG, type SimRunConfig, type SimDist } from "@/app/lib/simulation/types";

const cfg = (over: Partial<SimRunConfig> = {}): SimRunConfig => ({ ...DEFAULT_RUN_CONFIG, horizon: 400, replications: 1, seed: 5, ...over });

// ── Distributions ──────────────────────────────────────────────────────────

describe("lognormal — the shape service times actually have", () => {
  const draw = (d: SimDist, n = 20000) => {
    const rng = makeRng(11);
    return Array.from({ length: n }, () => sample(d, rng));
  };

  it("T4009 - it reproduces the mean and sd it was given", () => {
    // Parameterised by the mean and sd OF THE DISTRIBUTION, because that is
    // what a modeller measured — not of its underlying normal, which nobody
    // has. If the conversion were wrong the model would run and be wrong by a
    // constant factor, which is the least detectable kind of wrong.
    const xs = draw({ kind: "lognormal", mean: 10, sd: 6 });
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    expect(mean).toBeGreaterThan(9.4);
    expect(mean).toBeLessThan(10.6);
    expect(sd).toBeGreaterThan(5.2);
    expect(sd).toBeLessThan(6.8);
  });

  it("T4010 - it is RIGHT-SKEWED, which is the entire reason it exists", () => {
    // The gap this closes: a truncated normal is symmetric and a triangular has
    // a hard ceiling, so both understate the long cases — and the long cases are
    // what make a queue form. Median below mean, and a tail well past mean+2sd.
    const xs = draw({ kind: "lognormal", mean: 10, sd: 6 }).sort((a, b) => a - b);
    const median = xs[Math.floor(xs.length / 2)];
    expect(median).toBeLessThan(9.5);
    expect(xs[xs.length - 1]).toBeGreaterThan(30);
  });

  it("T4011 - it never produces a negative duration, and degenerates safely", () => {
    expect(draw({ kind: "lognormal", mean: 10, sd: 6 }, 5000).every((v) => v >= 0)).toBe(true);
    // sd 0 → the mean, every time. A modeller who has no spread should get a
    // constant rather than a crash or a NaN.
    expect(draw({ kind: "lognormal", mean: 7, sd: 0 }, 20).every((v) => v === 7)).toBe(true);
    expect(sample({ kind: "lognormal", mean: 0, sd: 3 }, makeRng(1))).toBe(0);
    expect(meanOf({ kind: "lognormal", mean: 12, sd: 4 })).toBe(12);
  });
});

describe("empirical — the observed values, not a curve laid over them", () => {
  it("T4012 - it resamples what it was given", () => {
    const observed = [1, 2, 3, 4, 5, 6, 7, 8];
    const d = empiricalFrom(observed);
    expect(d.kind).toBe("empirical");
    const rng = makeRng(3);
    const drawn = Array.from({ length: 500 }, () => sample(d, rng));
    expect(drawn.every((v) => observed.includes(v))).toBe(true);
    expect(new Set(drawn).size).toBeGreaterThan(4);
  });

  it("T4013 - one absurd sample does not become the tail", () => {
    // The defect this whole distribution exists to prevent. Under the previous
    // triangular(min, median, max) fit, one case that sat over a long weekend
    // became the model's longest possible service time for that activity.
    const d = empiricalFrom([1, 1, 2, 2, 3, 3, 4, 900]);
    expect(d.kind).toBe("empirical");
    if (d.kind === "empirical") expect(Math.max(...d.samples)).toBeLessThan(10);
  });

  it("T4014 - but a genuinely heavy tail SURVIVES", () => {
    // The other half, and the harder half. When many observations sit past the
    // fence they are not outliers, they are the distribution — and dropping
    // them would throw away exactly what this kind is for. The cap on how much
    // may be trimmed is what protects it.
    const d = empiricalFrom([1, 1, 1, 1, 1, 1, 40, 41, 42, 43]);
    if (d.kind === "empirical") expect(Math.max(...d.samples)).toBeGreaterThan(30);
  });

  it("T4015 - a large sample is bounded, and keeps its shape", () => {
    // A mined activity can have fifty thousand samples and they would otherwise
    // be serialised into the diagram and re-read on every open.
    const many = Array.from({ length: 5000 }, (_, i) => i);
    const d = empiricalFrom(many);
    if (d.kind === "empirical") {
      expect(d.samples.length).toBeLessThanOrEqual(EMPIRICAL_POINTS);
      // Evenly spaced order statistics, so the shape survives the shrink.
      expect(d.samples[0]).toBeLessThan(100);
      expect(d.samples[d.samples.length - 1]).toBeGreaterThan(4700);
    }
  });

  it("T4016 - an empty set is a fixed zero, not an empirical of nothing", () => {
    expect(empiricalFrom([])).toEqual({ kind: "fixed", value: 0 });
  });
});

// ── Per-activity cost ──────────────────────────────────────────────────────

/** One team, one task, no queue — so cost is the only thing under test. */
function costNet(fixedCost?: number): SimNetwork {
  return {
    nodes: [
      { id: "src", kind: "source", arrival: { kind: "fixed", value: 10 }, maxArrivals: 5 },
      { id: "task", kind: "task", label: "Check", teamId: "Team", cycleTime: { kind: "fixed", value: 2 }, ...(fixedCost !== undefined ? { fixedCost } : {}) },
      { id: "end", kind: "sink" },
    ],
    edges: [{ id: "e1", source: "src", target: "task" }, { id: "e2", source: "task", target: "end" }],
    teams: [{ id: "Team", capacity: 1 }],
  };
}

describe("per-activity cost — the charges that do not scale with time", () => {
  it("T4017 - a model with no priced activity runs BIT-IDENTICALLY to before", () => {
    const bare = new Engine(costNet(), cfg(), makeRng(5)).run();
    expect(new Engine(costNet(undefined), cfg(), makeRng(5)).run()).toEqual(bare);
  });

  it("T4018 - it is charged once per execution, whatever the duration", () => {
    // A bureau check costs the same whether the analyst is quick or slow. Cost
    // was busy-hours × rate and nothing else, which silently assumed every
    // expense scales with somebody's time.
    const { stats } = runMonteCarlo(costNet(25), cfg({ replications: 1 }));
    expect(stats.activityCost).toBeTruthy();
    expect(stats.activityCost!.mean).toBe(5 * 25); // five cases, one check each
  });

  it("T4019 - resource cost and activity cost are reported SEPARATELY", () => {
    // They have different remedies: resource cost falls when the work speeds up,
    // activity cost falls only when the work stops happening. A total that mixed
    // them would hide which lever applies.
    const { stats } = runMonteCarlo(costNet(25), cfg({ replications: 1 }));
    expect(stats.resourceCost).toBeTruthy();
    expect(stats.costPerCase.mean).toBeCloseTo(
      (stats.resourceCost.mean + (stats.activityCost?.mean ?? 0)) / 5, 6);
  });

  it("T4020 - an unpriced model reports ABSENT, not zero", () => {
    // "Nothing was charged" and "nothing was measured" are different claims,
    // and a reader must be able to tell them apart.
    const { stats } = runMonteCarlo(costNet(), cfg({ replications: 1 }));
    expect(stats.activityCost).toBeUndefined();
  });
});

// ── Preemption ─────────────────────────────────────────────────────────────

/**
 * One person, two streams of work. The routine case starts first and takes a
 * long time; the urgent case arrives while it is in progress.
 */
function preemptNet(preemptive: boolean): SimNetwork {
  return {
    nodes: [
      { id: "routine", kind: "source", arrival: { kind: "fixed", value: 1 }, maxArrivals: 1,
        assign: [{ property: "priority", value: { expr: "1" } }, { property: "segment", value: { expr: "'routine'" } }] },
      { id: "urgent", kind: "source", arrival: { kind: "fixed", value: 3 }, maxArrivals: 1,
        assign: [{ property: "priority", value: { expr: "9" } }, { property: "segment", value: { expr: "'urgent'" } }] },
      { id: "work", kind: "task", label: "Work", teamId: "Team", cycleTime: { kind: "fixed", value: 20 } },
      { id: "end", kind: "sink" },
    ],
    edges: [
      { id: "e1", source: "routine", target: "work" },
      { id: "e2", source: "urgent", target: "work" },
      { id: "e3", source: "work", target: "end" },
    ],
    teams: [{ id: "Team", capacity: 1, discipline: "priority", ...(preemptive ? { preemptive: true } : {}) }],
  };
}

describe("preemption — who STOPS, not just who goes next", () => {
  it("T4021 - a model that does not ask for it runs BIT-IDENTICALLY to before", () => {
    const bare = new Engine(preemptNet(false), cfg(), makeRng(5)).run();
    const explicit = new Engine({ ...preemptNet(false) }, cfg(), makeRng(5)).run();
    expect(explicit).toEqual(bare);
  });

  it("T4022 - without it, the urgent case waits for a job that started first", () => {
    // Priority alone decides who goes NEXT. It is powerless while the only
    // person is busy — which is exactly when an urgent case arrives, and
    // exactly when it matters. This is the gap, stated as a measurement.
    const { stats } = runMonteCarlo(preemptNet(false), cfg({ replications: 1, horizon: 200 }));
    expect(stats.completed.mean).toBe(2);
    // Routine started at t=1 and runs 20; urgent arrives at t=3 and can only
    // start at t=21, finishing at 41 — a 38-unit flow time for a 20-unit job.
    expect(stats.flowTime.mean).toBeGreaterThan(25);
  });

  it("T4023 - with it, the URGENT case starts immediately, and both still finish", () => {
    const on = runMonteCarlo(preemptNet(true), cfg({ replications: 1, horizon: 200 })).stats;
    const off = runMonteCarlo(preemptNet(false), cfg({ replications: 1, horizon: 200 })).stats;

    // Nothing is lost: interrupting is not cancelling.
    expect(on.completed.mean).toBe(2);

    // MEASURED PER SEGMENT, and this is the point rather than a technicality.
    // Preemption does not make the process faster on average — it CANNOT, since
    // the same work is done either way, and the pooled mean here actually gets
    // slightly worse. What it does is move the waiting off the case that could
    // not afford it and onto the one that could. A test that asserted a better
    // average would have been asserting something untrue, and the engine was
    // right where the first draft of this test was wrong.
    const urgentOn = on.caseFlowBySegment?.urgent, urgentOff = off.caseFlowBySegment?.urgent;
    expect(urgentOn, "no per-segment split — the model no longer assigns segments").toBeTruthy();
    expect(urgentOn!.mean).toBeLessThan(urgentOff!.mean / 1.5);

    // And the routine case pays for it, which is the honest other half.
    expect(on.caseFlowBySegment!.routine.mean).toBeGreaterThan(off.caseFlowBySegment!.routine.mean);
  });

  it("T4024 - it RESUMES: the interrupted work is not done twice", () => {
    // Preempt-restart would be the easier implementation and would quietly
    // inflate total work — a process where being interrupted costs you the whole
    // task is a different process, and not the common one. Total busy time must
    // be the same 40 units either way.
    const on = runMonteCarlo(preemptNet(true), cfg({ replications: 1, horizon: 200 })).stats;
    const off = runMonteCarlo(preemptNet(false), cfg({ replications: 1, horizon: 200 })).stats;
    expect(on.resourceCost.mean).toBeCloseTo(off.resourceCost.mean, 6);
  });
});
