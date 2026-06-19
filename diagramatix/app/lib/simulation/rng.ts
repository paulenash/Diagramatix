/**
 * Seeded pseudo-random generator with a SERIALISABLE cursor.
 *
 * The whole simulator hinges on reproducibility: Monte-Carlo replications must
 * be repeatable, and the live Operator "fork the timeline" feature must be able
 * to snapshot mid-run and resume identically. mulberry32 is a tiny, fast PRNG
 * whose entire state is a single uint32 — trivially serialisable into SimState.
 */

export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Current cursor — serialise this into a snapshot. */
  snapshot(): number;
  /** Restore a previously snapshotted cursor. */
  restore(cursor: number): void;
}

/** mulberry32 — state is one uint32. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    snapshot() {
      return a >>> 0;
    },
    restore(cursor: number) {
      a = cursor >>> 0;
    },
  };
}

/** Derive an independent stream seed for replication `r` from a master seed.
 *  A splitmix32-style mix so adjacent replications don't share structure. */
export function deriveSeed(masterSeed: number, replication: number): number {
  let z = (masterSeed + Math.imul(replication + 1, 0x9e3779b1)) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
  return (z ^ (z >>> 15)) >>> 0;
}
