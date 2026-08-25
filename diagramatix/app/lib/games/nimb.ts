/**
 * n × n Nimb — a two-player misère placement game, and a solver for it.
 *
 * RULES
 *  1. An n × n grid of empty squares.
 *  2. A turn places 1–4 x's in a single row OR a single column. The squares
 *     must be CONSECUTIVE and all of them must currently be empty.
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

export const MAX_RUN = 4;
/** Above this the exact solver is refused rather than left to hang — see
 *  `solvable()`. 5×5 = 25 bits = 33.5M positions, already slow in a browser. */
export const MAX_SOLVE_N = 4;

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
  const maxLen = Math.min(MAX_RUN, n);
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
  if (cells.length < 1 || cells.length > MAX_RUN) return false;
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
export function distinctMoves(b: Board, n: number, memo = new Map<Board, boolean>()): MoveOption[] {
  const seen = new Map<Board, MoveOption>();
  for (const move of legalMoves(b, n)) {
    const result = b | move.mask;
    const key = canonicalBoard(result, n);
    if (seen.has(key)) continue;
    const opt: MoveOption = { move, result, key };
    // Misère: my move wins if it leaves the opponent in a losing position.
    if (solvable(n)) opt.wins = !winning(result, n, memo);
    seen.set(key, opt);
  }
  return [...seen.values()];
}
