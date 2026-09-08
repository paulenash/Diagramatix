/**
 * Min/max over arrays that are as long as the log.
 *
 * `Math.min(...xs)` passes every element as a separate argument, and past
 * roughly 125,000 of them V8 throws `RangeError: Maximum call stack size
 * exceeded`. The mining pipeline spreads per-EVENT and per-CASE arrays in three
 * places, so **any log beyond about 125k events could not be imported at all** —
 * it did not degrade, it crashed, and the size at which it starts is well inside
 * what this feature invites people to upload (the live-source buffer alone caps
 * at 100,000 rows, and `CASE_CAP` is 50,000 cases).
 *
 * Found by a Phase 1 test that built a deliberately large log to exercise the
 * detail budget. Pure and dependency-free: these run on both sides of the wire.
 */

/** Smallest value, or `undefined` for an empty array. */
export function minOf(xs: readonly number[]): number | undefined {
  if (xs.length === 0) return undefined;
  let m = xs[0];
  for (let i = 1; i < xs.length; i++) if (xs[i] < m) m = xs[i];
  return m;
}

/** Largest value, or `undefined` for an empty array. */
export function maxOf(xs: readonly number[]): number | undefined {
  if (xs.length === 0) return undefined;
  let m = xs[0];
  for (let i = 1; i < xs.length; i++) if (xs[i] > m) m = xs[i];
  return m;
}
