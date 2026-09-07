/**
 * Does this model match reality?
 *
 * Every simulation is asked it, and today the answer is judgement. This makes it
 * a number: hold back part of a real event log, calibrate the twin on the rest,
 * run it, and compare the flow-time distribution the model produces against the
 * one the business actually had.
 *
 * THE TEST is two-sample Kolmogorov–Smirnov: the largest gap between the two
 * empirical cumulative distributions. Chosen because it assumes NOTHING about the
 * shape — process flow times are skewed, multi-modal and censored, and any test
 * that assumed normality would give a confident answer about the wrong thing.
 * D is bounded 0..1, so `1 − D` reads directly as an agreement figure.
 *
 * WHAT IT CANNOT DO, stated because a validation figure that oversells itself is
 * worse than none. Failing to reject is not proof the model is right — it means
 * the data cannot tell the two apart at this sample size. With few cases almost
 * nothing is rejected, which is why the honest floor below refuses to answer
 * rather than returning a flattering figure.
 *
 * Pure — no DB, no React, safe for a client component.
 */

/** Below this many cases on either side there is not enough to compare. A KS
 *  test on a handful of cases fails to reject almost anything, which would read
 *  as "the model is excellent" when it means "we cannot tell". */
export const MIN_SAMPLES = 20;

export interface DistributionSummary {
  n: number;
  p50: number;
  p90: number;
  p95: number;
  mean: number;
}

export interface DistributionComparison {
  /** True when there was enough data on both sides to say anything at all. */
  enough: boolean;
  /** The KS statistic: the largest gap between the two cumulative curves, 0..1. */
  d: number;
  /** The 95% critical value for these sample sizes. */
  dCritical: number;
  /** 1 − D, as a percentage. The headline "agreement" figure. */
  agreementPct: number;
  /** True when D is within the critical value: the data cannot tell the two
   *  distributions apart. NOT proof the model is correct — see the header. */
  close: boolean;
  simulated: DistributionSummary;
  observed: DistributionSummary;
  /** Plain-English reading, safe to show verbatim. */
  statement: string;
}

const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);

function percentile(s: number[], p: number): number {
  if (s.length === 0) return 0;
  if (s.length === 1) return s[0];
  const i = (p / 100) * (s.length - 1);
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
}

function summarise(s: number[], n: number): DistributionSummary {
  return {
    n,
    p50: percentile(s, 50),
    p90: percentile(s, 90),
    p95: percentile(s, 95),
    mean: s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0,
  };
}

/** The two-sample KS statistic: the largest vertical gap between the empirical
 *  CDFs, found by a single merged walk. */
export function ksStatistic(a: number[], b: number[]): number {
  const A = sorted(a), B = sorted(b);
  if (A.length === 0 || B.length === 0) return 1;
  let i = 0, j = 0, d = 0;
  while (i < A.length && j < B.length) {
    const x = Math.min(A[i], B[j]);
    while (i < A.length && A[i] <= x) i++;
    while (j < B.length && B[j] <= x) j++;
    d = Math.max(d, Math.abs(i / A.length - j / B.length));
  }
  return d;
}

/**
 * Compare a simulated flow-time distribution with an observed one.
 *
 * `simulated` may be a compact QUANTILE VECTOR rather than every case — the run
 * stores 101 percentiles, not 50,000 samples. Pass the true case count as
 * `simulatedN` so the critical value reflects how much evidence there actually
 * is; using 101 would make the test far too lenient.
 */
export function compareDistributions(
  simulated: number[],
  observed: number[],
  opts: { simulatedN?: number; unit?: string } = {},
): DistributionComparison {
  const simN = opts.simulatedN ?? simulated.length;
  const obsN = observed.length;
  const unit = opts.unit ? ` ${opts.unit}` : "";
  const S = sorted(simulated), O = sorted(observed);

  const base: DistributionComparison = {
    enough: false, d: 0, dCritical: 0, agreementPct: 0, close: false,
    simulated: summarise(S, simN), observed: summarise(O, obsN), statement: "",
  };

  if (simN < MIN_SAMPLES || obsN < MIN_SAMPLES) {
    base.statement =
      `Not enough cases to check the model against reality — ${simN} simulated and ${obsN} observed, ` +
      `and at least ${MIN_SAMPLES} of each are needed. A test on fewer would fail to spot almost any ` +
      `difference, which would read as agreement when it means the data cannot tell.`;
    return base;
  }

  const d = ksStatistic(S, O);
  // The standard 95% two-sample critical value.
  const dCritical = 1.36 * Math.sqrt((simN + obsN) / (simN * obsN));
  const close = d <= dCritical;
  const agreementPct = Math.round((1 - d) * 100);

  const pctDiff = (a: number, b: number) => (a > 0 ? Math.round(((b - a) / a) * 100) : 0);
  const p50Diff = pctDiff(base.observed.p50, base.simulated.p50);
  const p95Diff = pctDiff(base.observed.p95, base.simulated.p95);

  const statement = close
    ? `The model agrees with what actually happened to within ${agreementPct}% — the largest gap between ` +
      `the two distributions (${d.toFixed(3)}) is inside what ${simN} simulated and ${obsN} real cases can ` +
      `distinguish. Typical case: ${base.observed.p50.toFixed(1)}${unit} observed against ` +
      `${base.simulated.p50.toFixed(1)}${unit} simulated (${p50Diff >= 0 ? "+" : ""}${p50Diff}%). ` +
      `That is not proof the model is right — it means the data cannot tell them apart.`
    : `The model and reality DIVERGE: the largest gap between the two distributions (${d.toFixed(3)}) is ` +
      `beyond what ${simN} simulated and ${obsN} real cases could produce by chance ` +
      `(threshold ${dCritical.toFixed(3)}). Typical case ${base.observed.p50.toFixed(1)}${unit} observed ` +
      `against ${base.simulated.p50.toFixed(1)}${unit} simulated (${p50Diff >= 0 ? "+" : ""}${p50Diff}%), ` +
      `near-worst ${base.observed.p95.toFixed(1)} against ${base.simulated.p95.toFixed(1)} ` +
      `(${p95Diff >= 0 ? "+" : ""}${p95Diff}%). Check the arrival rate, the branch splits and the ` +
      `working calendar before relying on the model's answers.`;

  return { ...base, enough: true, d, dCritical, agreementPct, close, statement };
}

/**
 * A compact quantile vector (p0…p100) from a sample set — what a run stores so
 * this comparison can be made later without keeping every case.
 */
export function quantileVector(samples: number[], steps = 100): number[] {
  const s = sorted(samples);
  if (s.length === 0) return [];
  return Array.from({ length: steps + 1 }, (_, i) => percentile(s, (i / steps) * 100));
}

/**
 * Split cases into the part a model is FITTED on and the part it is TESTED
 * against, by start time — earlier cases train, later cases test.
 *
 * Chronological on purpose: a random split would leak the future into the fit,
 * and a process that drifted over the period would then validate against itself.
 * The point of holding data back is to ask whether the model predicts cases it
 * has never seen.
 */
export function splitByTime<T extends { startMs: number }>(
  cases: T[],
  holdoutPct: number,
): { fit: T[]; holdout: T[]; splitMs: number | null } {
  const pct = Math.max(0, Math.min(0.9, holdoutPct));
  if (pct === 0 || cases.length === 0) return { fit: cases, holdout: [], splitMs: null };
  const byTime = [...cases].sort((a, b) => a.startMs - b.startMs);
  const cut = Math.max(1, Math.floor(byTime.length * (1 - pct)));
  return { fit: byTime.slice(0, cut), holdout: byTime.slice(cut), splitMs: byTime[cut]?.startMs ?? null };
}
