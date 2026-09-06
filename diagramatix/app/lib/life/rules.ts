/**
 * Life-LIKE rules, in B/S notation.
 *
 * Paul, 2026-09-06: "I would strongly recommend making the rule user-
 * configurable rather than hard-coding B3/S23… That tiny design decision lets
 * your program simulate a huge range of 'Life-like' cellular automata."
 *
 * He is right, and it is a smaller change than it looks: the whole of Conway's
 * Life is the two sets below. Everything else in the engine — the sparse grid,
 * the neighbour tally, the cycle detection — is indifferent to which numbers are
 * in them.
 *
 * The notation is the standard one. `B3/S23` reads "a dead cell is BORN with
 * exactly 3 live neighbours; a live cell SURVIVES with 2 or 3". A rule with an
 * empty survival set (`B2/S`) is legal and means nothing ever survives a
 * generation — Seeds, which is why it is so explosive.
 */

export interface Rule {
  /** Neighbour counts at which a DEAD cell becomes live. */
  birth: ReadonlySet<number>;
  /** Neighbour counts at which a LIVE cell stays live. */
  survive: ReadonlySet<number>;
}

export const CONWAY: Rule = { birth: new Set([3]), survive: new Set([2, 3]) };

/** "B36/S23" → the rule. Returns null for anything that is not B/S notation. */
export function parseRule(text: string): Rule | null {
  const m = /^\s*[Bb]([0-8]*)\s*\/\s*[Ss]([0-8]*)\s*$/.exec(text);
  if (!m) return null;
  const digits = (s: string) => new Set([...s].map(Number));
  // A repeated digit is a typo, not a different rule, so it collapses silently —
  // but 9 or a letter is a different rule the user did not get, so it is refused
  // above rather than quietly dropped.
  return { birth: digits(m[1]), survive: digits(m[2]) };
}

export function formatRule(rule: Rule): string {
  const s = (xs: ReadonlySet<number>) => [...xs].sort((a, b) => a - b).join("");
  return `B${s(rule.birth)}/S${s(rule.survive)}`;
}

export const isConway = (rule: Rule) => formatRule(rule) === "B3/S23";

export interface NamedRule {
  name: string;
  notation: string;
  /** What makes it worth trying — Paul's own words where he gave them. */
  note: string;
}

/**
 * The catalogue. Paul's seven, plus a few that are famous enough that their
 * absence would be noticed.
 *
 * Ordered roughly by how far each departs from Conway, so reading down the list
 * is itself informative: HighLife differs by a single birth condition and
 * behaves substantially differently, which is the point worth making first.
 */
export const RULE_LIBRARY: NamedRule[] = [
  { name: "Conway's Life", notation: "B3/S23",
    note: "The original. Every pattern in the library below is described under this rule; the others will do something, but not the documented thing." },
  { name: "HighLife", notation: "B36/S23",
    note: "Conway's Life plus one condition — birth on six neighbours — and the behaviour changes substantially. It famously supports a REPLICATOR, a pattern that copies itself." },
  { name: "Day & Night", notation: "B3678/S34678",
    note: "Symmetric under swapping live and dead: a pattern and its photographic negative behave alike. Supports complex moving structures." },
  { name: "Seeds", notation: "B2/S",
    note: "A dead cell is born with exactly two neighbours and NOTHING survives — every generation is entirely new. Explosive, chaotic growth." },
  { name: "Life Without Death", notation: "B3/S012345678",
    note: "Once a cell is alive it never dies. Produces branching, maze-like growth that only ever expands." },
  { name: "34 Life", notation: "B34/S34",
    note: "Birth and survival both on three or four. Quite different oscillators and spaceships from Conway's." },
  { name: "Maze", notation: "B3/S12345",
    note: "Grows maze-like walls and corridors out of almost any starting blob." },
  { name: "Mazectric", notation: "B3/S1234",
    note: "Maze with one fewer survival condition, which produces thinner, cleaner corridors." },
  { name: "Replicator", notation: "B1357/S1357",
    note: "Every pattern is a replicator: whatever you draw copies itself endlessly in a fractal arrangement." },
  { name: "Diamoeba", notation: "B35678/S5678",
    note: "Large diamond-shaped blobs with churning, unstable edges. Whether it grows or dies is famously hard to predict." },
  { name: "2×2", notation: "B36/S125",
    note: "Preserves the block structure of a 2×2 grid, and supports its own family of spaceships and oscillators." },
  { name: "Anneal", notation: "B4678/S35678",
    note: "A majority-vote rule: regions smooth out and coarsen, like domains annealing in a metal." },
];

/** The rule the library entry names, or Conway if the notation is somehow bad. */
export function ruleFor(entry: NamedRule): Rule {
  return parseRule(entry.notation) ?? CONWAY;
}

/**
 * The active rule, in the words the screen shows.
 *
 * Generated from the rule rather than written out, so the panel cannot describe
 * Conway while the engine runs HighLife — which is exactly the class of quiet
 * wrongness a hard-coded explanation invites.
 */
export function describeRule(rule: Rule): { n: number; when: string; then: string; name: string }[] {
  const list = (xs: ReadonlySet<number>) => {
    const v = [...xs].sort((a, b) => a - b);
    if (v.length === 0) return "no number of";
    if (v.length === 1) return `exactly ${v[0]}`;
    return `${v.slice(0, -1).join(", ")} or ${v[v.length - 1]}`;
  };
  const dies = [...Array(9).keys()].filter((n) => !rule.survive.has(n));
  return [
    { n: 1, when: `A live cell with ${list(rule.survive)} live neighbour(s)`, then: "lives on", name: "survival" },
    { n: 2, when: `A live cell with ${list(new Set(dies))} live neighbour(s)`, then: "dies", name: "under- or overpopulation" },
    { n: 3, when: `A dead cell with ${list(rule.birth)} live neighbour(s)`, then: "becomes live", name: "birth" },
    { n: 4, when: "Every cell changes at the same instant", then: "on the generation it was counted for", name: "simultaneity" },
  ];
}
