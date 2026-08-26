import { describe, it, expect } from "vitest";
import {
  legalMoves, isLegalSelection, winning, bestMove, fullBoard, isFull,
  idx, emptyCount, maxRun, solvable,
  distinctMoves, canonicalBoard, symmetries, transform,
  shapesOf, groupedShapes, shapeName, canonicalShape,
  moveClasses, strategyAdvice, memoOracle, buildSolveTable, tableOracle,
  shapeCatalogue, shapeWins, canonicalMask,
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

  it("the longest run is the whole line, whatever the board size", () => {
    // Paul, 2026-08-26: the cap scales with n rather than sitting at four. On a
    // 6 × 6 that means a full row of six — the reading that used to be capped.
    for (const n of [3, 4, 5, 6]) {
      expect(Math.max(...legalMoves(0, n).map((m) => m.length)), `n=${n}`).toBe(maxRun(n));
    }
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
  it("rejects a run longer than the line it sits in", () => {
    // A run may now be as long as the board is wide, so the rejection to test
    // is one that OVERRUNS the line — five squares needs a 5-wide board, and on
    // a 4 × 4 the fifth would have wrapped onto the next row.
    expect(isLegalSelection(0, 6, [0, 1, 2, 3, 4])).toBe(true);
    expect(isLegalSelection(0, 6, [0, 1, 2, 3, 4, 5, 6])).toBe(false);
    expect(isLegalSelection(0, 4, [0, 1, 2, 3, 4])).toBe(false);
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
    // 5 × 5 joined once the retrograde table made it a 3s worker job rather than
    // a hang; 6 × 6 is 68 billion positions and stays out.
    expect(solvable(4)).toBe(true);
    expect(solvable(5)).toBe(true);
    expect(solvable(6)).toBe(false);
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

/**
 * T2881 — advice is only stated when it is true of everything it covers.
 *
 * A rule like "take one square anywhere in the 4×1" is worth far more than a
 * list of squares — but only if EVERY square in that shape really does win. A
 * memorable rule that loses games is worse than a fussy one that does not.
 *
 * The soundness argument: two moves related by a symmetry of THEIR OWN SHAPE
 * leave the same multiset of shapes behind. That symmetry need not extend to
 * the whole board, and usually does not — but it does not have to, because the
 * shapes are independent games and the position's value depends only on which
 * shapes remain. So a class is value-homogeneous, and speaking about it as a
 * unit is honest. These tests check that rather than trusting it.
 */
describe("Nimb — move classes and advice", () => {
  const n = 4;
  const rowTaken = [0, 1, 2, 3].reduce((b, c) => b | (1 << idx(n, 1, c)), 0);

  it("every concrete move in a class shares the class verdict", () => {
    const memo = new Map<number, boolean>();
    const oracle = memoOracle(n, memo);
    const boards = [0, rowTaken, 1 << idx(n, 0, 0), (1 << idx(n, 0, 0)) | (1 << idx(n, 3, 3))];
    let moves = 0;
    for (const b of boards) {
      for (const c of moveClasses(b, n, oracle)) {
        for (const mask of c.memberMasks) {
          moves++;
          expect(!winning(b | mask, n, memo), `class ${c.key}`).toBe(c.wins);
        }
      }
    }
    expect(moves, "the check must actually have looked at moves").toBeGreaterThan(200);
  });

  it("classes account for every legal move, exactly once", () => {
    for (const b of [0, rowTaken]) {
      const covered = moveClasses(b, n).reduce((t, c) => t + c.count, 0);
      expect(covered).toBe(legalMoves(b, n).length);
      const masks = moveClasses(b, n).flatMap((c) => c.memberMasks);
      expect(new Set(masks).size).toBe(masks.length);
    }
  });

  it("Paul's example: a 4x4 with its 2nd row taken advises the 4-in-a-row rule", () => {
    const advice = strategyAdvice(rowTaken, n);
    expect(advice.join(" ")).toMatch(/any 4-in-a-row in ANY remaining shape/i);
    expect(advice.join(" ")).toMatch(/middle of the 4×1/i);
  });

  it("a rule is never stated over a category containing a losing move", () => {
    const memo = new Map<number, boolean>();
    const oracle = memoOracle(n, memo);
    for (const b of [0, rowTaken, 1 << idx(n, 2, 1)]) {
      const cls = moveClasses(b, n, oracle);
      // For every "anywhere in the <shape>" rule, all classes of that shape and
      // length must win — that is precisely the promise the sentence makes.
      for (const line of strategyAdvice(b, n, oracle)) {
        const m = line.match(/any (\d)-in-a-row|any single square/);
        if (!m) continue;
        const len = m[1] ? Number(m[1]) : 1;
        const shapeMatch = line.match(/in the (.+?)\.$/);
        const affected = cls.filter((c) => c.length === len && (!shapeMatch || shapeName(c.shape) === shapeMatch[1]));
        expect(affected.every((c) => c.wins), line).toBe(true);
      }
    }
  });

  it("says nothing when there is nothing true to say", () => {
    // A lost position yields no advice at all rather than a hopeful guess.
    expect(winning(0, 4)).toBe(false);
    expect(strategyAdvice(0, 4)).toEqual([]);
  });

  it("only describes position-in-shape for straight strips, where it is exact", () => {
    for (const c of moveClasses(rowTaken, n)) {
      const isStrip = c.shape.rows === 1 || c.shape.cols === 1;
      if (!isStrip) expect(c.where, `${shapeName(c.shape)} should not be described in words`).toBeNull();
    }
  });
});

/**
 * T2882 — the solved table is the same solver, not a second one.
 *
 * 5 × 5 exists only because the retrograde sweep replaced the recursive solver
 * at that size. Two independent implementations of the same question is exactly
 * the setup where one of them quietly drifts, so the guard is not "the table
 * looks plausible" but "the table agrees with the recursive solver on EVERY
 * position of a board small enough to check both ways". 4 × 4 is 65,536
 * positions — cheap to check exhaustively, and big enough that an off-by-one in
 * the sweep direction or the terminal value could not survive it.
 */
describe("Nimb — the solved table", () => {
  it("agrees with the recursive solver on every position, 1×1 through 4×4", () => {
    for (const n of [1, 2, 3, 4]) {
      const table = buildSolveTable(n);
      expect(table).toHaveLength(1 << (n * n));
      const memo = new Map<number, boolean>();
      for (let pos = 0; pos < table.length; pos++) {
        expect(table[pos] === 1, `n=${n} pos=${pos}`).toBe(winning(pos, n, memo));
      }
    }
  });

  it("a full board is a win for the player to move — the misère terminal", () => {
    // The whole inversion rests on this one entry: nobody can move, so the
    // OPPONENT placed the last ✕ and lost. Get it wrong and every value flips.
    for (const n of [2, 3]) expect(buildSolveTable(n)[fullBoard(n)]).toBe(1);
  });

  it("a table oracle and a memo oracle answer identically", () => {
    const n = 3;
    const table = tableOracle(buildSolveTable(n));
    const memo = memoOracle(n);
    for (let pos = 0; pos < 1 << (n * n); pos++) expect(table.wins(pos)).toBe(memo.wins(pos));
  });

  it("reports progress that ends at exactly 100%", () => {
    // The progress bar is the only thing a user sees for three seconds, so a
    // sweep that stops reporting at 97% reads as a hang.
    const seen: number[] = [];
    buildSolveTable(3, (done, total) => seen.push(done / total));
    expect(seen.length).toBeGreaterThan(1);
    expect(seen[seen.length - 1]).toBe(1);
    expect(Math.min(...seen)).toBeGreaterThan(0);
  });
});

/**
 * T2883 — the 5 × 5 result, and the sentence that describes it.
 *
 * 5 × 5 is the size the whole table-and-slices apparatus was built for, and its
 * answer is the most interesting one in the game: the first player wins, and of
 * the 24 genuinely different openings only THREE do — the centre square, the
 * middle three of the centre line, and the whole centre line. Every one of them
 * is centred on the middle. That is a real claim about the game, so it is
 * pinned; if a change to the move rules or the solver moves it, this says so
 * rather than leaving a wrong strategy on screen.
 *
 * It costs ~3.5s to build the table. That is the price of asserting the headline
 * fact rather than trusting it.
 */
describe("Nimb — 5×5", () => {
  const n = 5;
  const oracle = tableOracle(buildSolveTable(n));

  it("is a first-player win", () => {
    expect(oracle.wins(0)).toBe(true);
  });

  it("has exactly three winning openings, all centred on the middle line", () => {
    const opts = distinctMoves(0, n, oracle);
    expect(opts, "24 distinct openings out of 125 legal moves").toHaveLength(24);
    const won = opts.filter((o) => o.wins);
    expect(won.map((o) => o.move.length).sort()).toEqual([1, 3, 5]);
    for (const o of won) {
      // Centred on the middle line: the run sits in line index 2 and its cells
      // are symmetric about the centre of that line.
      expect(o.move.line, `${o.move.length}-run should sit on the middle line`).toBe(2);
      expect(o.move.start).toBe((n - o.move.length) / 2);
    }
  });

  it("names those openings by the centre rather than by shading", () => {
    // "see the shaded squares" is true but forgettable. On a full odd square the
    // centre line CAN be named, and this is where that matters.
    const advice = strategyAdvice(0, n, oracle);
    expect(advice).toHaveLength(3);
    for (const line of advice) expect(line, line).toMatch(/centre/);
    expect(advice.join(" ")).not.toMatch(/shaded/);
  });

  it("a run may now be a whole line — the rule change 5×5 depends on", () => {
    // Under the old fixed cap of four, "5 in a row" would not exist and the
    // third winning opening with it.
    expect(maxRun(n)).toBe(n);
    expect(legalMoves(0, n).filter((m) => m.length === n)).toHaveLength(2 * n);
  });
});

/**
 * T2884 — the shape catalogue, and the two solvers behind it agreeing.
 *
 * The catalogue reads a shape's verdict off the solved table: fill in every
 * square except the shape and ask who wins that position. The shape solver
 * (`shapeWins`) answers the same question by decomposing and searching. They are
 * genuinely independent routes to the same number, so they are checked against
 * each other — that check is the whole warrant for using the fast one.
 *
 * The other thing pinned here is the counting: the totals must be exact even
 * when the drawing is capped, because a panel that quietly showed 120 of 2,244
 * and reported 120 would read as a complete catalogue.
 */
describe("Nimb — the shape catalogue", () => {
  const n = 4;
  const oracle = tableOracle(buildSolveTable(n));

  it("agrees with the shape solver on every form it draws", () => {
    const memo = new Map<string, boolean>();
    let checked = 0;
    for (let size = 1; size <= n * n; size++) {
      // Cap lifted: every form is checked, not just the ones a panel would draw.
      const cat = shapeCatalogue(n, size, oracle, 10_000);
      for (const s of cat.winningShapes) { expect(shapeWins(s.key, maxRun(n), memo), s.key).toBe(true); checked++; }
      for (const s of cat.losingShapes) { expect(shapeWins(s.key, maxRun(n), memo), s.key).toBe(false); checked++; }
    }
    // 1,280 is every distinct form that fits on a 4 × 4 board, at any size.
    expect(checked, "every form of every size must have been checked").toBe(1280);
  });

  it("counts every form of a size, and each form only once", () => {
    // 4×4 by size: the free polyominoes that fit in a 4×4 box. 1,1,2,5,... is the
    // start of the polyomino sequence itself, which is the check that translation,
    // rotation and reflection are all being collapsed.
    const counts = Array.from({ length: n * n }, (_, k) => shapeCatalogue(n, k + 1, oracle).total);
    expect(counts).toEqual([1, 1, 2, 5, 11, 29, 66, 140, 224, 287, 255, 169, 66, 20, 3, 1]);
    for (let size = 1; size <= n * n; size++) {
      const cat = shapeCatalogue(n, size, oracle);
      expect(cat.winning + cat.losing, `size ${size}`).toBe(cat.total);
      const keys = [...cat.winningShapes, ...cat.losingShapes].map((s) => s.key);
      expect(new Set(keys).size, `size ${size}: no form drawn twice`).toBe(keys.length);
      for (const s of [...cat.winningShapes, ...cat.losingShapes]) expect(s.size).toBe(size);
    }
  });

  it("caps the drawing, never the counting", () => {
    const cat = shapeCatalogue(n, 10, oracle, 4);
    expect(cat.total).toBe(287);
    expect(cat.losing).toBe(38);
    expect(cat.losingShapes).toHaveLength(4);
    expect(cat.losingOmitted).toBe(34);
    expect(cat.winningShapes).toHaveLength(4);
    expect(cat.winningOmitted).toBe(cat.winning - 4);
  });

  it("a single square loses and a domino wins — the two ends of the catalogue", () => {
    // Facing one empty square you must take it, and taking the last ✕ loses.
    // Facing two you take one and hand the loss back.
    expect(shapeCatalogue(n, 1, oracle).losing).toBe(1);
    expect(shapeCatalogue(n, 2, oracle).winning).toBe(1);
  });

  it("canonicalMask collapses exactly the eight symmetries and nothing else", () => {
    // An L-tromino in all four corners of the board is one form; an L and an
    // I-tromino are two.
    const cells = (...cs: [number, number][]) => cs.reduce((m, [r, c]) => m | (1 << idx(n, r, c)), 0);
    const cornerL = cells([0, 0], [0, 1], [1, 0]);
    const otherL = cells([3, 3], [3, 2], [2, 3]);
    const bar = cells([0, 0], [0, 1], [0, 2]);
    expect(canonicalMask(cornerL, n)).toBe(canonicalMask(otherL, n));
    expect(canonicalMask(bar, n)).not.toBe(canonicalMask(cornerL, n));
    // Sliding a form around the board never changes its canonical value.
    expect(canonicalMask(bar, n)).toBe(canonicalMask(cells([2, 1], [2, 2], [2, 3]), n));
  });
});
