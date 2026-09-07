/**
 * Suggesting a warm-up period, instead of asking someone to guess one.
 *
 * A simulation starting from an empty system is not yet behaving the way it will
 * behave in the long run: queues are short because nothing has arrived yet, so
 * the first cases finish unrealistically fast. Statistics gathered over that
 * lead-in drag the answer optimistic. The engine already discards a warm-up — but
 * the USER has to pick it, and nothing in the tool helps them.
 *
 * This is Welch's moving-average method, the standard approach: smooth the series
 * of case flow times, then find where it stops trending and settles. What comes
 * back is a SUGGESTION. It is never imposed, because a warm-up that is too long
 * silently throws away most of a run, and only the person modelling knows whether
 * the transient is an artefact or the very thing they are studying (a Monday
 * backlog clearing is a transient someone might be measuring on purpose).
 *
 * Pure — no DB, no React, safe for a client component.
 */

export interface WarmUpSuggestion {
  /** Suggested warm-up in clock units, or null when the series never settles or
   *  is too short to judge. Null is a real answer: it means "do not guess". */
  warmUp: number | null;
  /** Why — safe to show verbatim. */
  reason: string;
  /** The smoothed series, for anyone who wants to see the shape. */
  smoothed: number[];
}

/**
 * `samples` are per-case observations in completion order — flow times as the run
 * produced them. `window` is the moving-average half-width; larger smooths more.
 *
 * The rule: walk the smoothed series and find the first point after which it stays
 * within `tolerance` of the long-run mean of the remainder. That point is where
 * the transient has died out.
 */
export function suggestWarmUp(
  samples: number[],
  opts: { window?: number; tolerance?: number; completionTimes?: number[] } = {},
): WarmUpSuggestion {
  const n = samples.length;
  // Below this there is nothing to see: a handful of cases cannot show a trend,
  // and pretending otherwise would produce a confident number from noise.
  if (n < 20) {
    return { warmUp: null, smoothed: [], reason: "Too few completed cases to judge a warm-up. Lengthen the run first." };
  }

  const window = Math.max(1, Math.min(opts.window ?? Math.floor(n / 10), Math.floor(n / 4)));
  const tolerance = opts.tolerance ?? 0.05;

  // Welch's moving average.
  const smoothed: number[] = [];
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - window), hi = Math.min(n - 1, i + window);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += samples[j];
    smoothed.push(sum / (hi - lo + 1));
  }

  // The steady-state level: the mean of the last half, which is the part least
  // affected by the start-up transient.
  const tail = smoothed.slice(Math.floor(n / 2));
  const level = tail.reduce((a, b) => a + b, 0) / tail.length;
  if (level === 0) {
    return { warmUp: null, smoothed, reason: "The flow times are all zero — nothing to warm up from." };
  }

  const band = Math.abs(level) * tolerance;
  let settleIdx = -1;
  for (let i = 0; i < n; i++) {
    // settled = this point and EVERY later point are within the band
    let ok = true;
    for (let j = i; j < n; j++) {
      if (Math.abs(smoothed[j] - level) > band) { ok = false; break; }
    }
    if (ok) { settleIdx = i; break; }
  }

  if (settleIdx <= 0) {
    return {
      warmUp: 0,
      smoothed,
      reason: settleIdx === 0
        ? "The run settles immediately — no warm-up is needed."
        : "The run never settles within tolerance, so no warm-up can be suggested. It may be overloaded, or the horizon may be too short.",
    };
  }

  // Convert the case index to a time, when completion times are available —
  // otherwise report the position as a share of the run and let the caller scale.
  const times = opts.completionTimes;
  if (times && times.length === n) {
    const t = times[settleIdx];
    return {
      warmUp: Math.ceil(t),
      smoothed,
      reason: `Flow times settle after about ${settleIdx} of ${n} cases (around ${Math.ceil(t)} in). Discarding that lead-in keeps the start-up transient out of the statistics.`,
    };
  }

  return {
    warmUp: null,
    smoothed,
    reason: `Flow times settle after about ${settleIdx} of ${n} cases, but the run did not record when each finished, so that cannot be turned into a warm-up time. Re-run to get a figure.`,
  };
}
