/**
 * Sampling + analytic mean for the supported distributions.
 *
 * The five kinds are a BPSim-aligned subset (fixed→constant, uniform→Uniform,
 * triangular→Triangular, normal→TruncatedNormal, exponential→NegativeExponential).
 * `SimDist` is the single mapping point, so adding more BPSim distributions
 * later is purely additive here + in bpsim/*.
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
  }
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
  }
}
