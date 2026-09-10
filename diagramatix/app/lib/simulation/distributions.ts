/**
 * Sampling + analytic mean for the supported distributions.
 *
 * BPSim-aligned throughout (fixed→constant, uniform→Uniform,
 * triangular→Triangular, normal→TruncatedNormal,
 * exponential→NegativeExponential, lognormal→LogNormal, empirical→User).
 * `SimDist` is the single mapping point, so each addition is purely additive
 * here and in bpsim/*.
 *
 * WHY LOGNORMAL AND EMPIRICAL EXIST, since the other five ran for a year
 * without them. Real service times are right-skewed — most cases cluster and a
 * few run far past the median — and neither of the two shapes a modeller
 * previously had can produce that. A truncated normal is symmetric; a
 * triangular puts a hard ceiling on the longest case. Both therefore understate
 * precisely the cases that make a queue form, which is the thing a simulation
 * is being run to find out.
 *
 * Empirical goes further and assumes nothing: it resamples the observed values.
 * Where the data exists — a mined log — laying a curve over it is a claim the
 * evidence does not make.
 *
 * NOT ADDED, and recorded so the question is not reopened from scratch: gamma /
 * Erlang (multi-phase service, well approximated by lognormal for BPM work) and
 * Weibull (a reliability distribution — time to failure, not time to do a job).
 */

import type { SimDist } from "./types";
import type { Rng } from "./rng";

/** Draw a sample from `dist` using `rng`. Time samples are clamped ≥ 0. */
export function sample(dist: SimDist, rng: Rng): number {
  switch (dist.kind) {
    case "fixed":
      return dist.value;
    case "uniform":
      return dist.min + (dist.max - dist.min) * rng.next();
    case "triangular": {
      const { min, mode, max } = dist;
      if (max <= min) return min;
      const u = rng.next();
      const fc = (mode - min) / (max - min);
      return u < fc
        ? min + Math.sqrt(u * (max - min) * (mode - min))
        : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
    }
    case "normal": {
      // Box–Muller, truncated at 0 (resample a few times, then clamp).
      for (let i = 0; i < 8; i++) {
        const u1 = Math.max(rng.next(), 1e-12);
        const u2 = rng.next();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const v = dist.mean + dist.sd * z;
        if (v >= 0) return v;
      }
      return 0;
    }
    case "exponential": {
      const u = Math.max(rng.next(), 1e-12);
      return -dist.mean * Math.log(1 - u);
    }
    case "lognormal": {
      // Parameterised by the mean and sd OF THE DISTRIBUTION, because that is
      // what a modeller measured. Convert to the underlying normal's
      // parameters: sigma² = ln(1 + (sd/mean)²), mu = ln(mean) − sigma²/2.
      const { mean, sd } = dist;
      if (!(mean > 0)) return 0;
      if (!(sd > 0)) return mean;
      const cv2 = (sd / mean) * (sd / mean);
      const sigma = Math.sqrt(Math.log(1 + cv2));
      const mu = Math.log(mean) - (sigma * sigma) / 2;
      const u1 = Math.max(rng.next(), 1e-12);
      const u2 = rng.next();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return Math.exp(mu + sigma * z);
    }
    case "empirical": {
      // Bootstrap: draw one of the observed values. With a quantile sketch (the
      // shape `empiricalFrom` produces) a uniform draw over the stored points
      // reproduces the observed distribution, tail included.
      const xs = dist.samples;
      if (xs.length === 0) return 0;
      const i = Math.min(xs.length - 1, Math.floor(rng.next() * xs.length));
      return Math.max(0, xs[i]);
    }
  }
}

/**
 * How many points an empirical distribution keeps.
 *
 * A mined activity can have fifty thousand sojourn samples and they would be
 * serialised into the diagram, carried in every export, and re-read on every
 * open. Sixty-four order statistics describe the shape — including the tail,
 * which is the whole reason for using it — at a cost nobody notices.
 */
export const EMPIRICAL_POINTS = 64;

/**
 * Build an empirical distribution from observed values.
 *
 * TRIMMING, AND WHY IT IS A FENCE RATHER THAN A PERCENTAGE. One case that sat
 * over a long weekend is not evidence about how long the work takes, and left
 * in, it sets the tail for every future run. But a fixed percentage trim is
 * useless exactly when it is needed most: 2% of eight samples is zero, and
 * eight samples is precisely where one bad value does the most damage.
 *
 * So the rule is the standard far-outlier fence — beyond Q3 + 3xIQR — with a
 * cap on how many points it may remove (5%, at least one). The cap is the
 * important half: if a tenth of the observations sit past the fence, they are
 * not outliers, they are the distribution, and dropping them would be throwing
 * away the tail this whole distribution kind exists to reproduce.
 *
 * Only the upper tail is fenced. A case that finished unusually fast is a case,
 * not a data error.
 *
 * QUANTILES, NOT A RANDOM SUBSET. Taking evenly spaced sorted values keeps the
 * shape exactly; taking 64 at random would keep it only on average, and the
 * error would land in the tail.
 */
export function empiricalFrom(values: number[]): SimDist {
  const clean = values.filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  if (clean.length === 0) return { kind: "fixed", value: 0 };

  let kept = clean;
  if (clean.length >= 4) {
    const q = (f: number) => clean[Math.min(clean.length - 1, Math.max(0, Math.round(f * (clean.length - 1))))];
    const iqr = q(0.75) - q(0.25);
    const fence = q(0.75) + 3 * iqr;
    const maxDrop = Math.max(1, Math.floor(clean.length * 0.05));
    let drop = 0;
    while (drop < maxDrop && clean[clean.length - 1 - drop] > fence) drop++;
    if (drop > 0 && clean.length - drop >= 3) kept = clean.slice(0, clean.length - drop);
  }

  if (kept.length <= EMPIRICAL_POINTS) return { kind: "empirical", samples: kept };
  const out: number[] = [];
  for (let i = 0; i < EMPIRICAL_POINTS; i++) {
    out.push(kept[Math.min(kept.length - 1, Math.round((i * (kept.length - 1)) / (EMPIRICAL_POINTS - 1)))]);
  }
  return { kind: "empirical", samples: out };
}

/** Analytic mean — used by validation + analytic test oracles. (Normal ignores
 *  the 0-truncation, fine for mean ≫ sd.) */
export function meanOf(dist: SimDist): number {
  switch (dist.kind) {
    case "fixed":       return dist.value;
    case "uniform":     return (dist.min + dist.max) / 2;
    case "triangular":  return (dist.min + dist.mode + dist.max) / 3;
    case "normal":      return dist.mean;
    case "exponential": return dist.mean;
    case "lognormal":   return dist.mean;
    case "empirical":   return dist.samples.length === 0 ? 0
      : dist.samples.reduce((a, b) => a + b, 0) / dist.samples.length;
  }
}
