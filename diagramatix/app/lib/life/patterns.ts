/**
 * The pattern library.
 *
 * Paul, 2026-09-06, gave both the starter catalogue and the categories:
 * "Still lifes — block, boat, beehive, loaf, tub. Oscillators — blinker, toad,
 * beacon, pulsar, pentadecathlon. Spaceships — glider, LWSS, MWSS, HWSS.
 * Methuselahs — R-pentomino, acorn, rabbits, thunderbird. Guns — Gosper glider
 * gun… Puffers — moving objects that leave debris behind."
 *
 * Every pattern is written as ASCII art, because that is how they are published
 * and how a reader checks one against a reference. `O` is live, anything else is
 * dead. Getting a single cell wrong turns the R-pentomino into something that
 * dies in twenty generations, so the tests assert the documented BEHAVIOUR —
 * 1,103 generations, 5,206, dies at 130 — rather than the cell counts. A typo
 * cannot survive that.
 *
 * The behaviour described is under CONWAY'S RULE. Under HighLife or Seeds these
 * shapes will do something, but not this.
 */

export type PatternCategory =
  | "still-life" | "oscillator" | "spaceship" | "methuselah" | "gun" | "puffer";

export interface LifePattern {
  id: string;
  name: string;
  category: PatternCategory;
  /** What it does, in one line, for the picker. */
  behaviour: string;
  /** Rows of ASCII art; `O` is a live cell. */
  art: string[];
}

export const CATEGORY_LABEL: Record<PatternCategory, string> = {
  "still-life": "Still lifes",
  oscillator: "Oscillators",
  spaceship: "Spaceships",
  methuselah: "Methuselahs",
  gun: "Guns",
  puffer: "Puffers",
};

export const CATEGORY_NOTE: Record<PatternCategory, string> = {
  "still-life": "Never change at all.",
  oscillator: "Return to their starting shape after a fixed number of generations.",
  spaceship: "Return to their starting shape, displaced — so Life can carry information across the grid.",
  methuselah: "A handful of cells that take an extraordinarily long time to settle.",
  gun: "Never settle: they manufacture spaceships forever, which is how a Life population can grow without bound.",
  puffer: "Travel, leaving debris behind them.",
};

export const LIFE_PATTERNS: LifePattern[] = [
  // ── Still lifes ──────────────────────────────────────────────────────────
  { id: "block", name: "Block", category: "still-life", behaviour: "The simplest still life. Nothing ever happens to it.",
    art: ["OO", "OO"] },
  { id: "beehive", name: "Beehive", category: "still-life", behaviour: "Still life. One of the commonest things left behind when chaos settles down.",
    art: [".OO.", "O..O", ".OO."] },
  { id: "loaf", name: "Loaf", category: "still-life", behaviour: "Still life. Asymmetric, unlike most of the common ones.",
    art: [".OO.", "O..O", ".O.O", "..O."] },
  { id: "boat", name: "Boat", category: "still-life", behaviour: "Still life. The smallest one that is not just a block.",
    art: ["OO.", "O.O", ".O."] },
  { id: "tub", name: "Tub", category: "still-life", behaviour: "Still life — the smallest with a hole.",
    art: [".O.", "O.O", ".O."] },
  { id: "pond", name: "Pond", category: "still-life", behaviour: "Still life. Eight cells around a two-by-two hole.",
    art: [".OO.", "O..O", "O..O", ".OO."] },
  { id: "ship", name: "Ship", category: "still-life", behaviour: "Still life. A boat with both corners filled.",
    art: ["OO.", "O.O", ".OO"] },
  { id: "barge", name: "Barge", category: "still-life", behaviour: "Still life. A longer tub — the family extends indefinitely.",
    art: [".O..", "O.O.", ".O.O", "..O."] },
  { id: "long-barge", name: "Long barge", category: "still-life", behaviour: "Still life. The barge, one link longer.",
    art: [".O...", "O.O..", ".O.O.", "..O.O", "...O."] },
  { id: "long-boat", name: "Long boat", category: "still-life", behaviour: "Still life. The boat, stretched.",
    art: [".O..", "O.O.", ".O.O", "..OO"] },
  { id: "snake", name: "Snake", category: "still-life", behaviour: "Still life. Six cells in the smallest possible bounding box for a still life of its length.",
    art: ["OO.O", "O.OO"] },
  { id: "carrier", name: "Aircraft carrier", category: "still-life", behaviour: "Still life. Two dominoes at an angle.",
    art: ["OO..", "O..O", "..OO"] },
  { id: "mango", name: "Mango", category: "still-life", behaviour: "Still life. A stretched beehive.",
    art: [".OO..", "O..O.", ".O..O", "..OO."] },
  { id: "hat", name: "Hat", category: "still-life", behaviour: "Still life. Nine cells, and one of the few common ones with a flat base.",
    art: ["..O..", ".O.O.", ".O.O.", "OO.OO"] },
  { id: "eater", name: "Eater (fishhook)", category: "still-life", behaviour: "Still life — and it EATS. A glider that runs into it is absorbed and the eater is unharmed, which is how Life patterns are stopped on purpose.",
    art: ["OO..", "O.O.", "..O.", "..OO"] },

  // ── Oscillators ──────────────────────────────────────────────────────────
  { id: "blinker", name: "Blinker", category: "oscillator", behaviour: "Period 2. The simplest oscillator: a row of three becomes a column of three, and back.",
    art: ["OOO"] },
  { id: "toad", name: "Toad", category: "oscillator", behaviour: "Period 2. Two rows of three, offset, that shuffle back and forth.",
    art: [".OOO", "OOO."] },
  { id: "beacon", name: "Beacon", category: "oscillator", behaviour: "Period 2. Two blocks corner to corner, whose facing corners blink on and off.",
    art: ["OO..", "OO..", "..OO", "..OO"] },
  { id: "pulsar", name: "Pulsar", category: "oscillator", behaviour: "Period 3. One of the classic large oscillators, and very visually striking.",
    art: [
      "..OOO...OOO..",
      ".............",
      "O....O.O....O",
      "O....O.O....O",
      "O....O.O....O",
      "..OOO...OOO..",
      ".............",
      "..OOO...OOO..",
      "O....O.O....O",
      "O....O.O....O",
      "O....O.O....O",
      ".............",
      "..OOO...OOO..",
    ] },
  { id: "pentadecathlon", name: "Pentadecathlon", category: "oscillator", behaviour: "Period 15 — the longest period of any small oscillator.",
    art: [
      "..O....O..",
      "OO.OOOO.OO",
      "..O....O..",
    ] },
  { id: "clock", name: "Clock", category: "oscillator", behaviour: "Period 2. Four cells that rock about a hollow centre.",
    art: ["..O.", "O.O.", ".O.O", ".O.."] },
  { id: "traffic-light", name: "Traffic light", category: "oscillator", behaviour: "Period 2. Four blinkers around a gap — the thing a great many chaotic starts eventually decay into.",
    art: [
      "...OOO...",
      ".........",
      "O.......O",
      "O.......O",
      "O.......O",
      ".........",
      "...OOO...",
    ] },
  { id: "octagon", name: "Octagon 2", category: "oscillator", behaviour: "Period 5. An octagon that breathes in and out.",
    art: [
      "...OO...",
      "..O..O..",
      ".O....O.",
      "O......O",
      "O......O",
      ".O....O.",
      "..O..O..",
      "...OO...",
    ] },
  { id: "figure-eight", name: "Figure eight", category: "oscillator", behaviour: "Period 8. Two blocks that trade places diagonally, over and over.",
    art: ["OOO...", "OOO...", "OOO...", "...OOO", "...OOO", "...OOO"] },
  { id: "queen-bee-shuttle", name: "Queen bee shuttle", category: "oscillator", behaviour: "Period 30. A queen bee runs between two blocks and turns round. Put two of these back to back and you have the Gosper glider gun — this is the part it is built from.",
    art: [
      ".........O............",
      ".......O.O............",
      "......O.O.............",
      "OO...O..O...........OO",
      "OO....O.O...........OO",
      ".......O.O............",
      ".........O............",
    ] },

  // ── Spaceships ───────────────────────────────────────────────────────────
  { id: "glider", name: "Glider", category: "spaceship", behaviour: "Moves one square diagonally every 4 generations. Probably the most famous Life object — it is how Life transmits information across the grid.",
    art: [".O.", "..O", "OOO"] },
  { id: "lwss", name: "Lightweight spaceship (LWSS)", category: "spaceship", behaviour: "Moves two squares horizontally every 4 generations.",
    art: ["O..O.", "....O", "O...O", ".OOOO"] },
  { id: "mwss", name: "Middleweight spaceship (MWSS)", category: "spaceship", behaviour: "Moves two squares horizontally every 4 generations.",
    art: ["..O...", "O...O.", ".....O", "O....O", ".OOOOO"] },
  { id: "hwss", name: "Heavyweight spaceship (HWSS)", category: "spaceship", behaviour: "Moves two squares horizontally every 4 generations.",
    art: ["..OO...", "O....O.", "......O", "O.....O", ".OOOOOO"] },
  { id: "copperhead", name: "Copperhead", category: "spaceship", behaviour: "Moves ONE square every 10 generations — far slower than the classic ships, and only discovered in 2016, half a century after the glider.",
    art: [
      ".OO..OO.", "...OO...", "...OO...", "O.O..O.O", "O......O", "........",
      "O......O", ".OO..OO.", "..OOOO..", "........", "...OO...", "...OO...",
    ] },

  // ── Methuselahs ──────────────────────────────────────────────────────────
  { id: "r-pentomino", name: "R-pentomino", category: "methuselah", behaviour: "Five cells that run for 1,103 generations before settling. Historically one of the patterns that showed how unpredictable Life could be.",
    art: [".OO", "OO.", ".O."] },
  { id: "acorn", name: "Acorn", category: "methuselah", behaviour: "Seven cells that take 5,206 generations to settle. The best pattern for testing a simulator — a tiny start becomes a very large population.",
    art: [".O.....", "...O...", "OO..OOO"] },
  { id: "diehard", name: "Diehard", category: "methuselah", behaviour: "Survives 130 generations and then vanishes completely.",
    art: ["......O.", "OO......", ".O...OOO"] },
  { id: "thunderbird", name: "Thunderbird", category: "methuselah", behaviour: "Three bars whose population finally settles at generation 242.",
    art: ["OOO", "...", ".O.", ".O.", ".O."] },
  { id: "century", name: "Century", category: "methuselah", behaviour: "Six cells that settle at generation 103 — which is where the name comes from.",
    art: ["..OO", "OOO.", ".O.."] },
  { id: "herschel", name: "Herschel", category: "methuselah", behaviour: "Seven cells, settling at generation 128. It turns up constantly inside larger patterns, and whole engineering conventions are built around routing it.",
    art: ["O..", "OOO", "O.O", "..O"] },
  { id: "b-heptomino", name: "B-heptomino", category: "methuselah", behaviour: "Seven cells that settle at generation 148. Another shape that appears again and again as debris inside bigger reactions.",
    art: ["O.OO", "OOO.", ".O.."] },
  { id: "pi-heptomino", name: "Pi-heptomino", category: "methuselah", behaviour: "Seven cells in the shape of a pi, settling at generation 173.",
    art: ["OOO", "O.O", "O.O"] },
  { id: "rabbits", name: "Rabbits", category: "methuselah", behaviour: "Nine cells — and 17,332 generations before the population stops changing, far longer than the acorn. Running this one out takes a moment.",
    art: ["O.....O.", "..O...O.", "..O..O.O", ".O.O...."] },

  // ── Guns ─────────────────────────────────────────────────────────────────
  { id: "gosper-gun", name: "Gosper glider gun", category: "gun", behaviour: "Emits a new glider every 30 generations, forever. Its discovery proved that a Life population can grow without bound.",
    art: [
      "........................O...........",
      "......................O.O...........",
      "............OO......OO............OO",
      "...........O...O....OO............OO",
      "OO........O.....O...OO..............",
      "OO........O...O.OO....O.O...........",
      "..........O.....O.......O...........",
      "...........O...O....................",
      "............OO......................",
    ] },

  // ── Puffers ──────────────────────────────────────────────────────────────
  { id: "switch-engine", name: "Switch engine", category: "puffer", behaviour: "Travels diagonally forever, leaving a permanent trail of debris behind it — so the pattern grows without bound while its moving part stays the same size.",
    art: [
      "..........O.O..",
      ".........O.....",
      "..........O..O.",
      "..........OOO..",
      "...............",
      "...............",
      "...............",
      "O..............",
      "OOO............",
    ] },
];

export const PATTERN_ORDER: PatternCategory[] =
  ["still-life", "oscillator", "spaceship", "methuselah", "gun", "puffer"];

/** ASCII art → coordinates, with (0,0) at the top-left of the art. */
export function artToCoords(art: string[]): [number, number][] {
  const out: [number, number][] = [];
  art.forEach((row, y) => {
    [...row].forEach((ch, x) => { if (ch === "O" || ch === "o" || ch === "#" || ch === "*") out.push([x, y]); });
  });
  return out;
}

export const patternSize = (p: LifePattern) => ({
  width: Math.max(...p.art.map((r) => r.length)),
  height: p.art.length,
});

export const patternById = (id: string) => LIFE_PATTERNS.find((p) => p.id === id);
