/**
 * M8 — take the ghost suggestion by voice.
 *
 * With Assist on, selecting an element raises translucent chips suggesting
 * what comes next; **Tab** accepts the first. The voice had no way to reach
 * them, which is the odd gap in the pair: you can say anything about the
 * diagram except "yes" to the thing it just offered you.
 *
 * Everything needed already exists — `suggestNextSteps` produces the
 * candidates and `acceptNextStep` applies one, both wired through a ref the
 * voice layer can read. So this is the M3 shape again: grammar plus a
 * reference, no new machinery.
 *
 * WHY "YES" IS NOT ONE OF THE WORDS. "Yes" already means something: it confirms
 * a parked destructive command ("clear the diagram" → "say yes"). Giving it a
 * second meaning that depends on whether a ghost happens to be showing is how
 * you get a "yes" that clears the diagram when the user meant to accept a
 * suggestion. The accept words are therefore explicit — "accept", "take it",
 * "add the gateway" — and confirmation keeps "yes" to itself.
 *
 * Pure.
 */

/** What a candidate needs to be pickable by name. */
export interface GhostLike {
  /** Short label — "Task", "Gateway", "End". */
  label: string;
  symbolType: string;
}

export type GhostPick =
  /** Take the candidate at this index. */
  | { kind: "index"; index: number }
  /** Take the one whose label or type matches. */
  | { kind: "named"; name: string }
  /** Take the first, which is what Tab does. */
  | { kind: "first" }
  | null;

const ORDINALS: Record<string, number> = {
  first: 0, "1st": 0, one: 0,
  second: 1, "2nd": 1, two: 1,
  third: 2, "3rd": 2, three: 2,
  fourth: 3, "4th": 3, four: 3,
  fifth: 4, "5th": 4, five: 4,
};

const norm = (s: string) =>
  s.toLowerCase().replace(/[.,!?;:]+$/g, "").replace(/\s+/g, " ").trim();

/**
 * Parse an utterance as a ghost pick, or null.
 *
 * Deliberately narrow: every form names the act of accepting ("accept", "take",
 * "use"), so nothing that could be an ordinary command is swallowed. "Add a
 * gateway" stays an add; "take the gateway" is a pick.
 */
export function parseGhostPick(utterance: string): GhostPick {
  const s = norm(utterance);
  if (!s) return null;

  // "accept" · "accept it" · "accept the suggestion" · "take it" · "go on"
  if (/^(?:accept|take|use)(?:\s+(?:it|that|the\s+(?:suggestion|ghost|first(?:\s+one)?)))?$/.test(s)) {
    return { kind: "first" };
  }
  if (/^(?:yes\s+)?(?:go\s+on|go\s+ahead\s+with\s+(?:it|that))$/.test(s)) return { kind: "first" };

  // "take the second one" · "accept ghost 2" · "the third one"
  const ord = s.match(/^(?:accept|take|use)?\s*(?:the\s+)?(?:ghost\s+)?([a-z0-9]+)(?:\s+one)?$/);
  if (ord) {
    const word = ord[1];
    if (/^\d+$/.test(word)) {
      const n = Number(word);
      // A bare number is how a NUMBERED PICK is answered, so only accept it
      // here when the utterance actually said "ghost".
      if (/\bghost\b/.test(s) && n >= 1) return { kind: "index", index: n - 1 };
    } else if (word in ORDINALS) {
      // "the second one" is unambiguous; a bare "second" is not a command.
      if (/\bone\b/.test(s) || /^(?:accept|take|use)\b/.test(s)) {
        return { kind: "index", index: ORDINALS[word] };
      }
    }
  }

  // "take the gateway" · "accept the end event" · "use the task"
  const named = s.match(/^(?:accept|take|use)\s+(?:the\s+)?(.+?)(?:\s+one)?$/);
  if (named) {
    const name = named[1].trim();
    if (name && !(name in ORDINALS) && !/^\d+$/.test(name)) return { kind: "named", name };
  }

  return null;
}

/**
 * Resolve a pick against the live candidates.
 *
 * Returns the index, or null when the pick names something that is not on
 * offer — which the caller reports by listing what IS on offer, since the
 * ghosts are translucent and easy to misread.
 */
export function resolveGhostPick(pick: GhostPick, candidates: readonly GhostLike[]): number | null {
  if (!pick || !candidates.length) return null;
  if (pick.kind === "first") return 0;
  if (pick.kind === "index") return pick.index < candidates.length ? pick.index : null;

  const want = norm(pick.name);
  const hit = candidates.findIndex((c) => {
    const label = norm(c.label);
    const type = norm(c.symbolType).replace(/-/g, " ");
    return label === want || type === want || label.startsWith(want) || type.startsWith(want);
  });
  return hit >= 0 ? hit : null;
}
