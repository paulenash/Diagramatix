import { describe, it, expect } from "vitest";
import {
  cellsFrom, step, boundingBox, sameShape, sameCells, runUntilSettled, stabilisation,
  packCell, cellX, cellY,
} from "@/app/lib/life/engine";
import { CONWAY, parseRule, formatRule, describeRule, RULE_LIBRARY, ruleFor } from "@/app/lib/life/rules";
import { LIFE_PATTERNS, artToCoords, patternById } from "@/app/lib/life/patterns";

/**
 * Conway's Game of Life.
 *
 * The pattern library is ASCII art, and a single cell in the wrong place turns
 * the R-pentomino into something that dies in twenty generations while still
 * looking plausible on the screen. So nothing here asserts cell counts: it
 * asserts the DOCUMENTED BEHAVIOUR — 1,103 generations, 5,206, dies at exactly
 * 130, moves one square diagonally every four — which no typo can survive.
 *
 * Those figures are Life's own, published long before this code existed, so they
 * are a genuinely independent check on both the art and the engine. All three
 * came out exactly right on the first run, which is the strongest evidence
 * available that neither is wrong.
 */

const cellsOf = (id: string) => cellsFrom(artToCoords(patternById(id)!.art));

describe("the engine", () => {
  it("T3305 packs a cell and reads it back, including negative coordinates", () => {
    // A pattern is placed where the user drops it and a glider then travels away
    // from there forever, so coordinates must go both ways.
    for (const [x, y] of [[0, 0], [5, 9], [-1, -1], [-300, 412], [32767, -32768]] as [number, number][]) {
      const k = packCell(x, y);
      expect([cellX(k), cellY(k)], `${x},${y}`).toEqual([x, y]);
    }
  });

  it("T3306 applies the four rules: births, survival, under- and overpopulation", () => {
    // A live cell with one neighbour dies; the pair dies with it.
    expect(step(cellsFrom([[0, 0], [1, 0]])).size).toBe(0);
    // Three in a row: the two ends die of loneliness, the middle survives, and
    // the two cells above and below the middle are born — a blinker.
    expect(sameCells(step(cellsFrom([[0, 0], [1, 0], [2, 0]])), cellsFrom([[1, -1], [1, 0], [1, 1]]))).toBe(true);
    // A cell packed on all sides dies of overcrowding, though its neighbours live.
    const dense = cellsFrom([[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]]);
    expect(step(dense).has(packCell(1, 0))).toBe(false);
  });

  it("T3307 treats everything outside a bounded grid as dead, and does NOT wrap", () => {
    // Paul: "I would not normally make the edges wrap around… With a fixed grid,
    // simply regard everything outside the grid as dead." A wrap would make this
    // blinker at the corner interact with the far edge; a cull kills it.
    const atEdge = cellsFrom([[0, 0], [1, 0], [2, 0]]);
    const bounded = step(atEdge, { width: 3, height: 3 });
    for (const k of bounded) {
      expect(cellX(k)).toBeGreaterThanOrEqual(0);
      expect(cellY(k)).toBeGreaterThanOrEqual(0);
      expect(cellX(k)).toBeLessThan(3);
      expect(cellY(k)).toBeLessThan(3);
    }
    // Unbounded, the same blinker keeps the cell that a bound would have culled.
    expect(step(atEdge).has(packCell(1, -1))).toBe(true);
    expect(bounded.has(packCell(1, -1))).toBe(false);
  });

  it("T3308 a glider that reaches a bounded edge crashes there and does not reappear opposite", () => {
    // It leaves a block in the corner it hit, which is what really happens when
    // a glider meets a wall. The point is where the remains ARE: on a toroidal
    // grid the glider would have sailed out of the bottom-right and back in at
    // the top-left, and every cell here is in the corner it crashed into.
    const start = cellsOf("glider");
    let c = start;
    for (let i = 0; i < 60; i++) c = step(c, { width: 6, height: 6 });
    expect(sameShape(start, c), "it is still a glider — it wrapped").toBe(false);
    const b = boundingBox(c)!;
    expect(b.x).toBeGreaterThanOrEqual(3);
    expect(b.y).toBeGreaterThanOrEqual(3);
  });
});

describe("the pattern library behaves as it is described", () => {
  it("T3309 every still life is unchanged by a generation", () => {
    for (const p of LIFE_PATTERNS.filter((x) => x.category === "still-life")) {
      const c = cellsFrom(artToCoords(p.art));
      expect(sameCells(step(c), c), p.name).toBe(true);
    }
  });

  it("T3310 every oscillator returns to itself, at the period it claims", () => {
    const expected: Record<string, number> = {
      blinker: 2, toad: 2, beacon: 2, pulsar: 3, pentadecathlon: 15,
    };
    for (const [id, period] of Object.entries(expected)) {
      const r = runUntilSettled(cellsOf(id), 100);
      expect(r.period, id).toBe(period);
      expect(r.generation, `${id} should be periodic from the start`).toBe(0);
    }
  });

  it("T3311 every spaceship comes back to its own shape, displaced", () => {
    // The glider's diagonal step is the reason Life can carry information across
    // the grid, so the DISPLACEMENT is the property worth pinning, not the cells.
    const expected: Record<string, [number, number]> = {
      glider: [1, 1], lwss: [2, 0], mwss: [2, 0], hwss: [2, 0],
    };
    for (const [id, [dx, dy]] of Object.entries(expected)) {
      const start = cellsOf(id);
      let c = start;
      for (let i = 0; i < 4; i++) c = step(c);
      expect(sameShape(start, c), `${id} lost its shape`).toBe(true);
      const a = boundingBox(start)!, b = boundingBox(c)!;
      expect([b.x - a.x, b.y - a.y], id).toEqual([dx, dy]);
    }
  });

  it("T3312 the R-pentomino settles at generation 1,103", () => {
    // Five cells, and one of the patterns that showed how unpredictable Life is.
    const r = stabilisation(cellsOf("r-pentomino"));
    expect(r.generation).toBe(1103);
    expect(r.population).toBe(116);
  });

  it("T3313 the acorn settles at generation 5,206", () => {
    // Seven cells. Paul: "the best patterns for testing a simulator because a
    // tiny initial state develops into a surprisingly large population."
    const r = stabilisation(cellsOf("acorn"));
    expect(r.generation).toBe(5206);
    expect(r.peakPopulation).toBeGreaterThan(1000);
  });

  it("T3314 the diehard dies completely at generation 130", () => {
    const r = stabilisation(cellsOf("diehard"));
    expect(r.extinct).toBe(true);
    expect(r.generation).toBe(130);
  });

  it("T3315 the Gosper gun never settles — it grows without bound", () => {
    // Its discovery proved a Life population can grow forever, so "still growing
    // after a thousand generations" is the assertion, not a final count.
    const start = cellsOf("gosper-gun");
    let c = start;
    for (let i = 0; i < 1000; i++) c = step(c);
    expect(c.size).toBeGreaterThan(start.size * 3);
    expect(runUntilSettled(start, 400).settled).toBe(false);
  });

  it("T3316 the switch engine travels forever, leaving debris behind it", () => {
    // The moving part stays the same size while the box it has touched keeps
    // growing — which is what "leaves a trail" means, measured.
    const start = cellsOf("switch-engine");
    let c = start;
    const boxes: number[] = [];
    for (let i = 1; i <= 1000; i++) {
      c = step(c);
      if (i === 300 || i === 600 || i === 1000) boxes.push(boundingBox(c)!.width);
    }
    expect(boxes[0]).toBeLessThan(boxes[1]);
    expect(boxes[1]).toBeLessThan(boxes[2]);
    expect(boundingBox(c)!.width).toBeGreaterThan(boundingBox(start)!.width * 10);
  });

  it("T3317 every pattern in the library is well-formed and categorised", () => {
    const ids = new Set<string>();
    for (const p of LIFE_PATTERNS) {
      expect(ids.has(p.id), `duplicate id ${p.id}`).toBe(false);
      ids.add(p.id);
      expect(p.name.length, p.id).toBeGreaterThan(0);
      expect(p.behaviour.length, `${p.id} has no description`).toBeGreaterThan(10);
      expect(artToCoords(p.art).length, `${p.id} has no live cells`).toBeGreaterThan(0);
      // Ragged art is how a cell ends up in the wrong column.
      for (const row of p.art) expect(row.length, `${p.id} rows differ in length`).toBe(p.art[0].length);
    }
  });
});

describe("the rule is data, not code", () => {
  it("T3318 B/S notation round-trips, and rubbish is refused", () => {
    expect(formatRule(parseRule("B3/S23")!)).toBe("B3/S23");
    expect(formatRule(parseRule("b36/s23")!)).toBe("B36/S23");
    expect(formatRule(parseRule("B2/S")!)).toBe("B2/S");          // Seeds: nothing survives
    for (const bad of ["", "B3", "S23", "B3/S9", "B3S23", "hello", "B3/S2x"]) {
      expect(parseRule(bad), bad).toBeNull();
    }
  });

  it("T3319 HighLife differs from Conway by one birth condition, and behaves differently", () => {
    const high = parseRule("B36/S23")!;
    expect([...high.birth].sort()).toEqual([3, 6]);
    expect([...high.survive].sort()).toEqual([...CONWAY.survive].sort());
    // Same start, different rule, different result — the point of making it data.
    const start = cellsOf("r-pentomino");
    let a = start, b = start;
    for (let i = 0; i < 40; i++) { a = step(a, undefined, CONWAY); b = step(b, undefined, high); }
    expect(sameCells(a, b)).toBe(false);
  });

  it("T3320 Life Without Death never kills a cell", () => {
    // B3/S012345678 survives on ZERO neighbours, which is the case a tally-only
    // implementation drops: an isolated cell never appears in the neighbour
    // counts at all, so it has to be carried across explicitly.
    const lwd = parseRule("B3/S012345678")!;
    const lonely = cellsFrom([[0, 0]]);
    expect(step(lonely, undefined, lwd).has(packCell(0, 0))).toBe(true);
    // ...and under Conway the same cell dies of loneliness.
    expect(step(lonely, undefined, CONWAY).size).toBe(0);
  });

  it("T3321 Seeds keeps nothing alive from one generation to the next", () => {
    const seeds = parseRule("B2/S")!;
    const start = cellsOf("block");
    const next = step(start, undefined, seeds);
    for (const k of start) expect(next.has(k), "a cell survived under Seeds").toBe(false);
  });

  it("T3322 every rule in the library parses, and its notation is what it claims", () => {
    for (const entry of RULE_LIBRARY) {
      const r = parseRule(entry.notation);
      expect(r, `${entry.name} (${entry.notation})`).not.toBeNull();
      expect(formatRule(ruleFor(entry)), entry.name).toBe(entry.notation);
      expect(entry.note.length, `${entry.name} has no note`).toBeGreaterThan(20);
    }
    expect(RULE_LIBRARY[0].notation, "Conway's Life should be first").toBe("B3/S23");
  });

  it("T3323 the rules panel describes the ACTIVE rule, not a hard-coded one", () => {
    // A panel that explains Conway while the engine runs HighLife is the quiet
    // wrongness that writing the explanation out by hand invites.
    const conway = describeRule(CONWAY).map((r) => r.when).join(" ");
    const high = describeRule(parseRule("B36/S23")!).map((r) => r.when).join(" ");
    expect(conway).toContain("exactly 3");
    expect(high).toContain("3 or 6");
    expect(conway).not.toEqual(high);
  });
});
