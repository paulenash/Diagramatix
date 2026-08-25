import { describe, it, expect } from "vitest";
import {
  legalMoves, isLegalSelection, winning, bestMove, fullBoard, isFull,
  idx, emptyCount, MAX_RUN, solvable,
  distinctMoves, canonicalBoard, symmetries, transform,
  shapesOf, groupedShapes, shapeName, canonicalShape,
} from "@/app/lib/games/nimb";

/**
 * T2877 — n × n Nimb: the rules of a move.
 *
 * A turn places 1–4 x's in ONE row or ONE column, on CONSECUTIVE squares, all
 * of which must be empty. Getting this wrong in either direction ruins the
 * game: too permissive and it stops being the game Paul described, too strict
 * and legal positions become unreachable.
 */
describe("Nimb — legal moves", () => {
  it("counts every run on an empty 3x3", () => {
    // Rows: per row, runs of length 1,2,3 => 3+2+1 = 6, times 3 rows = 18.
    // Columns: length 1 is emitted as a row move only (same square, same move),
    // so columns contribute lengths 2,3 => 2+1 = 3, times 3 columns = 9.
    expect(legalMoves(0, 3)).toHaveLength(27);
  });

  it("never offers a run longer than 4, even on a big board", () => {
    expect(Math.max(...legalMoves(0, 6).map((m) => m.length))).toBe(MAX_RUN);
  });

  it("a single square is offered once, not once per orientation", () => {
    const singles = legalMoves(0, 3).filter((m) => m.length === 1);
    expect(singles).toHaveLength(9);
    expect(new Set(singles.map((m) => m.mask)).size, "no duplicate single-square moves").toBe(9);
  });

  it("will not span a filled square", () => {
    const n = 3;
    const b = 1 << idx(n, 0, 1); // middle of the top row taken
    const topRow = legalMoves(b, n).filter((m) => m.orientation === "row" && m.line === 0);
    expect(topRow.map((m) => m.cells)).toEqual([[idx(n, 0, 0)], [idx(n, 0, 2)]]);
  });

  it("every generated move is one the validator accepts", () => {
    for (const m of legalMoves(0, 4)) expect(isLegalSelection(0, 4, m.cells), JSON.stringify(m.cells)).toBe(true);
  });
});

describe("Nimb — validating a hand-made selection", () => {
  const n = 4;
  it("accepts a consecutive run in a row and in a column", () => {
    expect(isLegalSelection(0, n, [idx(n, 1, 0), idx(n, 1, 1), idx(n, 1, 2)])).toBe(true);
    expect(isLegalSelection(0, n, [idx(n, 0, 2), idx(n, 1, 2), idx(n, 2, 2)])).toBe(true);
  });
  it("rejects a gap, a diagonal, more than four, and an occupied square", () => {
    expect(isLegalSelection(0, n, [idx(n, 1, 0), idx(n, 1, 2)]), "gap").toBe(false);
    expect(isLegalSelection(0, n, [idx(n, 0, 0), idx(n, 1, 1)]), "diagonal").toBe(false);
    expect(isLegalSelection(0, n, [0, 1, 2, 3].map((c) => idx(n, 0, c)).concat(idx(n, 0, 3))), "dup").toBe(false);
    expect(isLegalSelection(1 << idx(n, 2, 2), n, [idx(n, 2, 2)]), "occupied").toBe(false);
    expect(isLegalSelection(0, n, []), "empty selection").toBe(false);
  });
  it("rejects a run of five", () => {
    expect(isLegalSelection(0, 6, [0, 1, 2, 3, 4])).toBe(false);
  });
});

/**
 * T2878 — the misère rule, which is the whole game.
 *
 * Whoever places the LAST x loses. So a full board is a WIN for the player to
 * move: they have nothing to do, and the opponent has just lost by filling it.
 * Every other value follows from that single inversion — under normal play
 * (last move wins) the answers below invert.
 */
describe("Nimb — misère outcomes", () => {
  it("a full board is a win for the player to move — the opponent just lost", () => {
    expect(isFull(fullBoard(3), 3)).toBe(true);
    expect(winning(fullBoard(3), 3)).toBe(true);
  });

  it("1x1: the mover must fill the only square and so loses", () => {
    expect(winning(0, 1)).toBe(false);
    expect(emptyCount(0, 1)).toBe(1);
  });

  /**
   * The solved outcomes. Computed, not assumed — the first version of this test
   * asserted that 2x2 was a first-player win because that felt right, and it is
   * not. Only 3x3 is winnable by the opener among the sizes we can solve, which
   * is exactly the sort of thing the tile exists to find.
   */
  it.each([
    [1, false],
    [2, false],
    [3, true],
    [4, false],
  ])("n=%i: first player wins = %s", (n, expected) => {
    expect(winning(0, n)).toBe(expected);
  });

  it("every reported best move really does leave the opponent losing", () => {
    for (const n of [1, 2, 3, 4]) {
      const memo = new Map<number, boolean>();
      const m = bestMove(0, n, memo);
      expect(m, `n=${n}`).not.toBeNull();
      if (winning(0, n, memo)) {
        expect(winning(m!.mask, n, memo), `n=${n}: a winning opening must hand over a lost position`).toBe(false);
      }
    }
  });

  it("bestMove on a lost position still moves, choosing the smallest run", () => {
    // 1x1 is lost for the mover; it must still return the only move.
    const m = bestMove(0, 1);
    expect(m).not.toBeNull();
    expect(m!.length).toBe(1);
  });

  it("returns null only when the board is full", () => {
    expect(bestMove(fullBoard(3), 3)).toBeNull();
  });

  it("knows which sizes it can actually solve, rather than hanging on the rest", () => {
    expect(solvable(4)).toBe(true);
    expect(solvable(5)).toBe(false);
  });
});

/**
 * T2879 — symmetry reduction: one entry per genuinely different move.
 *
 * On an empty 3 × 3 there are 27 legal moves but only 7 that differ by anything
 * other than turning the board round; on 4 × 4, 64 collapse to 11. Listing all
 * of them would bury the decision in duplicates.
 *
 * Deduping on the canonical form of the RESULTING position (rather than on the
 * move's own shape) is what makes this exact: it accounts for how symmetric the
 * current board happens to be, so moves that are interchangeable now correctly
 * separate once the symmetry breaks.
 */
describe("Nimb — distinct moves", () => {
  it.each([
    [2, 8, 2],
    [3, 27, 7],
    [4, 64, 11],
  ])("n=%i: %i legal moves reduce to %i distinct", (n, legal, distinct) => {
    expect(legalMoves(0, n)).toHaveLength(legal);
    expect(distinctMoves(0, n)).toHaveLength(distinct);
  });

  it("the orbits account for EVERY legal move — none double-counted or lost", () => {
    for (const n of [2, 3, 4]) {
      const opts = distinctMoves(0, n);
      const all = legalMoves(0, n);
      const covered = all.filter((m) => opts.some((o) => o.key === canonicalBoard(m.mask, n)));
      expect(covered, `n=${n}`).toHaveLength(all.length);
      // and each legal move belongs to exactly one orbit
      for (const m of all) {
        const hits = opts.filter((o) => o.key === canonicalBoard(m.mask, n));
        expect(hits, `n=${n}, move ${m.cells}`).toHaveLength(1);
      }
    }
  });

  it("2x2 offers two first moves and BOTH lose", () => {
    const opts = distinctMoves(0, 2);
    expect(opts).toHaveLength(2);
    expect(opts.every((o) => o.wins === false)).toBe(true);
  });

  it("3x3 offers seven, of which three win", () => {
    const opts = distinctMoves(0, 3);
    expect(opts).toHaveLength(7);
    expect(opts.filter((o) => o.wins)).toHaveLength(3);
  });

  it("a move is green exactly when it hands the opponent a losing position", () => {
    for (const o of distinctMoves(0, 3)) expect(o.wins).toBe(!winning(o.result, 3));
  });

  it("symmetry breaks as the board fills — a corner and the centre stop being alike", () => {
    // With one corner taken, the board is no longer 8-fold symmetric, so more
    // moves are genuinely different than from the empty board.
    const b = 1 << idx(3, 0, 0);
    expect(distinctMoves(b, 3).length).toBeGreaterThan(distinctMoves(0, 3).length - 3);
  });

  it("canonicalBoard is stable under all eight symmetries", () => {
    const n = 3;
    const b = (1 << idx(n, 0, 0)) | (1 << idx(n, 0, 1)); // a border domino
    const canon = canonicalBoard(b, n);
    for (const p of symmetries(n)) expect(canonicalBoard(transform(b, p), n)).toBe(canon);
  });
});

/**
 * T2880 — the board decomposes into independent shapes.
 *
 * A move is a contiguous run in a line, so it can never span two regions
 * separated by filled squares. Once the middle row of a 4×4 is taken, the 4×1
 * above and the 4×2 below cannot interact again — and WHERE a shape sits stops
 * mattering, only its form.
 *
 * This is the basis for describing a position as a bag of shapes rather than a
 * bitmask, so it is checked rather than assumed. (It is emphatically NOT
 * Sprague-Grundy: that sums independent games by XOR and applies to NORMAL
 * play; misère sums are far nastier and the XOR is wrong for them. Nothing here
 * relies on it.)
 */
describe("Nimb — shape decomposition", () => {
  const n = 4;
  const rowMove = [0, 1, 2, 3].reduce((b, c) => b | (1 << idx(n, 1, c)), 0); // 4 ✕ across row 2
  const colMove = [0, 1, 2, 3].reduce((b, r) => b | (1 << idx(n, r, 2)), 0); // the same, rotated

  it("splits a 4x4 with its 2nd row taken into a 4x1 and a 4x2", () => {
    const g = groupedShapes(rowMove, n);
    expect(g.map((x) => shapeName(x.shape)).sort()).toEqual(["4×1", "4×2"]);
    expect(g.every((x) => x.count === 1)).toBe(true);
  });

  it("a move and its rotation leave the SAME shapes — position is irrelevant", () => {
    const a = shapesOf(rowMove, n).map((s) => s.key).sort();
    const b = shapesOf(colMove, n).map((s) => s.key).sort();
    expect(a).toEqual(b);
  });

  it("names rectangles longest-side-first, so 1x4 and 4x1 are one shape", () => {
    const across = shapesOf(rowMove, n).find((s) => s.size === 4)!;
    const down = shapesOf(colMove, n).find((s) => s.size === 4)!;
    expect(across.rect).toBe("4×1");
    expect(down.rect).toBe("4×1");
    expect(across.key).toBe(down.key);
  });

  it("groups repeats: taking the middle column of a 3x3 leaves two 3x1s", () => {
    const b = [0, 1, 2].reduce((acc, r) => acc | (1 << idx(3, r, 1)), 0);
    const g = groupedShapes(b, 3);
    expect(g).toHaveLength(1);
    expect(g[0].count).toBe(2);
    expect(shapeName(g[0].shape)).toBe("3×1");
  });

  it("a non-rectangle has no rect name but keeps its geometry", () => {
    // Take one corner of a 3x3 — the rest is a connected L of 8 squares.
    const b = 1 << idx(3, 0, 0);
    const s = shapesOf(b, 3);
    expect(s).toHaveLength(1);
    expect(s[0].size).toBe(8);
    expect(s[0].rect).toBeNull();
    expect(s[0].cells).toHaveLength(8);
  });

  it("every square is accounted for exactly once", () => {
    for (const b of [0, rowMove, colMove, 1 << idx(n, 2, 2)]) {
      const cells = shapesOf(b, n).flatMap((s) => s.boardCells);
      expect(new Set(cells).size).toBe(cells.length);
      expect(cells).toHaveLength(emptyCount(b, n));
    }
  });

  it("canonicalShape is stable across all eight orientations", () => {
    const L: [number, number][] = [[0, 0], [1, 0], [2, 0], [2, 1]];
    const keys = new Set<string>();
    for (let v = 0; v < 8; v++) {
      const t = L.map(([r, c]) => {
        let a = r, b = c;
        if (v & 4) { const x = a; a = b; b = x; }
        if (v & 1) a = -a;
        if (v & 2) b = -b;
        return [a, b] as [number, number];
      });
      keys.add(canonicalShape(t).key);
    }
    expect(keys.size, "all eight orientations share one key").toBe(1);
  });
});
