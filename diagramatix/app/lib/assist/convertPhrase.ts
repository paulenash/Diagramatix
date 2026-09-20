/**
 * M3 — "make this a user task", "make the selected gateway parallel".
 *
 * The right-click menu already offers every one of these conversions; all that
 * was missing was a way to say it. So this module does one job: turn a spoken
 * subtype phrase into the same `{ propKey, value }` pair the menu writes,
 * reading the SAME table the menu reads (`elementSubtypes.ts`) so the two
 * cannot drift.
 *
 * WHAT COUNTS AS A MATCH. Each option is reachable by its label ("business
 * rule", "event-based"), by its value ("business-rule", "mi-parallel"), and by
 * either of those followed by the group's noun ("user task", "parallel
 * gateway", "timer event"). The noun is what makes a bare word safe: "parallel"
 * alone is both a gateway type and a multi-instance marker, so a bare word that
 * lands in more than one group is reported as AMBIGUOUS rather than guessed —
 * the same discipline the reference resolver uses. Say "a parallel gateway" and
 * there is nothing to guess.
 *
 * WHAT IS NOT HERE. Changing a task INTO a gateway is a different operation —
 * it replaces the shape, has its own reducer actions, and would silently drop
 * properties. This module only sets a marker on an element that already has
 * the right shape; asking for the other thing is refused by name, which is
 * more useful than doing something adjacent.
 *
 * Pure.
 */
import { SUBTYPE_GROUPS, type SubtypeGroup } from "../diagram/elementSubtypes";

export interface ConvertMatch {
  /** The element property to write — the menu's `propKey`. */
  propKey: string;
  /** The value to write. */
  value: string;
  /** Human label, for the log line. */
  label: string;
  /** Element types this conversion is legal on. */
  appliesTo: readonly string[];
  /** What to call it when several matched: "user task", "parallel gateway". */
  phrase: string;
}

const norm = (s: string) =>
  s.toLowerCase()
    .replace(/[×○+⬠]/g, " ")          // the menu's glyphs are decoration
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/[-\s]+/g, " ")
    .trim();

/** "Event-based ⬠" → "event based"; "business-rule" → "business rule". */
const spokenForms = (opt: { value: string; label: string }): string[] => {
  const forms = new Set<string>([norm(opt.label), norm(opt.value)]);
  // "MI Parallel" is read out as "multi instance parallel" at least as often.
  if (opt.value.startsWith("mi-")) {
    forms.add(`multi instance ${norm(opt.value.slice(3))}`);
    forms.add(`multiple instance ${norm(opt.value.slice(3))}`);
  }
  forms.delete("");
  return [...forms];
};

const nounForms = (g: SubtypeGroup): string[] => g.nouns.map(norm).filter(Boolean);

/**
 * Every conversion a phrase could mean. Empty when nothing matched; more than
 * one when the phrase is genuinely ambiguous and the caller should ask.
 *
 * "None" options are reachable only WITH the noun ("make this a plain task"),
 * because a bare "none" is not something anyone says on purpose.
 */
export function convertMatches(spoken: string): ConvertMatch[] {
  const s = norm(spoken).replace(/^(?:a|an|the)\s+/, "");
  if (!s) return [];

  const out: ConvertMatch[] = [];
  for (const g of SUBTYPE_GROUPS) {
    const nouns = nounForms(g);
    for (const opt of g.opts) {
      for (const form of spokenForms(opt)) {
        const withNoun = nouns.some((n) => s === `${form} ${n}` || s === `${n} ${form}`);
        // "plain task" / "no marker" reads better than "none task".
        const plain = nouns.some((n) => s === `plain ${n}` || s === `normal ${n}`);
        const bare = s === form;
        if (!withNoun && !bare && !(opt.value === "none" && plain)) continue;
        if (opt.value === "none" && bare) continue;   // a bare "none" is never meant
        out.push({
          propKey: g.propKey, value: opt.value, label: opt.label,
          appliesTo: g.appliesTo,
          phrase: `${form}${nouns[0] ? ` ${nouns[0]}` : ""}`,
        });
      }
    }
  }
  // The same phrase can reach one group twice (a label and a value that
  // normalise alike). Keep one row per destination.
  const seen = new Set<string>();
  return out.filter((m) => {
    const k = `${m.propKey}:${m.value}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Narrow the matches to those legal on `elementType`.
 *
 * Returned separately from `convertMatches` so the caller can tell "I don't
 * know that subtype" from "I know it, but not for a gateway" — two different
 * sentences, and the second one is the useful one.
 */
export function matchesForType(matches: readonly ConvertMatch[], elementType: string): ConvertMatch[] {
  return matches.filter((m) => m.appliesTo.includes(elementType));
}
