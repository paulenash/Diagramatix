"use client";

/**
 * The Nimb oracle for a board size — solved outright when that is instant, and
 * in timed slices when it is not.
 *
 * The split is a measurement, not a preference. 4 × 4 is 65,536 positions and
 * the recursive solver answers in well under a frame, so it runs inline and the
 * UI never shows a loading state at all. 5 × 5 is 33.5 MILLION positions and
 * about three seconds; that runs through `startSolve` a slice at a time, with
 * each slice sized to fit inside a frame, so the page keeps responding and can
 * show how far along it is.
 *
 * Consumers get one thing — an `Oracle` — and never learn which path produced
 * it. That is the point of the interface: adding 5 × 5 changed how the answers
 * are computed without changing a single call site that asks for one.
 *
 * A solved table is kept in a module-level cache, so flipping 5 → 3 → 5 pays the
 * three seconds once per page load rather than once per visit to the size.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { type Oracle, memoOracle, tableOracle, solvable, startSolve } from "./nimb";

/** At or below this, solving inline is imperceptible — no slicing, no spinner. */
export const INLINE_SOLVE_N = 4;

/** How long one slice may hold the main thread. Comfortably inside a 60fps
 *  frame, so scrolling and clicking stay smooth while the sweep runs. */
const SLICE_MS = 10;
/** Where the adaptive slice size starts before the first timing lands. */
const FIRST_SLICE = 50_000;

const tables = new Map<number, Uint8Array>();

export interface OracleState {
  /** Null while a big board is still solving, or when n is beyond solving. */
  oracle: Oracle | null;
  solving: boolean;
  /** 0–1, only meaningful while `solving`. */
  progress: number;
}

export function useNimbOracle(n: number, active: boolean): OracleState {
  const [table, setTable] = useState<Uint8Array | null>(() => tables.get(n) ?? null);
  const [progress, setProgress] = useState(0);
  const cancelled = useRef(false);

  const inline = active && solvable(n) && n <= INLINE_SOLVE_N;
  const sliced = active && solvable(n) && n > INLINE_SOLVE_N;

  useEffect(() => {
    // Drop any table for a size no longer on screen: it is the wrong shape for
    // this board, and holding it while the next one is built would put two
    // multi-megabyte arrays on the heap at once.
    setTable(tables.get(n) ?? null);
    setProgress(0);
    if (!sliced || tables.has(n)) return;

    cancelled.current = false;
    const job = startSolve(n);
    let budget = FIRST_SLICE;
    let timer = 0;

    const pump = () => {
      if (cancelled.current) return;
      const t0 = performance.now();
      const finished = job.step(budget);
      const spent = performance.now() - t0;
      // Aim the next slice at SLICE_MS. Clamped so one slow frame (a background
      // tab, a GC pause) cannot collapse the budget to a crawl or overshoot into
      // a visible stall.
      const scale = spent > 0 ? SLICE_MS / spent : 2;
      budget = Math.max(10_000, Math.min(budget * Math.max(0.25, Math.min(4, scale)), 4_000_000)) | 0;

      if (finished) {
        tables.set(n, job.table);
        setTable(job.table);
        setProgress(1);
        return;
      }
      setProgress(job.done / job.total);
      timer = window.setTimeout(pump, 0);
    };

    timer = window.setTimeout(pump, 0);
    return () => { cancelled.current = true; window.clearTimeout(timer); };
  }, [n, sliced]);

  // One memo per size, so the recursive solver's cache survives every move
  // rather than being thrown away and rebuilt on each render.
  const memo = useMemo(() => (inline ? memoOracle(n) : null), [inline, n]);

  return useMemo(() => {
    if (inline && memo) return { oracle: memo, solving: false, progress: 1 };
    if (table) return { oracle: tableOracle(table), solving: false, progress: 1 };
    return { oracle: null, solving: sliced, progress };
  }, [inline, memo, table, sliced, progress]);
}
