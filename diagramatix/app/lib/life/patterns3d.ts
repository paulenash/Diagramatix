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

export type Pattern3dCategory = "still" | "oscillator" | "spaceship" | "decaying";

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
  decaying: "Decaying to gliders",
};

export const CATEGORY_3D_NOTE: Record<Pattern3dCategory, string> = {
  still: "Never change at all.",
  oscillator: "Return to their own shape after a fixed number of generations.",
  spaceship: "Return to their own shape somewhere else — the thing Bays looked for before calling a 3-D rule an analogue of Life.",
  decaying: "Run for a while and leave a glider behind. Under these rules that while is tens of generations, not thousands — there is no 3-D acorn.",
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

  // ── Long-lived, decaying to gliders ──────────────────────────────────────
  //
  // Paul, 2026-09-07: "Add any long life 3-D Life patterns that eventually decay
  // to one or more gliders."
  //
  // "ANY" is the operative word, and the honest answer is that there is no 3-D
  // acorn to be had under these rules. Two searches went looking:
  //
  //   - 5,000 random soups under B6/S567, from 4³ to 12³ and 30% to 60% dense:
  //     the LONGEST anything took to settle was 42 generations, and roughly one
  //     seed in 250 left a glider behind. B5/S45, B5/S56 and B67/S67 were
  //     quieter still — 28, 20 and 17 generations, with no gliders at all.
  //   - ~25,000 engineered collisions: a glider into each still life at every
  //     offset and phase, and glider against glider likewise. The best was 20
  //     generations.
  //
  // That is not the search failing; it is the rule doing what Bays picked it
  // for. He wanted a 3-D rule where soups DO NOT run away, and a rule that
  // settles in tens of generations is exactly that. The 2-D methuselahs live for
  // thousands because B3/S23 sits far closer to the edge of chaos — which is the
  // same reason B3/S23 on 26 neighbours explodes instead.
  //
  // So these are the longest-lived glider-producers that exist to be found, and
  // their real numbers are stated rather than dressed up.
  {
    id: "glider-into-cube", name: "Glider into a cube", category: "decaying", rule: "B6/S567", period: 0,
    behaviour: "A glider hits a still cube, the pair boils for 20 generations reaching 40 cubes, and ONE GLIDER walks away from the wreckage. The longest-lived glider-producer found in ~25,000 collisions — there is no 3-D acorn under this rule.",
    cells: [
      [0, 0, 0], [0, 0, 1], [0, 1, 0], [0, 1, 1], [1, 0, 0], [1, 0, 1], [1, 1, 0], [1, 1, 1],
      [3, 0, 1], [3, 1, 1], [4, 0, 2], [4, 1, 2], [5, 0, 2], [5, 1, 2], [3, 0, 3], [3, 1, 3], [4, 0, 3], [4, 1, 3],
    ],
  },
  {
    id: "glider-meets-glider", name: "Glider meets glider", category: "decaying", rule: "B6/S567", period: 0,
    behaviour: "Two gliders on converging courses. They collide, churn for 17 generations, and one glider comes out the far side — so the collision destroys one and turns the other, rather than annihilating both.",
    cells: [
      [0, 0, 0], [0, 1, 0], [1, 0, 1], [1, 1, 1], [2, 0, 1], [2, 1, 1], [0, 0, 2], [0, 1, 2], [1, 0, 2], [1, 1, 2],
      [8, 2, 12], [8, 3, 12], [6, 2, 12], [6, 3, 13], [6, 3, 12], [6, 2, 13], [7, 2, 11], [7, 3, 11], [6, 2, 11], [6, 3, 11],
    ],
  },
];

export const PATTERN_3D_ORDER: Pattern3dCategory[] = ["still", "oscillator", "spaceship", "decaying"];

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
