/**
 * "So what do I do?"
 *
 * Every other part of the Miner answers a question about the process. This
 * answers the one the reader asks next, and it is the question the tool has been
 * worst at: a screen full of correct findings is still homework.
 *
 * THREE RULES, AND THEY ARE WHAT MAKE THIS SAFE TO SHIP.
 *
 * 1. **The ranking is deterministic and the model never touches it.** The Miner
 *    is algorithmic by design, and that is precisely what makes a conformance
 *    number safe to put in front of an auditor. Findings are ranked by share of
 *    total elapsed time wherever a share exists, so they are comparable to one
 *    another. AI, where the org allows it, may rewrite the top few into prose —
 *    it may not reorder them and it may not add one.
 *
 * 2. **Every finding cites its number and resolves to its evidence.** A
 *    recommendation that cannot be traced back to the cases behind it is the one
 *    thing this feature cannot afford to ship, because the first time somebody
 *    checks and cannot find the basis, nothing the tool says afterwards counts.
 *
 * 3. **Nothing stands out is a valid answer.** A tool that always produces a top
 *    recommendation will eventually recommend noise, and the first time it does,
 *    nobody believes the next one. Thresholds are deliberately high enough that
 *    a healthy process returns an empty list and says so.
 *
 * The floors below follow from those: no SLA means no lateness findings — said
 * out loud, not silently omitted; no reference model means no conformance
 * findings; and a run without per-event detail gets no handover or rework
 * findings at all, because it cannot support the claim.
 *
 * Pure — no DB, no React.
 */

import type { RunAnalytics } from "./analytics";
import type { ConformanceResult } from "./transitionConformance";
import type { Variant } from "./types";
import type { KpiConfig } from "./outcomes";
import { computeOutcomes } from "./outcomes";
import { transitionRows } from "./handover";
import { computeTeamFlow } from "./teamFlow";

/** What a recommendation asks the user to do next. Each maps to something that
 *  already exists, so a finding ends in a click rather than in prose. */
export type ActionKind =
  /** Open the Deviations tab on this violation — the Phase 6 drill-through. */
  | "show-cases"
  /** Pre-set the Phase 5 filter to this slice. */
  | "slice"
  /** Open the tab that shows this finding in full. */
  | "open-tab"
  /** Calibrate a twin and go and sweep the constrained team. Closes the loop the
   *  product already claims: mine → calibrate → simulate → re-mine. */
  | "calibrate"
  /** The existing task-mining RPA path. */
  | "rpa-spec";

export interface MinerAction {
  kind: ActionKind;
  label: string;
  /** Which tab to open, for `open-tab` / `show-cases`. */
  tab?: string;
  /** For `slice`: the filter to apply. */
  filter?: { resource?: string };
  /** For `show-cases`: the index of the violation in `conformance.violations`. */
  violationIdx?: number;
}

export type FindingKind =
  | "bottleneck" | "handover" | "rework" | "lateness" | "deviation" | "backlog" | "cross-team";

export interface MinerFinding {
  kind: FindingKind;
  /** The headline, already carrying its own number. */
  title: string;
  /** Why it matters, in one sentence. */
  detail: string;
  /** Share of total elapsed time, where the finding has one. Used for ranking
   *  and shown, so two findings can be compared. Null when the finding is not
   *  time-shaped (a deviation count, a backlog trend). */
  share: number | null;
  /** Ranking weight. Time-shaped findings rank on their share; the others get a
   *  deliberately modest fixed weight so they sit below a real bottleneck but
   *  above nothing. */
  weight: number;
  action: MinerAction;
}

export interface NextStepsResult {
  findings: MinerFinding[];
  /** Why a whole class of finding is missing — shown, never silently omitted. */
  skipped: string[];
  /** True when the run is healthy enough that nothing cleared the bar. */
  nothingStandsOut: boolean;
}

/**
 * Thresholds. Set where they are because a finding below them is noise, and one
 * noisy recommendation costs more credibility than ten missed quiet ones.
 */
/**
 * A share threshold has to be relative to how many steps there are, and the
 * first version of this was not — which a test caught immediately. A process
 * of five equal steps gives every one of them 20% of the elapsed time, so a
 * flat "20% is a bottleneck" rule reports a bottleneck in a perfectly even
 * process. That is exactly the noise this phase must not produce.
 *
 * So a step is only notable when it holds meaningfully MORE than an even
 * share would give it, with an absolute floor underneath so that a two-step
 * process does not report a bottleneck for a trivial imbalance.
 */
const OVER_EVEN = 1.5;              // half again what an even split would give
const MIN_BOTTLENECK_SHARE = 0.2;   // …and at least a fifth of all elapsed time
const MIN_HANDOVER_SHARE = 0.15;    // …and at least this much of the waiting
const MIN_REWORK_PER_CASE = 1.5;    // "runs 1.5× per case" — half the cases redo it
const MIN_LATE_LIFT = 2;            // twice as likely to miss the SLA as average
const MIN_DEVIATION_CASES = 1;      // any real deviation is worth naming
const MIN_PINGPONG_PER_CASE = 1;    // work crosses back at least once per case
const BACKLOG_WEEKS = 3;            // consecutive buckets taking in more than finishing

export interface NextStepsInput {
  analytics: RunAnalytics | null;
  variants: Variant[];
  conformance: ConformanceResult | null;
  kpiConfig: KpiConfig | null;
  /** Whether this run already has a calibrated twin, which changes the advice
   *  from "build one" to "go and sweep it". */
  hasTwin: boolean;
}

export function findActions(input: NextStepsInput): NextStepsResult {
  const { analytics, variants, conformance, kpiConfig, hasTwin } = input;
  const findings: MinerFinding[] = [];
  const skipped: string[] = [];

  if (!analytics || analytics.activities.length === 0) {
    return { findings: [], skipped: ["This run has no analytics yet — re-import the log."], nothingStandsOut: false };
  }

  const totalTime = analytics.activities.reduce((s, a) => s + a.totalTimeMs, 0);
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  // ── Bottleneck ───────────────────────────────────────────────────────────
  const worst = analytics.activities[0];
  const timedActivities = analytics.activities.filter((a) => a.totalTimeMs > 0).length;
  const evenActivityShare = timedActivities > 0 ? 1 / timedActivities : 1;
  if (totalTime > 0 && worst
    && worst.totalTimeMs / totalTime >= MIN_BOTTLENECK_SHARE
    && worst.totalTimeMs / totalTime >= evenActivityShare * OVER_EVEN) {
    const share = worst.totalTimeMs / totalTime;
    findings.push({
      kind: "bottleneck",
      title: `${pct(share)} of elapsed time sits in "${worst.activity}"`,
      detail: `Across ${worst.caseFreq.toLocaleString()} cases it is the single largest consumer of time in this process.`,
      share, weight: share,
      action: { kind: "open-tab", label: "See the step breakdown", tab: "activities" },
    });
  }

  // ── The slowest hand-off ─────────────────────────────────────────────────
  const transitions = transitionRows(analytics.edges);
  const slowest = transitions.rows[0];
  const evenEdgeShare = transitions.rows.length > 0 ? 1 / transitions.rows.length : 1;
  if (slowest && transitions.totalMs > 0
    && slowest.totalMs / transitions.totalMs >= MIN_HANDOVER_SHARE
    && slowest.totalMs / transitions.totalMs >= evenEdgeShare * OVER_EVEN) {
    const share = slowest.totalMs / transitions.totalMs;
    findings.push({
      kind: "handover",
      title: `"${slowest.from}" → "${slowest.to}" accounts for ${pct(share)} of the waiting`,
      detail: slowest.medianMs !== null
        ? `It happens ${slowest.freq.toLocaleString()} times and the gap is typically the longest in the process. A gap that size between two steps is usually a queue, not work.`
        : `It happens ${slowest.freq.toLocaleString()} times. A gap between two steps is usually a queue, not work.`,
      share, weight: share,
      action: { kind: "open-tab", label: "See where the time goes", tab: "between" },
    });
  }

  // ── Teams: cross-team bouncing, and rework ───────────────────────────────
  const flow = computeTeamFlow(analytics, variants);
  if (flow.basis === "exact") {
    const cases = analytics.cases.length || 1;
    const worstBounce = flow.pingPong[0];
    if (worstBounce && worstBounce.bounces / cases >= MIN_PINGPONG_PER_CASE) {
      findings.push({
        kind: "cross-team",
        title: `Work crosses ${worstBounce.a} and ${worstBounce.b} ${(worstBounce.bounces / cases).toFixed(1)}× per case`,
        detail: `${worstBounce.cases.toLocaleString()} cases come back to a team that had already finished with them. Each return is a queue the case joins twice.`,
        share: null, weight: 0.3,
        action: { kind: "open-tab", label: "See the hand-offs", tab: "teams" },
      });
    }
    const worstRework = flow.rework[0];
    if (worstRework && worstRework.perCase >= MIN_REWORK_PER_CASE) {
      findings.push({
        kind: "rework",
        title: `"${worstRework.activity}" runs ${worstRework.perCase.toFixed(1)}× per case`,
        detail: `${worstRework.cases.toLocaleString()} cases do it more than once. Work repeated is work that did not stick the first time.`,
        share: null, weight: 0.35,
        action: { kind: "open-tab", label: "See the repeated steps", tab: "teams" },
      });
    }
  } else {
    // Named, not silently omitted — the difference between "your process is fine"
    // and "this run cannot answer that".
    skipped.push(flow.basis === "none"
      ? "No hand-off or rework advice: this log has no teams. Map a resource column at import."
      : "No hand-off or rework advice: this run has no per-event detail, and an approximate map is not a safe basis for a recommendation.");
  }

  // ── Lateness drivers ─────────────────────────────────────────────────────
  const outcomes = computeOutcomes(analytics, variants, kpiConfig);
  if (!outcomes) {
    skipped.push("No lateness advice: no SLA is set for this process. Set one on the Outcomes tab and the drivers can be ranked.");
  } else {
    const driver = outcomes.activityDrivers.find((d) => d.lift >= MIN_LATE_LIFT);
    if (driver) {
      findings.push({
        kind: "lateness",
        title: `Cases that pass through "${driver.activity}" are ${driver.lift.toFixed(1)}× more likely to miss the SLA`,
        detail: `${driver.late.toLocaleString()} of ${driver.cases.toLocaleString()} such cases were late, against ${pct(outcomes.late / Math.max(1, outcomes.total))} across the run.`,
        share: null, weight: 0.45,
        action: { kind: "open-tab", label: "See the outcome split", tab: "outcomes" },
      });
    }
  }

  // ── Deviations ───────────────────────────────────────────────────────────
  if (!conformance) {
    skipped.push("No conformance advice: this run has not been checked against a reference model.");
  } else {
    const idx = conformance.violations.findIndex((v) => v.severity === "error" && v.cases >= MIN_DEVIATION_CASES);
    if (idx >= 0) {
      const v = conformance.violations[idx];
      findings.push({
        kind: "deviation",
        title: `${v.cases.toLocaleString()} case${v.cases === 1 ? "" : "s"} deviate from the reference`,
        detail: v.message,
        share: null, weight: 0.5,
        // The one action that is evidence rather than another view.
        action: { kind: "show-cases", label: "Show me the cases", tab: "conformance", violationIdx: idx },
      });
    }
  }

  // ── Backlog ──────────────────────────────────────────────────────────────
  const run = longestBacklogRun(analytics);
  if (run >= BACKLOG_WEEKS) {
    findings.push({
      kind: "backlog",
      title: `More work came in than went out for ${run} periods running`,
      detail: "Arrivals exceeded completions across consecutive stretches of the log. Whatever the average cycle time says, the queue was growing.",
      share: null, weight: 0.4,
      action: { kind: "open-tab", label: "See arrivals against completions", tab: "activities" },
    });
  }

  findings.sort((a, b) => b.weight - a.weight);

  // ── The one action that closes the loop ──────────────────────────────────
  // Offered only when there is a time-shaped finding to act on: sweeping a team
  // is advice about capacity, and without a bottleneck or a hand-off there is
  // nothing to sweep for.
  const timeFinding = findings.find((f) => f.share !== null);
  if (timeFinding && flow.basis === "exact" && flow.loads.length > 0) {
    const busiest = flow.loads[0];
    findings.push({
      kind: "bottleneck",
      title: hasTwin
        ? `Try more capacity in ${busiest.team} on the twin you already have`
        : `Build a twin and try more capacity in ${busiest.team}`,
      detail: `${busiest.team} holds ${pct(busiest.share)} of the recorded time. A simulation can answer what another person there would actually be worth — measured from this log, not guessed.`,
      share: null, weight: 0.25,
      action: { kind: "calibrate", label: hasTwin ? "Open the twin" : "Calibrate a twin" },
    });
  }

  return {
    findings,
    skipped,
    nothingStandsOut: findings.length === 0,
  };
}

/**
 * The longest run of consecutive buckets where arrivals exceeded completions.
 *
 * Not the total count: three isolated busy weeks across a year is seasonality,
 * three consecutive ones is a backlog, and only the second is worth advice.
 */
export function longestBacklogRun(analytics: RunAnalytics): number {
  let best = 0, cur = 0;
  for (const b of analytics.throughput) {
    if (b.started > b.completed) { cur++; if (cur > best) best = cur; }
    else cur = 0;
  }
  return best;
}

/**
 * The facts an AI narrator is allowed to see.
 *
 * Deliberately the computed findings and nothing else — no raw analytics, no
 * variants. A model given the underlying data would invent an ordering; given
 * only this, the most it can do is rewrite sentences that were already ranked.
 */
export function narrationFacts(result: NextStepsResult): string {
  const lines = result.findings.map((f, i) =>
    `${i + 1}. [${f.kind}] ${f.title}. ${f.detail}${f.share !== null ? ` (share of elapsed time: ${(f.share * 100).toFixed(0)}%)` : ""}`);
  if (result.skipped.length) lines.push("", "Not assessed:", ...result.skipped.map((s) => `- ${s}`));
  return lines.join("\n");
}
