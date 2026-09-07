/**
 * The 3-D pattern library — every entry FOUND by running the rule, not recalled.
 *
 * The 2-D library could be transcribed from published ASCII art and then checked
 * against published figures: the R-pentomino's 1,103 generations, the acorn's
 * 5,206. A typo could not survive that. Nothing equivalent is available here —
 * Bays' patterns are coordinate lists in papers, and a half-remembered
 * coordinate list is exactly how a library ends up full of shapes that die in
 * four generations while claiming to be gliders.
 *
 * So `scripts/find-3d-life-patterns.ts` searched for them: random small seeds
 * run under each rule and classified by what they actually did. Everything below
 * came out of that search, and its period and displacement are the MEASURED
 * ones. Nothing here is claimed that was not seen.
 *
 * That search is also the answer to the question Bays used to judge a 3-D rule.
 * Under B6/S567 it found gliders — ten cubes returning to their own shape one
 * step along a diagonal every four generations — which is what earns that rule
 * the name of Life. Under B5/S45 it found them too. Under B5/S56 and B67/S67 it
 * found none, which is reported as "none found", not "none exist".
 */

export type Pattern3dCategory = "still" | "oscillator" | "spaceship";

export interface Life3dPattern {
  id: string;
  name: string;
  category: Pattern3dCategory;
  /** The rule it was found under, and the only one it is described for. */
  rule: string;
  /** What it does, in one line — every number here was measured. */
  behaviour: string;
  cells: [number, number, number][];
  /** Measured period: 1 for a still life, n for an oscillator or spaceship. */
  period: number;
  /** How far a spaceship travels in one period. */
  displacement?: [number, number, number];
}

export const CATEGORY_3D_LABEL: Record<Pattern3dCategory, string> = {
  still: "Still lifes",
  oscillator: "Oscillators",
  spaceship: "Gliders",
};

export const CATEGORY_3D_NOTE: Record<Pattern3dCategory, string> = {
  still: "Never change at all.",
  oscillator: "Return to their own shape after a fixed number of generations.",
  spaceship: "Return to their own shape somewhere else — the thing Bays looked for before calling a 3-D rule an analogue of Life.",
};

export const LIFE_3D_PATTERNS: Life3dPattern[] = [
  // ── B6/S567, Bays' analogue of Life ───────────────────────────────────────
  {
    id: "cube", name: "Cube", category: "still", rule: "B6/S567", period: 1,
    behaviour: "A solid 2×2×2 block. Every cube in it touches exactly seven others, and seven is a survival count — so nothing ever happens to it. The 3-D block.",
    cells: [[0, 0, 0], [0, 0, 1], [0, 1, 0], [0, 1, 1], [1, 0, 0], [1, 0, 1], [1, 1, 0], [1, 1, 1]],
  },
  {
    id: "chipped-cube", name: "Chipped cube", category: "still", rule: "B6/S567", period: 1,
    behaviour: "The 2×2×2 cube with one corner missing — and it stays missing. The empty corner has only seven live neighbours, one short of nothing, and birth needs exactly six.",
    cells: [[0, 0, 0], [0, 0, 1], [0, 1, 0], [0, 1, 1], [1, 0, 0], [1, 0, 1], [1, 1, 1]],
  },
  {
    id: "slab", name: "Slab", category: "oscillator", rule: "B6/S567", period: 2,
    behaviour: "Period 2. A flat 3×2 plate that thickens into the third dimension and back — the closest thing here to a blinker.",
    cells: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 1, 0], [1, 1, 0], [2, 1, 0]],
  },
  {
    id: "cross", name: "Cross", category: "oscillator", rule: "B6/S567", period: 2,
    behaviour: "Period 2. Eight cubes in a 2×3×3 arrangement that pulses.",
    cells: [[0, 0, 0], [0, 0, 1], [0, 0, 2], [0, 1, 0], [0, 1, 2], [0, 2, 1], [1, 0, 1], [1, 1, 1]],
  },
  {
    id: "glider", name: "Glider", category: "spaceship", rule: "B6/S567", period: 4,
    displacement: [1, 0, 1],
    behaviour: "Ten cubes that return to their own shape one step along a diagonal every 4 generations — travelling through the volume rather than across a plane. This is the object that earns B6/S567 the name of Life.",
    cells: [
      [0, 0, 0], [0, 1, 0],
      [1, 0, 1], [1, 1, 1], [2, 0, 1], [2, 1, 1],
      [0, 0, 2], [0, 1, 2], [1, 0, 2], [1, 1, 2],
    ],
  },

  // ── B5/S45, which also has gliders ───────────────────────────────────────
  {
    id: "glider-b545", name: "Glider (B5/S45)", category: "spaceship", rule: "B5/S45", period: 4,
    displacement: [-1, 1, 0],
    behaviour: "Ten cubes, period 4, under a different rule — proof the first glider was not a fluke of one universe. Switch the rule to B5/S45 to see it fly.",
    cells: [
      [0, 0, 1], [0, 0, 2], [1, 0, 0], [2, 0, 0],
      [1, 1, 1], [1, 1, 2], [2, 1, 1], [2, 1, 2],
      [1, 0, 3], [2, 0, 3],
    ],
  },
];

export const PATTERN_3D_ORDER: Pattern3dCategory[] = ["still", "oscillator", "spaceship"];

export const pattern3dById = (id: string) => LIFE_3D_PATTERNS.find((p) => p.id === id);

export function pattern3dSize(p: Life3dPattern) {
  const max = (i: 0 | 1 | 2) => Math.max(...p.cells.map((c) => c[i])) + 1;
  return { width: max(0), height: max(1), depth: max(2) };
}

/**
 * A random soup, for the experiment Bays' criterion is really about.
 *
 * "Random configurations tend to expand explosively rather than producing the
 * balanced mixture of extinction, stable objects, oscillators and moving objects
 * familiar from Conway Life." That is a claim about SOUPS, so the screen offers
 * one: fill a small box at random, run it, and watch B6/S567 settle where
 * B3/S23 runs away.
 */
export function randomSoup3(box: number, fill = 0.4): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let x = 0; x < box; x++) {
    for (let y = 0; y < box; y++) {
      for (let z = 0; z < box; z++) {
        if (Math.random() < fill) out.push([x, y, z]);
      }
    }
  }
  return out;
}
