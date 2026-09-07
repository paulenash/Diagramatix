/**
 * Rules for the cubic lattice.
 *
 * Paul, 2026-09-07: "Why not simply use Conway's B3/S23? You can, but it behaves
 * very differently. With 26 possible neighbours, B3/S23 is much too permissive:
 * random configurations tend to expand explosively… Carter Bays' studies found
 * that rules allowing birth with four or fewer neighbours generally suffer this
 * sort of rapid expansion."
 *
 * WHY THE NOTATION NEEDS ITS OWN PARSER. In two dimensions the counts run 0–8,
 * so every character of "B3/S23" is a count and reading it character by
 * character is exact. On a cubic lattice they run 0–26, and "S1" then cannot be
 * told from the start of "S12". So this parser takes ranges and lists as well —
 * `B6/S5-7`, `B6/S5,6,7`, `B12,14/S10-16` — and only falls back to
 * character-by-character when every character is a digit and no separator
 * appears, which keeps Bays' own `B6/S567` readable exactly as he wrote it.
 */
import type { Rule } from "./rules";

export interface Named3dRule {
  name: string;
  notation: string;
  note: string;
}

/**
 * Bays' rules, and Conway's for comparison.
 *
 * B6/S567 leads because it is the one Bays identified as behaving like Life:
 * "including moving structures analogous to gliders", which was his test for
 * whether a 3-D rule deserved the name at all.
 */
export const RULE_3D_LIBRARY: Named3dRule[] = [
  { name: "Bays 6/567", notation: "B6/S567",
    note: "Carter Bays' closest analogue of Conway's Life on a cubic lattice: it settles into a mixture of extinction, still objects and oscillators, and it produces gliders — which was his test for whether a 3-D rule deserved the name." },
  { name: "Bays 5/45", notation: "B5/S45",
    note: "Another of Bays' rules with known patterns and known spaceships. Quieter than 6/567 — more of a soup dies out." },
  { name: "Bays 5/56", notation: "B5/S56",
    note: "Birth on five, survival on five or six. Known gliders." },
  { name: "Bays 67/67", notation: "B67/S67",
    note: "Birth on six or seven, survival on the same. The tightest of the four, and the most likely to leave nothing behind." },
  { name: "Conway's, unchanged", notation: "B3/S23",
    note: "The 2-D rule applied to 26 neighbours, kept so the difference can be SEEN rather than taken on trust. Birth on three of twenty-six is far too permissive: a soup expands explosively instead of settling. Bays found that anything born on four or fewer does this." },
];

/**
 * "B6/S567", "B6/S5-7", "B12,14/S10-16" → the rule. Null for anything else.
 *
 * Counts above 26 are refused rather than clamped: a rule naming a neighbour
 * count that cannot occur is a typo, and accepting it silently would produce a
 * universe that quietly ignores half of what was asked for.
 */
export function parseRule3d(text: string): Rule | null {
  const m = /^\s*[Bb]([0-9,\-\s]*)\/\s*[Ss]([0-9,\-\s]*)\s*$/.exec(text);
  if (!m) return null;
  const side = (raw: string): Set<number> | null => {
    const s = raw.trim();
    if (s === "") return new Set();
    // Digits only, no separator: read it the 2-D way, so B6/S567 means 5, 6, 7.
    if (/^[0-9]+$/.test(s)) return new Set([...s].map(Number));
    const out = new Set<number>();
    for (const part of s.split(",").map((p) => p.trim()).filter(Boolean)) {
      const range = /^([0-9]+)\s*-\s*([0-9]+)$/.exec(part);
      if (range) {
        const a = Number(range[1]), b = Number(range[2]);
        if (a > b || b > 26) return null;
        for (let i = a; i <= b; i++) out.add(i);
        continue;
      }
      if (!/^[0-9]+$/.test(part)) return null;
      const n = Number(part);
      if (n > 26) return null;
      out.add(n);
    }
    return out;
  };
  const birth = side(m[1]), survive = side(m[2]);
  if (!birth || !survive) return null;
  return { birth, survive };
}

/** Always as a comma list, because "5,6,7" cannot be misread and "567" can. */
export function formatRule3d(rule: Rule): string {
  const list = (xs: ReadonlySet<number>) => [...xs].sort((a, b) => a - b).join(",");
  return `B${list(rule.birth)}/S${list(rule.survive)}`;
}

/** True when the two rules are the same set of counts, however each was written. */
export function sameRule3d(a: Rule, b: Rule): boolean {
  return formatRule3d(a) === formatRule3d(b);
}

export function rule3dFor(entry: Named3dRule): Rule {
  return parseRule3d(entry.notation) ?? { birth: new Set([6]), survive: new Set([5, 6, 7]) };
}

export const BAYS_6567: Rule = { birth: new Set([6]), survive: new Set([5, 6, 7]) };

/** The rule in the words the screen shows, generated so it cannot go stale. */
export function describeRule3d(rule: Rule, neighbours: number): { n: number; when: string; then: string }[] {
  const list = (xs: ReadonlySet<number>) => {
    const v = [...xs].sort((a, b) => a - b);
    if (v.length === 0) return "no number of";
    if (v.length === 1) return `exactly ${v[0]}`;
    // Contiguous runs read far better than a list once the counts get long.
    const runs: string[] = [];
    let i = 0;
    while (i < v.length) {
      let j = i;
      while (j + 1 < v.length && v[j + 1] === v[j] + 1) j++;
      runs.push(j > i + 1 ? `${v[i]}–${v[j]}` : v.slice(i, j + 1).join(" or "));
      i = j + 1;
    }
    return runs.join(", ");
  };
  return [
    { n: 1, when: `A live cube with ${list(rule.survive)} live neighbours`, then: "lives on" },
    { n: 2, when: "A live cube with any other number", then: "dies" },
    { n: 3, when: `A dead cube with ${list(rule.birth)} live neighbours`, then: "becomes live" },
    { n: 4, when: `Each cube has ${neighbours} neighbours`, then: neighbours === 26 ? "— 6 by face, 12 by edge, 8 by corner" : "— the six that share a face" },
  ];
}
