/**
 * Is the difference real, or is it noise?
 *
 * The Simulator already separates run-to-run variation from case-to-case spread,
 * which is more statistical honesty than most tools offer — but it stops short of
 * the verdict. Someone will otherwise present a 4% improvement that is entirely
 * sampling noise and be found out by the first person who reruns it.
 *
 * The test is Welch's — two independent samples of per-replication means, without
 * assuming equal variances, which is right because a scenario that relieves a
 * bottleneck is usually both faster AND less variable. The output is a confidence
 * interval ON THE DIFFERENCE: if it excludes zero the difference is real at that
 * confidence, and if it does not, the honest answer is "we cannot tell yet" — plus
 * how many more replications would settle it.
 *
 * "We cannot tell yet" is a first-class answer here, not a failure. The one thing
 * this module must never do is let a difference inside the noise be presented as
 * a finding.
 *
 * Pure — no DB, no React, and safe for a client component to import.
 */

/** Two-tailed 95% critical values of Student's t by degrees of freedom.
 *  A table rather than an inverse-CDF implementation: the range that matters is
 *  small (runs are typically 5–30 replications), and a table is inspectable,
 *  exact at the tabulated points, and impossible to get subtly wrong. */
const T95: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306,
  9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131,
  16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086, 21: 2.080, 22: 2.074,
  23: 2.069, 24: 2.064, 25: 2.060, 26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045,
  30: 2.042, 40: 2.021, 60: 2.000, 120: 1.980,
};
const T95_INF = 1.960;

/** The 95% two-tailed critical value for `df`, conservative between table rows
 *  (we take the LARGER value, so the interval is never narrower than it should
 *  be — erring towards "cannot tell", never towards a false finding). */
export function tCritical95(df: number): number {
  if (!Number.isFinite(df) || df < 1) return T95[1];
  const d = Math.floor(df);
  if (T95[d] !== undefined) return T95[d];
  const keys = Object.keys(T95).map(Number).sort((a, b) => a - b);
  const below = keys.filter((k) => k < d).pop();
  return below !== undefined && d > 120 ? T95_INF : T95[below ?? 1] ?? T95_INF;
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Sample variance (n−1). Zero for fewer than two observations. */
export function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1);
}

export type Verdict = "real" | "inside-noise" | "not-enough-data" | "approximate";

export interface SignificanceResult {
  verdict: Verdict;
  /** baseline mean − comparison mean. Positive = the comparison is lower. */
  difference: number;
  /** Difference as a percentage of the baseline. */
  differencePct: number;
  /** Half-width of the 95% confidence interval on the difference. */
  halfWidth: number;
  /** The interval itself: [difference − halfWidth, difference + halfWidth]. */
  ci: [number, number];
  baseN: number;
  compareN: number;
  /** Replications EACH SIDE that would be needed to resolve a difference this
   *  size. Present only when the verdict is "inside-noise". */
  replicationsNeeded?: number;
  /**
   * Is the difference bigger than the uncertainty we were able to measure?
   *
   * Deliberately SEPARATE from `verdict`: the verdict says how much to trust the
   * answer ("real", or only "approximate" because the runs predate per-replication
   * recording), while this says which way the answer points. A caller that needs a
   * yes/no reads this; a caller that needs to caveat it reads the verdict. Folding
   * the two together made every approximate comparison read as noise.
   */
  exceedsBand: boolean;
  /** Plain-English statement, safe to show verbatim. */
  statement: string;
}

/** Should a difference this size be believed? `lowerIsBetter` only affects the
 *  wording, never the arithmetic. */
export function compareSamples(
  baseSamples: number[] | undefined,
  compareSamples_: number[] | undefined,
  opts: { label?: string; lowerIsBetter?: boolean; baseMeanFallback?: number; compareMeanFallback?: number; approxHalfWidth?: number } = {},
): SignificanceResult {
  const label = opts.label ?? "the difference";
  const lowerIsBetter = opts.lowerIsBetter !== false;

  const a = baseSamples ?? [], b = compareSamples_ ?? [];

  // No stored vector — the run predates it. Fall back to the p5–p95 band, and be
  // explicit that the verdict is approximate rather than pretending to certainty.
  if (a.length < 2 || b.length < 2) {
    const bm = opts.baseMeanFallback ?? mean(a);
    const cm = opts.compareMeanFallback ?? mean(b);
    const diff = bm - cm;
    const hw = opts.approxHalfWidth ?? 0;
    // Bigger than whatever band we could measure — INCLUDING a zero band, which
    // means the replications agreed exactly. How much to trust that is the
    // verdict’s job, not this one’s.
    const beyond = Math.abs(diff) > hw;
    return {
      // Approximate when there IS a run-to-run band to judge against, even from a
      // run that never stored its replications; not-enough-data when there is
      // nothing to judge with at all.
      verdict: hw > 0 ? "approximate" : "not-enough-data",
      difference: diff,
      differencePct: bm !== 0 ? (diff / bm) * 100 : 0,
      halfWidth: hw,
      ci: [diff - hw, diff + hw],
      baseN: a.length,
      compareN: b.length,
      exceedsBand: beyond,
      statement:
        hw > 0
          ? `These runs predate per-replication recording, so this is approximate: ${label} of ${fmt(diff)} is ` +
            `${beyond ? "larger" : "no larger"} than the run-to-run band. Re-run both sides for a proper verdict.`
          : `Not enough recorded runs to say whether ${label} is real. Re-run both sides with more than one replication.`,
    };
  }

  const n1 = a.length, n2 = b.length;
  const m1 = mean(a), m2 = mean(b);
  const v1 = variance(a), v2 = variance(b);
  const se = Math.sqrt(v1 / n1 + v2 / n2);
  const difference = m1 - m2;
  const differencePct = m1 !== 0 ? (difference / m1) * 100 : 0;

  // Both sides perfectly steady (a fixed-time model): any difference at all is
  // real, and there is no noise to be inside of.
  if (se === 0) {
    return {
      verdict: difference === 0 ? "inside-noise" : "real",
      difference, differencePct, halfWidth: 0, ci: [difference, difference], baseN: n1, compareN: n2,
      exceedsBand: difference !== 0,
      statement: difference === 0
        ? `${cap(label)} is exactly zero — the two runs produced identical results.`
        : `${cap(label)} of ${fmt(difference)} is real: neither run varied at all, so there is no noise to explain it.`,
    };
  }

  // Welch–Satterthwaite degrees of freedom.
  const df = Math.pow(v1 / n1 + v2 / n2, 2) /
    (Math.pow(v1 / n1, 2) / (n1 - 1) + Math.pow(v2 / n2, 2) / (n2 - 1));
  const halfWidth = tCritical95(df) * se;
  const real = Math.abs(difference) > halfWidth;

  const result: SignificanceResult = {
    verdict: real ? "real" : "inside-noise",
    difference, differencePct, halfWidth,
    ci: [difference - halfWidth, difference + halfWidth],
    baseN: n1, compareN: n2,
    exceedsBand: real,
    statement: "",
  };

  if (real) {
    const dir = lowerIsBetter ? (difference > 0 ? "better" : "worse") : (difference > 0 ? "worse" : "better");
    result.statement =
      `${cap(label)} of ${fmt(Math.abs(difference))} (${Math.abs(differencePct).toFixed(0)}% ${dir}) is larger than ` +
      `the run-to-run noise — it is a real difference, not sampling variation. ` +
      `95% confident the true difference is between ${fmt(result.ci[0])} and ${fmt(result.ci[1])}.`;
  } else {
    result.replicationsNeeded = replicationsNeeded(v1, v2, Math.abs(difference));
    result.statement =
      `${cap(label)} of ${fmt(Math.abs(difference))} is INSIDE the run-to-run noise (±${fmt(halfWidth)}), so it ` +
      `cannot be told apart from sampling variation. ` +
      (result.replicationsNeeded
        ? `About ${result.replicationsNeeded} replications each side would settle it.`
        : `A difference this small may not be resolvable at any practical number of replications.`);
  }
  return result;
}

/**
 * Replications per side needed for the 95% interval to be narrower than
 * `target`. Iterated, because the critical value itself depends on n.
 *
 * Returns undefined above a practical ceiling — telling someone to run 40,000
 * replications is not advice, and `RUN_LIMITS` would refuse it anyway.
 */
export function replicationsNeeded(v1: number, v2: number, target: number, max = 200): number | undefined {
  if (target <= 0) return undefined;
  let n = 2;
  for (let i = 0; i < 40; i++) {
    const se = Math.sqrt(v1 / n + v2 / n);
    const need = Math.ceil(Math.pow((tCritical95(2 * n - 2) * Math.sqrt(v1 + v2)) / target, 2));
    if (need <= n) return Math.max(2, n);
    if (need > max) return undefined;
    n = Math.min(max, Math.max(n + 1, need));
    if (se === 0) return 2;
  }
  return n <= max ? n : undefined;
}

const fmt = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 1 ? n.toFixed(1) : n.toFixed(2));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
