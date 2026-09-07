/**
 * "Suggested next steps" — the ranked advice computed from a study's run history.
 *
 * Every assertion here is on the DETERMINISTIC layer, which is the whole design:
 * the model narrates these findings and cannot add to them, so if the arithmetic
 * is right the output is safe. A fabricated trend is the failure this feature
 * must not have, and this file is what rules it out.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  suggestNextSteps,
  leverHistory,
  outcomeOf,
  isInsideNoise,
  enumerateLevers,
  MIN_OBSERVATIONS,
} from "@/app/lib/simulation/nextSteps";
import { buildNextStepsFacts, summariseNextSteps } from "@/app/lib/simulation/facts/nextStepsFacts";
import type { StudyRun } from "@/app/lib/simulation/studyRuns";
import type { RunMetrics } from "@/app/lib/simulation/results";
import type { OverrideSet } from "@/app/lib/simulation/overrides";
import { DEFAULT_RUN_CONFIG } from "@/app/lib/simulation/types";

const stat = (mean: number, spread = 0) => ({ mean, p5: mean - spread, p50: mean, p95: mean + spread });

/** A run's metrics with the few figures these rules read. `nearWorst` drives
 *  "best"; `meanSpread` is the run-to-run band the noise test uses. */
function metrics(opts: {
  nearWorst: number;
  mean?: number;
  meanSpread?: number;
  teams?: Record<string, number>;
  bottlenecks?: string[];
  util?: Record<string, number>;
  tasks?: Record<string, string>;
}): RunMetrics {
  const mean = opts.mean ?? opts.nearWorst;
  const teams = opts.teams ?? { Assessment: 2 };
  const nodeLabels: RunMetrics["nodeLabels"] = {};
  for (const [id, label] of Object.entries(opts.tasks ?? {})) nodeLabels[id] = { label, kind: "task" };
  return {
    stats: {
      replications: 10,
      arrived: stat(100),
      completed: stat(100),
      flowTime: stat(mean, opts.meanSpread ?? 0),
      totalCost: stat(0),
      costPerCase: stat(0),
      caseFlow: { count: 100, mean, sd: 1, min: 0, p50: mean, p90: opts.nearWorst, p95: opts.nearWorst, max: opts.nearWorst, histogram: { min: 0, binWidth: 1, counts: [] } },
      perNode: {},
      perTeam: Object.fromEntries(Object.keys(teams).map((t) => [t, {
        utilization: stat(opts.util?.[t] ?? 0.9), avgQueue: stat(0), maxQueue: stat(0), cost: stat(0),
      }])),
    },
    bottlenecks: opts.bottlenecks ?? Object.keys(teams),
    nodeLabels,
    clockUnit: "minute",
    teamCapacities: teams,
  };
}

function run(scenarioName: string, overrides: OverrideSet, m: RunMetrics, startedAt = "2026-09-01T10:00:00.000Z"): StudyRun {
  return {
    scenarioId: scenarioName, scenarioName,
    isBaselineScenario: false,
    runId: `${scenarioName}-run`, runName: null, pinned: false,
    startedAt,
    config: { ...DEFAULT_RUN_CONFIG },
    scenarioOverrides: overrides,
    metrics: m,
  };
}
const cap = (team: string, n: number): OverrideSet => ({ teams: { [team]: { capacity: n } } });

describe("next steps — the honest floor", () => {
  it("T3372 - says there is nothing to say rather than inventing advice, below three scenarios", () => {
    const r = suggestNextSteps([
      run("Baseline", {}, metrics({ nearWorst: 100 })),
      run("More staff", cap("Assessment", 4), metrics({ nearWorst: 80 })),
    ]);
    expect(r.enough).toBe(false);
    expect(r.suggestions).toEqual([]);
    expect(r.reason).toContain(String(MIN_OBSERVATIONS));
  });

  it("T3373 - an empty history is a reason, not a crash", () => {
    const r = suggestNextSteps([]);
    expect(r.enough).toBe(false);
    expect(r.observations).toBe(0);
    expect(r.reason).toMatch(/No completed runs/i);
  });

  it("T3374 - only the LATEST run of each scenario is used, because older ones may not match their overrides", () => {
    const older = run("A", cap("Assessment", 2), metrics({ nearWorst: 100 }), "2026-09-01T10:00:00.000Z");
    const newer = { ...older, runId: "A-newer", startedAt: "2026-09-09T10:00:00.000Z" };
    const r = suggestNextSteps([older, newer, run("B", cap("Assessment", 4), metrics({ nearWorst: 80 })), run("C", cap("Assessment", 6), metrics({ nearWorst: 60 }))]);
    expect(r.observations).toBe(3); // three scenarios, not four runs
  });
});

describe("next steps — the ranking rules", () => {
  it("T3375 - a team that tops the bottleneck ranking in every run and was never varied comes first", () => {
    const m = () => metrics({ nearWorst: 100, teams: { Assessment: 2, Appeals: 1 }, bottlenecks: ["Assessment", "Appeals"], util: { Assessment: 0.97 } });
    const r = suggestNextSteps([
      run("A", { elements: { t1: { units: 1 } } }, m()),
      run("B", { elements: { t1: { units: 2 } } }, m()),
      run("C", { elements: { t1: { units: 3 } } }, m()),
    ]);
    expect(r.enough).toBe(true);
    const top = r.suggestions[0];
    expect(top.kind).toBe("unaddressed-bottleneck");
    expect(top.evidence).toContain("all 3 runs");
    expect(top.evidence).toContain("97%");
    // ...and it is a button, not homework: capacity 2 → 3.
    expect(top.overrides).toEqual({ teams: { Assessment: { capacity: 3 } } });
    expect(top.scenarioName).toBe("Assessment at 3");
  });

  it("T3376 - a lever still improving at the highest value tried says so, and proposes the next value", () => {
    const r = suggestNextSteps([
      run("Cap 2", cap("Assessment", 2), metrics({ nearWorst: 100, meanSpread: 1 })),
      run("Cap 4", cap("Assessment", 4), metrics({ nearWorst: 70, meanSpread: 1 })),
      run("Cap 6", cap("Assessment", 6), metrics({ nearWorst: 40, meanSpread: 1 })),
    ]);
    const s = r.suggestions.find((x) => x.kind === "still-improving");
    expect(s, "expected a still-improving suggestion").toBeTruthy();
    expect(s!.title).toContain("past 6");
    expect(s!.overrides).toEqual({ teams: { Assessment: { capacity: 9 } } });
  });

  it("T3377 - a lever whose whole range sits inside the noise is reported as NOT the constraint", () => {
    // Three capacities, near-identical results, and a wide run-to-run band.
    const r = suggestNextSteps([
      run("Cap 2", cap("Assessment", 2), metrics({ nearWorst: 100, mean: 100, meanSpread: 20 })),
      run("Cap 4", cap("Assessment", 4), metrics({ nearWorst: 99, mean: 99, meanSpread: 20 })),
      run("Cap 6", cap("Assessment", 6), metrics({ nearWorst: 98, mean: 98, meanSpread: 20 })),
    ]);
    const s = r.suggestions.find((x) => x.kind === "inside-noise");
    expect(s, "expected an inside-noise finding").toBeTruthy();
    expect(s!.title).toContain("not your constraint");
    // A negative result is advice, not an action — it must NOT offer a button.
    expect(s!.overrides).toBeUndefined();
    expect(s!.scenarioName).toBeUndefined();
  });

  it("T3378 - a lever set once and never revisited is flagged as a single point", () => {
    const r = suggestNextSteps([
      run("A", cap("Appeals", 3), metrics({ nearWorst: 90, teams: { Assessment: 2, Appeals: 3 }, bottlenecks: ["Assessment", "Appeals"] })),
      run("B", cap("Assessment", 2), metrics({ nearWorst: 95, teams: { Assessment: 2, Appeals: 1 }, bottlenecks: ["Assessment", "Appeals"] })),
      run("C", cap("Assessment", 4), metrics({ nearWorst: 80, teams: { Assessment: 4, Appeals: 1 }, bottlenecks: ["Assessment", "Appeals"] })),
    ]);
    const s = r.suggestions.find((x) => x.kind === "abandoned-lever" && x.lever.target === "Appeals");
    expect(s, "expected Appeals flagged as tried once").toBeTruthy();
    expect(s!.evidence).toContain('"A"');
  });

  it("T3379 - suggestions are ordered by strength of evidence, deterministically", () => {
    const runs = [
      run("A", cap("Appeals", 3), metrics({ nearWorst: 90, teams: { Assessment: 2, Appeals: 3 }, bottlenecks: ["Assessment", "Appeals"] })),
      run("B", cap("Appeals", 5), metrics({ nearWorst: 88, teams: { Assessment: 2, Appeals: 5 }, bottlenecks: ["Assessment", "Appeals"] })),
      run("C", cap("Appeals", 7), metrics({ nearWorst: 87, teams: { Assessment: 2, Appeals: 7 }, bottlenecks: ["Assessment", "Appeals"] })),
    ];
    const a = suggestNextSteps(runs).suggestions.map((s) => s.kind);
    const b = suggestNextSteps([...runs].reverse()).suggestions.map((s) => s.kind);
    expect(a).toEqual(b);                                   // order does not depend on input order
    expect(a[0]).toBe("unaddressed-bottleneck");            // Assessment: busiest every run, never varied
    expect(a).toContain("still-improving");                 // Appeals: 3 -> 5 -> 7, still paying at 7
  });
});

describe("next steps — the pieces", () => {
  it("T3380 - levers are enumerated from stored metrics alone: teams, tasks and sources", () => {
    const m = metrics({ nearWorst: 10, teams: { Assessment: 2, Appeals: 1 }, tasks: { t1: "Assess claim" } });
    m.nodeLabels.s1 = { label: "Claims arrive", kind: "source" };
    m.nodeLabels.g1 = { label: "Approved?", kind: "gateway" };
    const kinds = enumerateLevers(m).map((l) => `${l.kind}:${l.label}`).sort();
    expect(kinds).toEqual([
      "sourceArrival:Claims arrive",
      "taskCycleTime:Assess claim",
      "teamCapacity:Appeals",
      "teamCapacity:Assessment",
    ]);
    // a gateway is not a lever this module can propose a value for
    expect(kinds.some((k) => k.includes("Approved?"))).toBe(false);
  });

  it("T3381 - a difference smaller than the run-to-run band is inside the noise; a larger one is not", () => {
    const wide = outcomeOf(metrics({ nearWorst: 100, mean: 100, meanSpread: 10 }));
    const near = outcomeOf(metrics({ nearWorst: 95, mean: 95, meanSpread: 10 }));
    const far = outcomeOf(metrics({ nearWorst: 50, mean: 50, meanSpread: 10 }));
    expect(isInsideNoise(wide, near)).toBe(true);
    expect(isInsideNoise(wide, far)).toBe(false);
  });

  it("T3382 - outcomeOf falls back to run-average percentiles when a run predates caseFlow", () => {
    const m = metrics({ nearWorst: 100 });
    // an older run: no per-case distribution was stored
    (m.stats as { caseFlow?: unknown }).caseFlow = { count: 0, mean: 0, sd: 0, min: 0, p50: 0, p90: 0, p95: 0, max: 0, histogram: { min: 0, binWidth: 1, counts: [] } };
    m.stats.flowTime = stat(77, 5);
    const o = outcomeOf(m);
    expect(o.mean).toBe(77);
    expect(o.nearWorst).toBe(82);      // flowTime.p95, not a zero reported as measured
  });

  it("T3383 - leverHistory records the values tried, ascending, with the best by near-worst case", () => {
    const h = leverHistory([
      run("Cap 6", cap("Assessment", 6), metrics({ nearWorst: 40 })),
      run("Cap 2", cap("Assessment", 2), metrics({ nearWorst: 100 })),
      run("Cap 4", cap("Assessment", 4), metrics({ nearWorst: 70 })),
    ]).find((x) => x.lever.target === "Assessment")!;
    expect(h.values).toEqual([2, 4, 6]);
    expect(h.best?.value).toBe(6);
    expect(h.bestGain).toBe(60);       // 100 → 40
  });
});

describe("next steps — narration is bounded by the facts", () => {
  it("T3384 - the facts handed to the model contain only computed findings", () => {
    const r = suggestNextSteps([
      run("Cap 2", cap("Assessment", 2), metrics({ nearWorst: 100, teams: { Assessment: 2, Appeals: 1 } })),
      run("Cap 4", cap("Assessment", 4), metrics({ nearWorst: 70, teams: { Assessment: 4, Appeals: 1 } })),
      run("Cap 6", cap("Assessment", 6), metrics({ nearWorst: 40, teams: { Assessment: 6, Appeals: 1 } })),
    ]);
    const f = buildNextStepsFacts(r, "Claims study");
    expect(f.studyName).toBe("Claims study");
    expect(f.observations).toBe(3);
    expect(f.leversTried).toContainEqual({ name: "Assessment", values: [2, 4, 6] });
    expect(f.leversUntouched).toContain("Appeals");
    // every fact traces to a suggestion the arithmetic produced
    expect(f.suggestions.map((s) => s.title)).toEqual(r.suggestions.map((s) => s.title));
    expect(f.suggestions[0].rank).toBe(1);
  });

  it("T3385 - the deterministic summary renders the same findings when AI is off", () => {
    const r = suggestNextSteps([
      run("Cap 2", cap("Assessment", 2), metrics({ nearWorst: 100 })),
      run("Cap 4", cap("Assessment", 4), metrics({ nearWorst: 70 })),
      run("Cap 6", cap("Assessment", 6), metrics({ nearWorst: 40 })),
    ]);
    const text = summariseNextSteps(buildNextStepsFacts(r, "Claims study"));
    expect(text).toContain("Based on 3 scenarios");
    for (const s of r.suggestions) expect(text).toContain(s.title);
    expect(text).toContain("deterministically");
  });
});

/**
 * A handler can be perfect and unreachable. The panel posts to a literal path
 * built in StudyManager, so the path and the route file must agree — a structural
 * fact, and cheap to assert (same reasoning as tests/partner/advertised-routes).
 */
describe("next steps — the route is reachable", () => {
  const APP = path.join(process.cwd(), "app");
  /** Walk the app router the way Next does: exact segment, else a [dynamic] one. */
  function resolves(pathname: string): boolean {
    let dir = APP;
    for (const raw of pathname.split("/").filter(Boolean)) {
      if (!fs.existsSync(dir)) return false;
      const names = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
      if (names.includes(raw)) { dir = path.join(dir, raw); continue; }
      const dyn = names.find((n) => /^\[[^.\]]+\]$/.test(n));
      if (!dyn) return false;
      dir = path.join(dir, dyn);
    }
    return fs.existsSync(path.join(dir, "route.ts"));
  }

  it("T3386 - the path the panel posts to resolves to a route file", () => {
    expect(resolves("/api/projects/p1/simulation/studies/s1/next-steps")).toBe(true);
    // ...and the check can fail: a neighbouring path that has no handler.
    expect(resolves("/api/projects/p1/simulation/studies/s1/next-steps-typo")).toBe(false);
  });
});
