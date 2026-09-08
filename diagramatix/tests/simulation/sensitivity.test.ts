/**
 * Which assumption is load-bearing? — the tornado.
 *
 * Phase 8. A model has thirty numbers in it and most of them do not matter.
 *
 * The tests that matter most are about the BOTTOM of the chart, not the top.
 * "But you guessed that number" is the commonest objection a simulation meets,
 * and the answer is "yes, and here is the evidence it makes no difference" — so
 * the no-difference bars must survive into the output rather than being filtered
 * away as boring.
 *
 * And three outcomes, not two: a parameter can move the answer, fail to move it,
 * or be one the model CANNOT VARY. Reporting "could not be tested" as "made no
 * difference" would be a lie of exactly the kind this feature exists to disprove.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  enumerateParameters, variationsFor, overrideForParam, buildTornado,
  DEFAULT_VARIATION, type SensitivityParam, type SensitivityRun,
} from "@/app/lib/simulation/sensitivity";
import type { SimNetwork } from "@/app/lib/simulation/model";
import type { RunMetrics } from "@/app/lib/simulation/results";

const stat = (mean: number, spread = 0) => ({ mean, p5: mean - spread, p50: mean, p95: mean + spread });

/** A run whose near-worst case is `y`. `reps` supplies the per-replication
 *  vector the significance test needs; `spread` widens the run-to-run band. */
function metrics(y: number, opts: { spread?: number; reps?: number[] } = {}): RunMetrics {
  return {
    stats: {
      replications: opts.reps?.length ?? 5,
      arrived: stat(100), completed: stat(100), flowTime: stat(y, opts.spread ?? 0),
      totalCost: stat(0), costPerCase: stat(0),
      caseFlow: { count: 100, mean: y, sd: 1, min: 0, p50: y, p90: y, p95: y, max: y, histogram: { min: 0, binWidth: 1, counts: [] } },
      perNode: {}, perTeam: {},
    },
    bottlenecks: [], nodeLabels: {}, clockUnit: "minute", teamCapacities: {},
    ...(opts.reps ? { repMeans: opts.reps } : {}),
  };
}

const param = (label: string, baseline: number, kind: SensitivityParam["kind"] = "taskCycleTime"): SensitivityParam =>
  ({ kind, target: label, label, baseline });

/** A run where the two ends produced `lo` and `hi`, with tight replications. */
const run = (p: SensitivityParam, lo: number, hi: number, spread = 0): SensitivityRun => ({
  param: p,
  low: { value: p.baseline * 0.8, metrics: metrics(lo, { spread, reps: [lo, lo] }) },
  high: { value: p.baseline * 1.2, metrics: metrics(hi, { spread, reps: [hi, hi] }) },
});

describe("tornado — enumerating what can be varied", () => {
  it("T3545 - teams, task times and arrival rates are read from the ASSEMBLED network", () => {
    const net: SimNetwork = {
      nodes: [
        { id: "src", kind: "source", label: "Claims arrive", arrival: { kind: "exponential", mean: 12 } },
        { id: "t1", kind: "task", label: "Assess", cycleTime: { kind: "triangular", min: 3, mode: 6, max: 12 } },
        { id: "g1", kind: "gateway", label: "Approved?", gateway: "decision" },
        { id: "end", kind: "sink" },
      ],
      edges: [],
      teams: [{ id: "Assessment", capacity: 4 }],
    };
    const params = enumerateParameters(net);
    expect(params.map((p) => `${p.kind}:${p.label}=${p.baseline}`)).toEqual([
      "teamCapacity:Assessment=4",
      "sourceArrival:Claims arrive=12",
      "taskCycleTime:Assess=7",       // the triangular's mean
    ]);
    // A gateway is not a parameter this can vary.
    expect(params.some((p) => p.label === "Approved?")).toBe(false);
  });
});

describe("tornado — what cannot be varied is NOT the same as no difference", () => {
  it("T3546 - a headcount of 1 cannot go down 20%, so it is reported as untested", () => {
    expect(variationsFor(param("Solo", 1, "teamCapacity"))).toBeNull();
  });

  it("T3547 - a headcount that rounds back onto itself is untested too", () => {
    // ±20% of 2 rounds to 2 and 2 — nothing was actually tried.
    expect(variationsFor(param("Pair", 2, "teamCapacity"))).toBeNull();
    // 5 does move: 4 and 6.
    expect(variationsFor(param("Five", 5, "teamCapacity"))).toEqual({ low: 4, high: 6 });
  });

  it("T3548 - a continuous parameter keeps its fractions", () => {
    expect(variationsFor(param("Assess", 10))).toEqual({ low: 8, high: 12 });
  });

  it("T3549 - an untestable parameter says UNTESTED, never that it does not matter", () => {
    const t = buildTornado(metrics(100), [{ param: param("Solo", 1, "teamCapacity"), low: null, high: null }], "nearWorst");
    const bar = t.bars[0];
    expect(bar.verdict).toBe("not-testable");
    expect(bar.note).toMatch(/UNTESTED, not unimportant/);
    expect(bar.note).not.toMatch(/no measurable difference/);
  });

  it("T3550 - each point runs through the ordinary sweep override, not a special path", () => {
    expect(overrideForParam(param("Team", 4, "teamCapacity"), 6)).toEqual({ teams: { Team: { capacity: 6 } } });
    expect(overrideForParam(param("t1", 10, "taskCycleTime"), 8))
      .toEqual({ elements: { t1: { cycleTime: { kind: "fixed", value: 8 } } } });
  });
});

describe("tornado — the ranking", () => {
  const runs = [
    run(param("Small effect", 10), 99, 101),
    run(param("Big effect", 10), 60, 140),
    run(param("Middling", 10), 85, 115),
  ];

  it("T3551 - the widest swing comes first, and the statement names it", () => {
    const t = buildTornado(metrics(100), runs, "nearWorst");
    expect(t.bars.map((b) => b.param.label)).toEqual(["Big effect", "Middling", "Small effect"]);
    expect(t.bars[0].swing).toBe(80);
    expect(t.statement).toMatch(/Big effect is the load-bearing assumption/);
  });

  it("T3552 - untestable bars go AFTER the ranked ones, never interleaved", () => {
    const t = buildTornado(metrics(100), [
      { param: param("Solo", 1, "teamCapacity"), low: null, high: null },
      ...runs,
    ], "nearWorst");
    const kinds = t.bars.map((b) => b.verdict);
    expect(kinds.indexOf("not-testable")).toBe(kinds.length - 1);
  });

  it("T3553 - the swing is reported against the baseline answer, in percent", () => {
    const t = buildTornado(metrics(100), [run(param("Big effect", 10), 60, 140)], "nearWorst");
    expect(t.baselineY).toBe(100);
    expect(t.bars[0].swingPct).toBe(80);
  });
});

describe("tornado — the half that disarms the objection", () => {
  it("T3554 - a parameter that makes no difference STAYS in the chart and says a guess is safe", () => {
    const t = buildTornado(metrics(100), [
      run(param("Matters", 10), 60, 140),
      // Tiny swing on noisy runs: not shown to be anything.
      { param: param("Guessed", 10), low: { value: 8, metrics: metrics(99, { spread: 30, reps: [110, 90] }) }, high: { value: 12, metrics: metrics(101, { spread: 30, reps: [111, 91] }) } },
    ], "nearWorst");
    const guessed = t.bars.find((b) => b.param.label === "Guessed")!;
    expect(guessed.verdict).toBe("no-difference");
    expect(guessed.note).toMatch(/a rough figure here is safe/);
    // ...and the summary counts them, so the reader sees the reassurance.
    expect(t.statement).toMatch(/made NO measurable difference/);
  });

  it("T3555 - 'no difference' is a significance question, not a smallness one", () => {
    // The SAME small swing, but on tight runs, IS a real effect.
    const tight = buildTornado(metrics(100), [
      { param: param("Small but real", 10), low: { value: 8, metrics: metrics(99, { reps: [99, 99] }) }, high: { value: 12, metrics: metrics(101, { reps: [101, 101] }) } },
    ], "nearWorst");
    expect(tight.bars[0].verdict).toBe("moves");
  });

  it("T3556 - when NOTHING moves, it says so rather than crowning a random winner", () => {
    const t = buildTornado(metrics(100), [
      { param: param("A", 10), low: { value: 8, metrics: metrics(100, { spread: 40, reps: [120, 80] }) }, high: { value: 12, metrics: metrics(101, { spread: 40, reps: [121, 81] }) } },
    ], "nearWorst");
    expect(t.statement).toMatch(/Nothing moved/);
    expect(t.statement).toMatch(/raise the replications/);
  });

  it("T3557 - with nothing testable at all it says there is nothing to rank", () => {
    const t = buildTornado(metrics(100), [{ param: param("Solo", 1, "teamCapacity"), low: null, high: null }], "nearWorst");
    expect(t.statement).toMatch(/nothing to rank/i);
  });

  it("T3558 - the variation width is stated, since ±20% is an assumption too", () => {
    const t = buildTornado(metrics(100), [run(param("Big", 10), 60, 140)], "nearWorst", 0.5);
    expect(t.variationPct).toBe(0.5);
    expect(t.statement).toContain("±50%");
    expect(DEFAULT_VARIATION).toBe(0.2);
  });
});

/**
 * A handler can be flawless and unreachable. The panel builds its URL by string
 * concatenation, so nothing in the type system ties it to the file on disk — and
 * a route that 404s looks, from inside the panel, exactly like a run that failed.
 */
describe("tornado — the route the panel calls actually exists", () => {
  /** The URL StudyManager hands TornadoPanel, with the ids substituted back out
   *  for the dynamic segment names Next resolves them from. */
  const routeFileFor = (url: string, ids: Record<string, string>) =>
    join(
      process.cwd(), "app",
      ...url.split("/").filter(Boolean).map((seg) => ids[seg] ?? seg),
      "route.ts",
    );

  it("T3559 - the advertised path resolves to a POST handler", () => {
    const url = "/api/projects/P/simulation/studies/S/scenarios/C/sensitivity";
    const file = routeFileFor(url, { P: "[id]", S: "[studyId]", C: "[scenarioId]" });
    expect(existsSync(file), `${url} has no handler at ${file}`).toBe(true);
    expect(readFileSync(file, "utf8")).toMatch(/export async function POST/);
  });

  it("T3560 - and the check can fail — a path with no handler is reported missing", () => {
    const url = "/api/projects/P/simulation/studies/S/scenarios/C/no-such-endpoint";
    expect(existsSync(routeFileFor(url, { P: "[id]", S: "[studyId]", C: "[scenarioId]" }))).toBe(false);
  });
});
