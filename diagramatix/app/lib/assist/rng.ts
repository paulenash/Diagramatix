/**
 * A seeded random number generator, so a generated corpus is the same corpus
 * every time.
 *
 * Reproducibility is the whole point: a case that fails must be reachable again
 * by anyone, from the seed alone, without a fixture file. `Math.random()` would
 * make every red result unrepeatable and therefore unfixable.
 *
 * No new dependency. Hashing a string into a number is already house idiom —
 * `goldFlash.sparksFor` does the same thing for the same reason ("deterministic
 * in the item's id … keeps this testable without stubbing a random source").
 *
 * mulberry32 is a small, fast, well-distributed 32-bit PRNG. It is not
 * cryptographic and must never be used where that matters.
 */

export interface Rng {
  /** [0, 1) */
  next(): number;
}

/** FNV-1a over a string → a 32-bit seed. Same text, same corpus, forever. */
export function seedFrom(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function makeRng(seed: string | number): Rng {
  let a = (typeof seed === "string" ? seedFrom(seed) : seed >>> 0) || 1;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** An integer in [lo, hi], inclusive. */
export function int(rng: Rng, lo: number, hi: number): number {
  if (hi <= lo) return lo;
  return lo + Math.floor(rng.next() * (hi - lo + 1));
}

/** One of them. Throws on an empty list rather than returning undefined. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick from an empty list");
  return items[int(rng, 0, items.length - 1)];
}

/** A shuffled copy. Fisher–Yates, driven by the same seeded stream. */
export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = int(rng, 0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The corpus everything is measured against unless a caller says otherwise. */
// Bumped when the generator's sentences change materially (2026-09-25: realistic
// BPMN naming; 2026-09-26: the compress and expand LANE families, more compress
// phrasings and the "Pool 3" pool, which reshuffle every case). A run against a
// different seed is a different exam, and the recorded clips carry their own
// seed, so the two corpora cannot be confused: case #35 of the old seed stays
// the #35 recorded on prod, and a retake never pairs a new sentence with it.
export const DEFAULT_CORPUS_SEED = "dgx-voice-2026-09-26-realistic";
