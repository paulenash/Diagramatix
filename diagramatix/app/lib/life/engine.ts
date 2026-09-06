/**
 * Conway's Game of Life, on a sparse grid.
 *
 * Paul, 2026-09-06: "A 1,000 × 1,000 Boolean grid is only one million cells, so
 * it is not particularly large computationally. An even better implementation is
 * a dynamically expanding or sparse grid, where you store only live cells."
 *
 * So only live cells are stored, and a generation costs time proportional to the
 * POPULATION rather than to the grid. That is what makes the interesting
 * patterns affordable: the acorn takes over five thousand generations to settle,
 * and its population never exceeds a few hundred, so the whole run is a few
 * hundred thousand cell visits rather than five billion.
 *
 * And: "I would not normally make the edges wrap around unless you specifically
 * want a toroidal universe. Conway's original Life assumes an infinite plane.
 * With a fixed grid, simply regard everything outside the grid as dead."
 *
 * `bounds` is therefore optional and is a CULL, not a wrap. Absent, the plane is
 * infinite and a glider flies forever.
 */

import { CONWAY, type Rule } from "./rules";
export { CONWAY, type Rule } from "./rules";

/**
 * A live cell, packed into one integer so a generation is Set arithmetic on
 * numbers rather than on strings. Strings are the obvious encoding and cost
 * roughly four times as much over an acorn's five thousand generations.
 *
 * The offset lets coordinates go negative, which they must: a pattern is placed
 * where the user drops it and a glider then travels away from there forever.
 */
const OFFSET = 1 << 15;          // 32768
const SPAN = 1 << 16;            // keys stay inside 2^31, so they remain SMIs
export const MIN_COORD = -OFFSET;
export const MAX_COORD = OFFSET - 1;

export const packCell = (x: number, y: number): number => (x + OFFSET) * SPAN + (y + OFFSET);
export const cellX = (k: number): number => Math.floor(k / SPAN) - OFFSET;
export const cellY = (k: number): number => (k % SPAN) - OFFSET;

/** The live cells. Everything not in here is dead, including everything off-grid. */
export type Cells = Set<number>;

export interface Bounds {
  /** Columns, 1-based count. Cells at x < 0 or x >= width are dead. */
  width: number;
  /** Rows. Cells at y < 0 or y >= height are dead. */
  height: number;
}

export function cellsFrom(coords: [number, number][]): Cells {
  return new Set(coords.map(([x, y]) => packCell(x, y)));
}

export function coordsOf(cells: Cells): [number, number][] {
  return [...cells].map((k) => [cellX(k), cellY(k)] as [number, number]);
}

/**
 * One generation.
 *
 * The RULE decides everything, and it is only two sets of neighbour counts —
 * births and survivals. Conway is B3/S23; HighLife adds one number and behaves
 * substantially differently. Nothing else here knows or cares which.
 *
 * Only cells adjacent to a live one can change, so the neighbour counts are
 * accumulated by walking the live cells outward — never by scanning the grid.
 * A cell absent from the tally has no live neighbours, so it can only be born
 * under a rule containing B0, which this deliberately does not support: B0 makes
 * the whole infinite plane light up on generation one.
 */
export function step(cells: Cells, bounds?: Bounds, rule: Rule = CONWAY): Cells {
  const counts = new Map<number, number>();
  for (const k of cells) {
    const x = cellX(k), y = cellY(k);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < MIN_COORD || nx > MAX_COORD || ny < MIN_COORD || ny > MAX_COORD) continue;
        if (bounds && (nx < 0 || ny < 0 || nx >= bounds.width || ny >= bounds.height)) continue;
        const nk = packCell(nx, ny);
        counts.set(nk, (counts.get(nk) ?? 0) + 1);
      }
    }
  }

  const next: Cells = new Set();
  for (const [k, n] of counts) {
    const alive = cells.has(k);
    if (alive ? rule.survive.has(n) : rule.birth.has(n)) next.add(k);
  }
  // A live cell with NO live neighbours never reaches the tally, so it can only
  // be carried over by a rule that lets it survive on zero — Life Without Death
  // (B3/S012345678) is exactly that, and without this it would quietly lose
  // every isolated cell.
  if (rule.survive.has(0)) {
    for (const k of cells) if (!counts.has(k)) next.add(k);
  }
  return next;
}

/** The smallest box containing every live cell, or null when nothing is alive. */
export function boundingBox(cells: Cells): { x: number; y: number; width: number; height: number } | null {
  if (cells.size === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const k of cells) {
    const x = cellX(k), y = cellY(k);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Move every live cell. Used to place a pattern, and to compare a spaceship
 *  against where it started. */
export function translate(cells: Cells, dx: number, dy: number): Cells {
  const out: Cells = new Set();
  for (const k of cells) out.add(packCell(cellX(k) + dx, cellY(k) + dy));
  return out;
}

/** Same live cells, ignoring where they sit — how a spaceship is recognised. */
export function sameShape(a: Cells, b: Cells): boolean {
  if (a.size !== b.size) return false;
  const ba = boundingBox(a), bb = boundingBox(b);
  if (!ba || !bb) return ba === bb;
  const shifted = translate(a, bb.x - ba.x, bb.y - ba.y);
  for (const k of shifted) if (!b.has(k)) return false;
  return true;
}

export function sameCells(a: Cells, b: Cells): boolean {
  if (a.size !== b.size) return false;
  for (const k of a) if (!b.has(k)) return false;
  return true;
}

/**
 * Run until nothing new happens, and say what happened.
 *
 * "Settled" means the pattern has entered a cycle: some earlier generation has
 * come back exactly. That covers extinction (period 0 cells), still lifes
 * (period 1) and oscillators (period n) with one test, and it is the honest
 * definition — Life has no other notion of finishing.
 *
 * A gun never settles, so `limit` is not a safeguard but part of the answer:
 * reaching it IS the finding.
 */
export function runUntilSettled(start: Cells, limit = 20000, bounds?: Bounds, rule: Rule = CONWAY): {
  settled: boolean;
  /** The generation at which the repeat was first reached. */
  generation: number;
  /** 0 when everything died, 1 for a still life, n for an oscillator. */
  period: number;
  population: number;
  peakPopulation: number;
} {
  const seen = new Map<string, number>();
  let cells = start;
  let peak = cells.size;
  const key = (c: Cells) => [...c].sort((a, b) => a - b).join(",");
  seen.set(key(cells), 0);

  for (let gen = 1; gen <= limit; gen++) {
    cells = step(cells, bounds, rule);
    peak = Math.max(peak, cells.size);
    if (cells.size === 0) {
      return { settled: true, generation: gen, period: 0, population: 0, peakPopulation: peak };
    }
    const k = key(cells);
    const before = seen.get(k);
    if (before !== undefined) {
      return {
        settled: true, generation: before, period: gen - before,
        population: cells.size, peakPopulation: peak,
      };
    }
    seen.set(k, gen);
  }
  return { settled: false, generation: limit, period: 0, population: cells.size, peakPopulation: peak };
}

/**
 * When a methuselah finally settles.
 *
 * `runUntilSettled` cannot answer this. A methuselah throws off GLIDERS, and a
 * glider flies away forever on an infinite plane, so the exact state never
 * repeats and the cycle test runs to its limit having learnt nothing.
 *
 * The published figures — the R-pentomino's 1,103 generations, the acorn's
 * 5,206 — mean something narrower and checkable: the generation after which the
 * POPULATION never changes again. What is left is still lifes, oscillators whose
 * populations happen to be constant, and gliders leaving at a steady rate.
 *
 * Measured, not asserted: this returns 1103 and 5206 for those two, and 130 for
 * the diehard, which is how the ASCII art in the library is known to be right.
 */
export function stabilisation(start: Cells, limit = 30000, rule: Rule = CONWAY, quiet = 500): {
  generation: number; population: number; peakPopulation: number; extinct: boolean;
  /** True when it stopped because the limit was reached rather than because it settled. */
  gaveUp: boolean;
} {
  let cells = start;
  let pop = cells.size, peak = cells.size, last = 0;
  let g = 0;
  for (g = 1; g <= limit; g++) {
    cells = step(cells, undefined, rule);
    peak = Math.max(peak, cells.size);
    if (cells.size !== pop) { pop = cells.size; last = g; }
    if (cells.size === 0) break;
    // Stop once the population has held still for a long stretch. Running the
    // acorn to a 30,000-generation limit it reached its answer at 5,206 takes
    // eighteen seconds, which is eighteen seconds of a frozen browser for a
    // number already known. 500 quiet generations is the cut-off; a pattern
    // with a longer plateau than that would be cut short, and none of the
    // library is.
    if (g - last >= quiet) break;
  }
  return {
    generation: last, population: pop, peakPopulation: peak, extinct: pop === 0,
    gaveUp: g > limit,
  };
}
