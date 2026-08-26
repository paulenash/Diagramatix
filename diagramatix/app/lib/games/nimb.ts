/**
 * n × n Nimb — a two-player misère placement game, and a solver for it.
 *
 * RULES
 *  1. An n × n grid of empty squares.
 *  2. A turn places 1..n x's — up to a WHOLE LINE — in a single row OR a
 *     single column. The squares must be CONSECUTIVE and all currently empty.
 *  3. No passing.
 *  4. **Misère: whoever places the last x LOSES.**
 *
 * Rule 4 is what makes it interesting. Under normal play (last move wins) a
 * placement game like this usually collapses to a parity argument; misère play
 * inverts the endgame, so the winner is often the player who can force the
 * board full on the opponent's turn rather than the one who fills it fastest.
 *
 * REPRESENTATION. The board is a bitmask: bit `r * n + c` set = that square is
 * filled. For n ≤ 5 that is at most 25 bits, well inside a JS number's exact
 * integer range, so a position is a primitive and a memo is a plain Map.
 *
 * Pure and dependency-free: no React, no DB, so the whole game is unit-testable
 * and the solver can be reasoned about on its own.
 *
 * WHY THERE IS NO misère/normal SWITCH. Flipping the terminal value is a
 * one-line change, so it was measured rather than argued about, and at these
 * board sizes it changes nothing anyone would see:
 *
 *      n     misère (last ✕ loses)        normal (last ✕ wins)
 *      2     P1 loses, 0/2 first moves    P1 loses, 0/2
 *      3     P1 WINS,  3/7 first moves    P1 WINS,  3/7  — the SAME three
 *      4     P1 loses, 0/11 first moves   P1 loses, 0/11
 *
 * Not because the rules coincide: 59 of the 251 reachable 3×3 positions have
 * OPPOSITE values under the two rules, and 6 of 15 on 2×2. The trees differ
 * throughout and agree at the root. (1×1 does differ, as it must — one square,
 * one move — which is the check that this is a real result and not a bug.)
 */

/** A board position: bit `r * n + c` is 1 when that square holds an x. */
export type Board = number;

/** A move: the squares it fills, as a bitmask, plus enough to describe it. */
export interface Move {
  /** Bitmask of the squares this move fills. */
  mask: Board;
  /** Row-major indices of the squares filled, in order. */
  cells: number[];
  orientation: "row" | "col";
  /** Row (for a row move) or column (for a column move) the run sits in. */
  line: number;
  /** Index of the first square along that line. */
  start: number;
  length: number;
}

/**
 * The longest run a turn may place: the WHOLE LINE, so an n × n board allows
 * 1..n (Paul, 2026-08-26 — "scale to 1-n").
 *
 * This changes nothing below 5 × 5: `legalMoves` always bounded the run by the
 * board as well, so on a 4 × 4 the old fixed cap of 4 and the board's own width
 * were the same number. The first size where the two readings diverge is 5 × 5,
 * where a full row of five is now legal — and that genuinely alters the game
 * there, so its outcome had to be recomputed rather than carried over.
 */
export const maxRun = (n: number): number => n;
/** Above this the exact solver is refused rather than left to hang — see
 *  `solvable()`. 5×5 = 25 bits = 33.5M positions and ~3s to solve — done once in
 *  a worker, then every query is a lookup. 6×6 would be 68.7 BILLION (68 GB), so
 *  the line is drawn here rather than left to exhaust the tab. */
export const MAX_SOLVE_N = 5;

export const idx = (n: number, r: number, c: number): number => r * n + c;
export const isFilled = (b: Board, i: number): boolean => (b & (1 << i)) !== 0;
export const fullBoard = (n: number): Board => (n * n >= 31 ? -1 : (1 << (n * n)) - 1);
export const isFull = (b: Board, n: number): boolean => b === fullBoard(n);

/**
 * Every legal move from `b`.
 *
 * A run of length L in a line is legal when all L squares are empty. Runs are
 * generated per row and per column; a run of length 1 would be produced twice
 * (once as a row, once as a column), so single squares are emitted as ROW moves
 * only. They are the same move — one square — and counting it twice would
 * double the branching factor for no gain.
 */
export function legalMoves(b: Board, n: number): Move[] {
  const out: Move[] = [];
  const maxLen = maxRun(n);
  for (let len = 1; len <= maxLen; len++) {
    // Rows
    for (let r = 0; r < n; r++) {
      for (let start = 0; start + len <= n; start++) {
        let mask = 0;
        let ok = true;
        const cells: number[] = [];
        for (let k = 0; k < len && ok; k++) {
          const i = idx(n, r, start + k);
          if (isFilled(b, i)) ok = false;
          else { mask |= 1 << i; cells.push(i); }
        }
        if (ok) out.push({ mask, cells, orientation: "row", line: r, start, length: len });
      }
    }
    // Columns — length 1 already covered above as a row move.
    if (len === 1) continue;
    for (let c = 0; c < n; c++) {
      for (let start = 0; start + len <= n; start++) {
        let mask = 0;
        let ok = true;
        const cells: number[] = [];
        for (let k = 0; k < len && ok; k++) {
          const i = idx(n, start + k, c);
          if (isFilled(b, i)) ok = false;
          else { mask |= 1 << i; cells.push(i); }
        }
        if (ok) out.push({ mask, cells, orientation: "col", line: c, start, length: len });
      }
    }
  }
  return out;
}

/** Is a specific set of squares a legal move? Used to validate a UI selection. */
export function isLegalSelection(b: Board, n: number, cells: number[]): boolean {
  if (cells.length < 1 || cells.length > maxRun(n)) return false;
  if (cells.some((i) => i < 0 || i >= n * n || isFilled(b, i))) return false;
  if (new Set(cells).size !== cells.length) return false;
  const sorted = [...cells].sort((a, z) => a - z);
  const rows = new Set(sorted.map((i) => Math.floor(i / n)));
  const cols = new Set(sorted.map((i) => i % n));
  if (rows.size === 1) {
    // consecutive columns
    return sorted.every((i, k) => k === 0 || i === sorted[k - 1] + 1);
  }
  if (cols.size === 1) {
    // consecutive rows
    return sorted.every((i, k) => k === 0 || i === sorted[k - 1] + n);
  }
  return false;
}

export const applyMove = (b: Board, m: Move): Board => b | m.mask;

/**
 * Does the player TO MOVE win with perfect play?
 *
 * Misère: the player who places the last x loses. So a position with no moves
 * left — a full board — is a WIN for the player to move, because the opponent
 * just placed the last x. Everything else follows from that one inversion:
 * a position is winning iff some move leaves the opponent in a losing one.
 *
 * `memo` is caller-supplied so a UI can keep it across turns; positions are
 * reached over and over through different move orders.
 */
export function winning(b: Board, n: number, memo = new Map<Board, boolean>()): boolean {
  if (isFull(b, n)) return true; // opponent placed the last x — they lost
  const hit = memo.get(b);
  if (hit !== undefined) return hit;
  let win = false;
  for (const m of legalMoves(b, n)) {
    if (!winning(b | m.mask, n, memo)) { win = true; break; }
  }
  memo.set(b, win);
  return win;
}

/** Is an exact solve tractable for this size? Above it, play is heuristic. */
export const solvable = (n: number): boolean => n >= 1 && n <= MAX_SOLVE_N;

// ── The solved table ──────────────────────────────────────────────────────
/**
 * Solve EVERY position of an n × n board in one pass: `table[pos] === 1` when
 * the player to move wins from `pos`.
 *
 * Retrograde, not recursive. A move only ever SETS bits, so `pos | mask` is
 * always numerically greater than `pos` — which means a single descending loop
 * over every mask visits each position's successors before the position itself.
 * No recursion, no stack, no memo map.
 *
 * That difference is what makes 5 × 5 possible at all. The recursive solver with
 * a `Map` memo handles 4 × 4 instantly and dies at 5 × 5: 33.5 million entries.
 * This builds the same answers in a flat `Uint8Array` — 33.6 MB, ~3 seconds —
 * and every later query is an array lookup rather than a search.
 *
 * (The shape-decomposition solver reaches the same verdicts and is far faster
 * once a board FRAGMENTS, but far slower here: an empty 5 × 5 is one 25-square
 * blob with nothing to decompose, and it took 151s against this 3.3s. The two
 * are complementary — measured, not assumed.)
 *
 * WHY IT IS RESUMABLE, rather than one call. 5 × 5 is 33.5 million positions and about three seconds of
 * straight-line work. Three seconds inside a click handler is a frozen tab with
 * no explanation, so the caller runs it a slice at a time and yields between
 * slices, which buys a live progress bar and a page that keeps responding.
 *
 * A Web Worker would be the textbook answer and was built first. Turbopack does
 * not compile `new Worker(new URL("./x.ts", import.meta.url))` — it copies the
 * TypeScript file into `static/media` verbatim, so the browser would fetch raw
 * TS as a script. A `blob:` worker avoids the bundler but needs `blob:` added
 * to `script-src`, which is a real CSP concession for a game tile. Slicing costs
 * neither. (Verified by building, not assumed.)
 *
 * The sweep lives HERE and nowhere else: `buildSolveTable` is a thin wrapper
 * that runs a job to completion, so the tested implementation and the one the UI
 * drives are the same code.
 */
export interface SolveJob {
  /** Advance by at most `positions`; true once the whole board is solved. */
  step(positions: number): boolean;
  /** Positions decided so far, out of `total`. */
  readonly done: number;
  readonly total: number;
  /** Complete only once `step` has returned true. */
  readonly table: Uint8Array;
}

export function startSolve(n: number): SolveJob {
  const N = n * n;
  const size = 1 << N;
  const masks = Int32Array.from(new Set(legalMoves(0, n).map((m) => m.mask)));
  const M = masks.length;
  const table = new Uint8Array(size);
  table[size - 1] = 1; // full board: the opponent placed the last ✕ and lost
  let pos = size - 2;
  return {
    table,
    total: size,
    get done() { return size - 1 - pos; },
    step(positions: number): boolean {
      const stop = Math.max(-1, pos - positions);
      for (; pos > stop; pos--) {
        let win = 0;
        for (let i = 0; i < M; i++) {
          const m = masks[i];
          if ((pos & m) === 0 && table[pos | m] === 0) { win = 1; break; }
        }
        table[pos] = win;
      }
      return pos < 0;
    },
  };
}

/** Solve a whole board in one go — the reference path, and what tests use. */
export function buildSolveTable(n: number, onProgress?: (done: number, total: number) => void): Uint8Array {
  const job = startSolve(n);
  // ~32 reports whatever the size, so progress is meaningful on a 512-position
  // board and on a 33-million one alike.
  const slice = Math.max(1, job.total >> 5);
  let finished = false;
  while (!finished) {
    finished = job.step(slice);
    onProgress?.(job.done, job.total);
  }
  return job.table;
}

/**
 * Who wins from a position — the one question every other analysis asks.
 *
 * Backed either by a solved table (instant, any size we can build) or, with no
 * table, by the recursive solver. Passing this around instead of a bare memo is
 * what let 5 × 5 join without every caller learning how it is solved.
 */
export interface Oracle {
  wins(b: Board): boolean;
}

/** An oracle over a prebuilt table. */
export const tableOracle = (table: Uint8Array): Oracle => ({ wins: (b) => table[b] === 1 });

/** An oracle that solves on demand and remembers — fine up to 4 × 4. */
export function memoOracle(n: number, memo = new Map<Board, boolean>()): Oracle {
  return { wins: (b) => winning(b, n, memo) };
}

/**
 * The best move: one that leaves the opponent losing, if any exists.
 *
 * When every move loses (the position is already lost against perfect play) it
 * returns the move that keeps the game longest — filling the fewest squares —
 * so a losing side still plays on rather than conceding, and a human opponent
 * gets the most chances to err.
 */
export function bestMove(b: Board, n: number, memo = new Map<Board, boolean>()): Move | null {
  const moves = legalMoves(b, n);
  if (moves.length === 0) return null;
  for (const m of moves) if (!winning(b | m.mask, n, memo)) return m;
  return moves.reduce((a, z) => (z.length < a.length ? z : a));
}

/** A move for sizes too large to solve: pick at random, smallest-first biased.
 *  Deliberately weak and labelled as such in the UI — a made-up "strategy"
 *  presented as an opponent would misrepresent what the tile knows. */
export function heuristicMove(b: Board, n: number, rand: () => number = Math.random): Move | null {
  const moves = legalMoves(b, n);
  if (moves.length === 0) return null;
  return moves[Math.floor(rand() * moves.length)];
}

/** Total squares still empty. */
export function emptyCount(b: Board, n: number): number {
  let e = 0;
  for (let i = 0; i < n * n; i++) if (!isFilled(b, i)) e++;
  return e;
}

// ── Symmetry ──────────────────────────────────────────────────────────────
/**
 * The eight symmetries of a square (the dihedral group D4), as index maps:
 * `perm[i]` is where square `i` lands. Cached per n — the maps are small and
 * rebuilding them inside a move loop dominated everything else.
 */
const PERM_CACHE = new Map<number, number[][]>();
export function symmetries(n: number): number[][] {
  const hit = PERM_CACHE.get(n);
  if (hit) return hit;
  const rc = (i: number): [number, number] => [Math.floor(i / n), i % n];
  const maps: ((r: number, c: number) => [number, number])[] = [
    (r, c) => [r, c],                 // identity
    (r, c) => [c, n - 1 - r],         // rotate 90
    (r, c) => [n - 1 - r, n - 1 - c], // rotate 180
    (r, c) => [n - 1 - c, r],         // rotate 270
    (r, c) => [r, n - 1 - c],         // flip horizontal
    (r, c) => [n - 1 - r, c],         // flip vertical
    (r, c) => [c, r],                 // transpose
    (r, c) => [n - 1 - c, n - 1 - r], // anti-transpose
  ];
  const perms = maps.map((f) => Array.from({ length: n * n }, (_, i) => {
    const [r, c] = rc(i);
    const [r2, c2] = f(r, c);
    return r2 * n + c2;
  }));
  PERM_CACHE.set(n, perms);
  return perms;
}

/** Apply one index permutation to a board. */
export function transform(b: Board, perm: number[]): Board {
  let out = 0;
  for (let i = 0; i < perm.length; i++) if (b & (1 << i)) out |= 1 << perm[i];
  return out;
}

/**
 * A board's canonical form: the smallest of its eight rotations/reflections.
 *
 * Two positions with the same canonical form are the SAME GAME — every line of
 * play in one has a mirror in the other, so they share a value. That is what
 * makes it sound to show a player one of them and hide the rest.
 */
export function canonicalBoard(b: Board, n: number): Board {
  let best = b;
  for (const p of symmetries(n)) {
    const t = transform(b, p);
    if (t < best) best = t;
  }
  return best;
}

// ── Decomposition into independent shapes ─────────────────────────────────
/**
 * The empty squares split into orthogonally-connected regions, and each region
 * is an INDEPENDENT GAME.
 *
 * A move is a run of consecutive empty squares in a line, so it can never span
 * two regions separated by filled squares: once the middle row of a 4×4 is
 * taken, the 4×1 above and the 4×2 below cannot interact again. Where a shape
 * sits on the board stops mattering — only its form does.
 *
 * That matters for more than presentation. Solving the MULTISET OF SHAPES is
 * exact and far smaller than solving the raw board: 4×4 has 65,536 board
 * positions but only ~2,800 distinct shape-multisets, and the gap widens as
 * boards grow, because a large board fragments into a handful of small pieces.
 *
 * Note this is NOT Sprague-Grundy. That theory sums independent games by XOR of
 * Grundy values and applies to NORMAL play; misère sums are much nastier and
 * the XOR is simply wrong for them. We do not need it — we solve the multiset
 * directly — but it is the obvious wrong turn here, and it was checked against
 * the flat solver over every 3×3 position and a sample of 4×4 before being
 * relied on.
 */
export interface Shape {
  /** Identical for every rotation and reflection of the same form. */
  key: string;
  /** Canonical cells as [row, col], normalised to the origin — for drawing. */
  cells: [number, number][];
  rows: number;
  cols: number;
  size: number;
  /** "4×1", "2×3" … when the form fills its bounding box; null otherwise. */
  rect: string | null;
  /** Indices of the squares this shape occupies on the CURRENT board. */
  boardCells: number[];
}

/** Canonical form of a set of [row, col] cells: normalised to the origin and
 *  reduced over the 8 symmetries, so one key stands for every placement. */
export function canonicalShape(cells: [number, number][]): { key: string; cells: [number, number][] } {
  let bestKey: string | null = null;
  let bestCells: [number, number][] = cells;
  for (let v = 0; v < 8; v++) {
    const t = cells.map(([r, c]) => {
      let a = r, b = c;
      if (v & 4) { const tmp = a; a = b; b = tmp; } // transpose
      if (v & 1) a = -a;
      if (v & 2) b = -b;
      return [a, b] as [number, number];
    });
    const minR = Math.min(...t.map((p) => p[0]));
    const minC = Math.min(...t.map((p) => p[1]));
    const norm = t
      .map(([a, b]) => [a - minR, b - minC] as [number, number])
      .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const key = norm.map(([a, b]) => `${a},${b}`).join(" ");
    if (bestKey === null || key < bestKey) { bestKey = key; bestCells = norm; }
  }
  return { key: bestKey!, cells: bestCells };
}

/** The independent shapes of empty squares in this position. */
export function shapesOf(b: Board, n: number): Shape[] {
  const empty = new Set<number>();
  for (let i = 0; i < n * n; i++) if (!isFilled(b, i)) empty.add(i);
  const out: Shape[] = [];
  while (empty.size) {
    const start = empty.values().next().value as number;
    empty.delete(start);
    const region: number[] = [];
    const stack = [start];
    while (stack.length) {
      const i = stack.pop()!;
      region.push(i);
      const r = Math.floor(i / n), c = i % n;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
        const j = nr * n + nc;
        if (empty.has(j)) { empty.delete(j); stack.push(j); }
      }
    }
    const { key, cells } = canonicalShape(region.map((i) => [Math.floor(i / n), i % n] as [number, number]));
    const rows = Math.max(...cells.map((p) => p[0])) + 1;
    const cols = Math.max(...cells.map((p) => p[1])) + 1;
    out.push({
      key, cells, rows, cols,
      size: region.length,
      // Read the long side first, so a 1×4 and a 4×1 are both "4×1".
      rect: rows * cols === region.length ? `${Math.max(rows, cols)}×${Math.min(rows, cols)}` : null,
      boardCells: region.sort((a, z) => a - z),
    });
  }
  // Largest first — the big shapes are where the decisions are.
  return out.sort((a, z) => z.size - a.size || a.key.localeCompare(z.key));
}

/** Shapes grouped by form: "two 4×1s and one 2×2" rather than three entries. */
export function groupedShapes(b: Board, n: number): { shape: Shape; count: number }[] {
  const by = new Map<string, { shape: Shape; count: number }>();
  for (const s of shapesOf(b, n)) {
    const hit = by.get(s.key);
    if (hit) hit.count++;
    else by.set(s.key, { shape: s, count: 1 });
  }
  return [...by.values()].sort((a, z) => z.shape.size - a.shape.size);
}

/** A human name for a shape: "4×1", "2×2", or "L-shape (5 squares)". */
export function shapeName(s: Shape): string {
  if (s.size === 1) return "single square";
  return s.rect ?? `${s.size}-square piece`;
}

// ── Solving a shape on its own ────────────────────────────────────────────
/** The runs available inside a set of cells (a shape), up to `cap` long. */
function runsInCells(cells: [number, number][], cap: number): [number, number][][] {
  const has = new Set(cells.map(([r, c]) => `${r},${c}`));
  const out: [number, number][][] = [];
  for (const [r, c] of cells) {
    for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
      const run: [number, number][] = [];
      for (let k = 0; k < cap; k++) {
        const rr = r + dr * k, cc = c + dc * k;
        if (!has.has(`${rr},${cc}`)) break;
        run.push([rr, cc]);
        // A single cell is the same move either way round — emit it once.
        if (run.length === 1 && dr === 1) continue;
        out.push([...run]);
      }
    }
  }
  return out;
}

/** Split a set of cells into orthogonally-connected pieces. */
function splitCells(cells: [number, number][]): [number, number][][] {
  const set = new Set(cells.map(([r, c]) => `${r},${c}`));
  const out: [number, number][][] = [];
  while (set.size) {
    const first = set.values().next().value as string;
    set.delete(first);
    const piece: [number, number][] = [];
    const stack = [first];
    while (stack.length) {
      const key = stack.pop()!;
      const [r, c] = key.split(",").map(Number);
      piece.push([r, c]);
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const k = `${r + dr},${c + dc}`;
        if (set.has(k)) { set.delete(k); stack.push(k); }
      }
    }
    out.push(piece);
  }
  return out;
}

/**
 * Misère outcome of a MULTISET of shapes: does the player to move win?
 *
 * This is the decomposed solver. Because no move can span two shapes, a
 * position is fully described by which shapes remain — and solving that is far
 * smaller than solving the raw board (4×4: ~2,800 multisets against 65,536
 * positions), which is what makes larger boards approachable at all.
 *
 * Emphatically NOT Sprague-Grundy: that sums independent games by XOR of Grundy
 * values and holds for NORMAL play. Misère sums are far nastier and the XOR is
 * simply wrong for them. Nothing here uses it — the multiset is solved directly,
 * and the result was checked against the flat solver over every 3×3 position.
 */
export function outcomeOfShapes(keys: string[], cap: number, memo = new Map<string, boolean>()): boolean {
  if (keys.length === 0) return true; // nothing to do — the opponent placed the last ✕
  const id = [...keys].sort().join("|");
  const hit = memo.get(id);
  if (hit !== undefined) return hit;
  let win = false;
  outer:
  for (let i = 0; i < keys.length && !win; i++) {
    const cells = keys[i].split(" ").map((p) => p.split(",").map(Number) as [number, number]);
    for (const run of runsInCells(cells, cap)) {
      const gone = new Set(run.map(([r, c]) => `${r},${c}`));
      const rest = cells.filter(([r, c]) => !gone.has(`${r},${c}`));
      const pieces = splitCells(rest).map((p) => canonicalShape(p).key);
      const next = [...keys.slice(0, i), ...keys.slice(i + 1), ...pieces];
      if (!outcomeOfShapes(next, cap, memo)) { win = true; break outer; }
    }
  }
  memo.set(id, win);
  return win;
}

/** Facing this shape ALONE, does the player to move win? */
export function shapeWins(key: string, cap: number, memo = new Map<string, boolean>()): boolean {
  return outcomeOfShapes([key], cap, memo);
}

/**
 * Every shape that can actually arise on an n × n board, with its solo verdict.
 *
 * Reachability matters: not every polyomino of a given size can appear as a
 * leftover region — it has to be what remains after some sequence of legal
 * moves. Enumerating free polyominoes instead would list shapes this game never
 * produces (and at 16 squares there are 13,079,255 of them, so the distinction
 * is the difference between a usable catalogue and none).
 *
 * Translations, rotations and reflections are all collapsed by `canonicalShape`,
 * so each entry stands for every way that form can sit on the board.
 */
export function possibleShapes(n: number): { shape: Shape; wins: boolean }[] {
  // Reachable positions, breadth-first from the empty board.
  const seen = new Set<Board>([0]);
  const queue: Board[] = [0];
  const byKey = new Map<string, Shape>();
  while (queue.length) {
    const b = queue.shift()!;
    for (const s of shapesOf(b, n)) if (!byKey.has(s.key)) byKey.set(s.key, s);
    for (const m of legalMoves(b, n)) {
      const next = b | m.mask;
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  const memo = new Map<string, boolean>();
  return [...byKey.values()]
    .map((shape) => ({ shape, wins: shapeWins(shape.key, maxRun(n), memo) }))
    .sort((a, z) => a.shape.size - z.shape.size || a.shape.key.localeCompare(z.shape.key));
}

// ── Move classes: the same idea, wherever it is played ────────────────────
/**
 * A CLASS of moves — one idea, such as "take an end square of the 4×1" — with
 * every concrete board move that expresses it.
 *
 * Why a class is safe to speak about as a unit: two moves related by a symmetry
 * OF THEIR OWN SHAPE leave the same multiset of shapes behind. That symmetry
 * need not extend to the whole board — the other shapes may be arranged quite
 * differently — but it does not have to, because the shapes are independent
 * games and the value of the position depends only on which shapes remain. So
 * every move in a class has the same value, and advice given about the class is
 * true of all of it. `T2881` pins exactly this.
 */
export interface MoveClass {
  /** Canonical key for (shape, move-within-shape) — the class identity. */
  key: string;
  /** The shape this is played in. */
  shape: Shape;
  length: number;
  /** The run's cells in the SHAPE's canonical frame, for drawing. */
  cellsInShape: [number, number][];
  wins: boolean;
  /** How many concrete board moves belong to this class. */
  count: number;
  /** One concrete move, so the class can actually be played. */
  example: Move;
  /** Every concrete move in this class, as board masks. The UI highlights them
   *  all — "anywhere in the 4x1" should be able to SHOW the anywhere — and the
   *  safety test asserts they all share the class verdict. */
  memberMasks: Board[];
  /** Plain English for where in the shape, when the shape is simple enough to
   *  describe honestly ("either end", "the middle"); null when a picture is the
   *  only truthful description. */
  where: string | null;
}

/** Canonical key for a run inside a shape, quotiented by the shape's own
 *  symmetry — so "an end square" is one key however the shape is turned. */
function classKey(shapeCells: [number, number][], runCells: [number, number][]): {
  key: string; shape: [number, number][]; run: [number, number][];
} {
  let best: { key: string; shape: [number, number][]; run: [number, number][] } | null = null;
  for (let v = 0; v < 8; v++) {
    const tf = ([r, c]: [number, number]): [number, number] => {
      let a = r, b = c;
      if (v & 4) { const t = a; a = b; b = t; }
      if (v & 1) a = -a;
      if (v & 2) b = -b;
      return [a, b];
    };
    const ts = shapeCells.map(tf);
    const minR = Math.min(...ts.map((p) => p[0]));
    const minC = Math.min(...ts.map((p) => p[1]));
    const norm = (p: [number, number]): [number, number] => [p[0] - minR, p[1] - minC];
    const shape = ts.map(norm).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const run = runCells.map(tf).map(norm).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const key = shape.map((p) => p.join(",")).join(" ") + "|" + run.map((p) => p.join(",")).join(" ");
    if (best === null || key < best.key) best = { key, shape, run };
  }
  return best!;
}

/**
 * English for where a run sits, but ONLY where it can be said truthfully.
 *
 * Restricted to two shapes where the words mean something exact: a straight
 * strip (1×k), and a full ODD square, whose centre line can be named. For an L,
 * a T or any ragged remnant there is no honest short phrase, and inventing one
 * ("near the corner") would be worse than the picture the UI draws anyway — so
 * it returns null and the caller shows the glyph.
 *
 * The square case earns its place at 5 × 5: all three winning openings there are
 * centred on the middle row — the centre square, the middle three of it, and the
 * whole of it. "See the shaded squares" is true but forgettable; "take the centre
 * square" is the rule someone can actually carry to the next game.
 */
function whereInShape(shape: Shape, run: [number, number][]): string | null {
  const isStrip = shape.rows === 1 || shape.cols === 1;
  if (!isStrip) return whereInSquare(shape, run);
  if (shape.rect === null) return null;
  const k = shape.size;
  const L = run.length;
  const along = shape.rows === 1 ? run.map((p) => p[1]) : run.map((p) => p[0]);
  const start = Math.min(...along);
  const end = start + L - 1;
  if (L === k) return "the whole strip";
  const atStart = start === 0, atEnd = end === k - 1;
  if (atStart || atEnd) return L === 1 ? "either end square" : `flush with either end`;
  // Exactly centred?
  if (start === k - 1 - end) return L === 1 ? "the middle square" : "the middle";
  return `starting ${start + 1} in from either end`;
}

/**
 * Where a run sits inside a FULL, ODD square — or null when it has no name.
 *
 * Only a run centred on the square's own middle line gets one. A run somewhere
 * along the middle row but off to one side is not "the middle" of anything, and
 * calling it that would be the invented phrase this whole function exists to
 * avoid.
 */
function whereInSquare(shape: Shape, run: [number, number][]): string | null {
  const k = shape.rows;
  if (shape.cols !== k || shape.size !== k * k || k % 2 === 0) return null;
  const mid = (k - 1) / 2;
  const rows = new Set(run.map((p) => p[0]));
  const cols = new Set(run.map((p) => p[1]));
  const horizontal = rows.size === 1;
  const line = horizontal ? [...rows][0] : [...cols][0];
  if ((horizontal ? cols.size : rows.size) !== run.length && run.length > 1) return null;
  if (line !== mid) return null;
  const along = horizontal ? run.map((p) => p[1]) : run.map((p) => p[0]);
  const start = Math.min(...along), end = Math.max(...along);
  if (start !== k - 1 - end) return null; // not centred on the middle
  // Phrased to complete "Take <n in a row> at ___ of the 5×5", which is the one
  // sentence these strings are ever read in.
  if (run.length === 1) return "the centre";
  const which = horizontal ? "the centre row" : "the centre column";
  // A run as long as the square's side can only BE the whole centre line, so
  // naming the line is already exact — no "the whole" needed.
  return run.length === k ? which : `the middle of ${which}`;
}

/**
 * Every distinct IDEA available to the player to move, with its verdict.
 *
 * Concrete moves are grouped into classes; the count says how many board moves
 * each class covers. Sorted winning-first, then by how much of the board they
 * consume, so the cheapest winning idea reads first.
 */
export function moveClasses(b: Board, n: number, oracle: Oracle = memoOracle(n)): MoveClass[] {
  const shapes = shapesOf(b, n);
  /** board cell index → the shape containing it */
  const shapeOf = new Map<number, Shape>();
  for (const s of shapes) for (const i of s.boardCells) shapeOf.set(i, s);

  const classes = new Map<string, MoveClass>();
  for (const move of legalMoves(b, n)) {
    const shape = shapeOf.get(move.cells[0]);
    if (!shape) continue; // unreachable: a legal move only covers empty squares
    const shapeCells = shape.boardCells.map((i) => [Math.floor(i / n), i % n] as [number, number]);
    const runCells = move.cells.map((i) => [Math.floor(i / n), i % n] as [number, number]);
    const { key, run } = classKey(shapeCells, runCells);
    const hit = classes.get(key);
    if (hit) { hit.count++; hit.memberMasks.push(move.mask); continue; }
    classes.set(key, {
      key, shape, length: move.length, cellsInShape: run,
      wins: solvable(n) ? !oracle.wins(b | move.mask) : false,
      count: 1, example: move, memberMasks: [move.mask],
      where: whereInShape(shape, run),
    });
  }
  return [...classes.values()].sort((a, z) =>
    Number(z.wins) - Number(a.wins) || a.length - z.length || z.count - a.count);
}

/**
 * Winning advice as sentences, stated only where every move covered is winning.
 *
 * A rule like "take one square anywhere in the 4×1" is worth more than a list —
 * but only if it is TRUE of every square in that shape. Where the winning moves
 * in a shape do not fill a whole category, the narrower class is named instead.
 * A memorable rule that loses games is worse than a fussy one that does not.
 */
export function strategyAdvice(b: Board, n: number, oracle: Oracle = memoOracle(n)): string[] {
  const classes = moveClasses(b, n, oracle);
  const winners = classes.filter((c) => c.wins);
  if (winners.length === 0) return [];

  const out: string[] = [];
  const covered = new Set<string>();

  // Strongest first: is EVERY move of length L in this shape a winner?
  const byShapeLen = new Map<string, MoveClass[]>();
  for (const c of classes) {
    const k = `${c.shape.key}|${c.length}`;
    (byShapeLen.get(k) ?? byShapeLen.set(k, []).get(k)!).push(c);
  }
  /** Shape+length groups where EVERY move wins — the broad rules. */
  const broad = [...byShapeLen.values()].filter((g) => g.length > 0 && g.every((c) => c.wins));

  // Broader still: does a length win in EVERY shape on the board? Then it is
  // one rule — "any 4-in-a-row, in any shape" — rather than one per shape.
  const shapeKeys = new Set(classes.map((c) => c.shape.key));
  const byLen = new Map<number, MoveClass[][]>();
  for (const g of broad) (byLen.get(g[0].length) ?? byLen.set(g[0].length, []).get(g[0].length)!).push(g);
  const universal = new Set<number>();
  for (const [len, groups] of byLen) {
    const shapesCovered = new Set(groups.map((g) => g[0].shape.key));
    // Only "in any shape" when the length is legal in every shape AND wins there.
    const shapesWhereLegal = new Set(classes.filter((c) => c.length === len).map((c) => c.shape.key));
    if (shapesCovered.size === shapeKeys.size && shapesWhereLegal.size === shapeKeys.size) universal.add(len);
  }
  for (const len of [...universal].sort((a, z) => a - z)) {
    out.push(`Play any ${len === 1 ? "single square" : `${len}-in-a-row`} in ANY remaining shape.`);
    for (const g of broad) if (g[0].length === len) for (const c of g) covered.add(c.key);
  }
  for (const group of broad) {
    if (covered.has(group[0].key)) continue;
    const c = group[0];
    out.push(`Play any ${c.length === 1 ? "single square" : `${c.length}-in-a-row`} anywhere in the ${shapeName(c.shape)}.`);
    for (const g of group) covered.add(g.key);
  }
  // Then the individual winning ideas not already covered by a broader rule.
  for (const c of winners) {
    if (covered.has(c.key)) continue;
    const what = c.length === 1 ? "one square" : `${c.length} in a row`;
    out.push(c.where
      ? `Take ${what} at ${c.where} of the ${shapeName(c.shape)}.`
      : `Take ${what} in the ${shapeName(c.shape)} — see the shaded squares.`);
  }
  return out;
}

/** A legal move, with what it leads to and whether it wins. */
export interface MoveOption {
  move: Move;
  /** The board after playing it. */
  result: Board;
  /** Canonical form of `result` — the key distinct moves are deduped on. */
  key: Board;
  /**
   * True when this move WINS for the player making it: it hands the opponent a
   * position they lose from. Undefined when the board is too large to solve.
   */
  wins?: boolean;
}

/**
 * The genuinely different moves from `b` — one per distinct resulting position,
 * with rotations and reflections of each other collapsed together.
 *
 * On an empty 4 × 4 there are 64 legal moves but only 8 distinct ones; showing
 * all 64 buries the decision in duplicates that differ by turning the board
 * round. Deduping on the CANONICAL RESULT (not on the move's own shape) is what
 * makes this exact: it automatically accounts for how symmetric the current
 * position happens to be, so as the board fills and symmetry breaks, moves that
 * were interchangeable correctly separate out.
 *
 * Each option carries its perfect-play verdict when the size is solvable, so a
 * caller can colour winning and losing moves without re-deriving anything.
 */
export function distinctMoves(b: Board, n: number, oracle: Oracle = memoOracle(n)): MoveOption[] {
  const seen = new Map<Board, MoveOption>();
  for (const move of legalMoves(b, n)) {
    const result = b | move.mask;
    const key = canonicalBoard(result, n);
    if (seen.has(key)) continue;
    const opt: MoveOption = { move, result, key };
    // Misère: my move wins if it leaves the opponent in a losing position.
    if (solvable(n)) opt.wins = !oracle.wins(result);
    seen.set(key, opt);
  }
  return [...seen.values()];
}
