/**
 * Speaking about ONE edge of a pool.
 *
 * Paul, 21 September 2026:
 *
 *   "{Move, Nudge} Pool {left, right, top, bottom} boundary {left, right, up,
 *    down}"
 *
 * The first cut of this was two regexes over a tidy sentence. Paul's transcript
 * the same evening is what it actually has to read:
 *
 *   "Nudge pool boundary left."            no side named at all
 *   "Nudge. Left pull boundary."           full stop mid-command; pool → PULL
 *   "Pool pool left boundary left."        the word twice
 *   "Nudge. Pull, left boundary, left."    commas everywhere
 *   "Left boundary, left."                 no verb, no pool word
 *   "Nudge pull lane, left boundary left." a lane word thrown in
 *
 * Only two of those parsed. So this is a TOKEN SCAN, not a regex: punctuation
 * is stripped, the recogniser's spellings of "pool" are accepted the way the
 * rest of the grammar already accepts them, and the parts are recognised by
 * what they are rather than by the order they arrive in.
 *
 * WHICH WORD IS WHICH. Two of the words name a side — "left boundary left" —
 * and they are told apart by position, not by meaning: the one BEFORE the
 * boundary word names the edge, the one AFTER it says where that edge goes.
 *
 * WHAT IS ALLOWED TO BE MISSING.
 *   • No side, but a direction — "nudge the pool boundary left" — takes the
 *     edge the movement is heading for. It is the only reading that does not
 *     require guessing at something the speaker did not say.
 *   • A side but no direction — "move the pool left boundary" — is NOT
 *     guessable: left and right are both perfectly sensible. It returns
 *     `"needs-direction"` so the caller can decline the whole sentence rather
 *     than let a greedier rule have it. That one mattered: it used to fall
 *     through to the element move rule, whose step is the element's own width,
 *     and slid the entire pool about 900px across the canvas.
 *
 * Pure.
 */

export type PoolBoundary = "left" | "right" | "top" | "bottom";
export type MoveDirection = "up" | "down" | "left" | "right";

/** A vertical edge slides sideways; a horizontal one moves up and down. */
export function boundaryTakesDirection(b: PoolBoundary, d: MoveDirection): boolean {
  const vertical = b === "left" || b === "right";
  const sideways = d === "left" || d === "right";
  return vertical === sideways;
}

/** The edge a movement is heading for, when the speaker named only the way. */
export function boundaryFacing(d: MoveDirection): PoolBoundary {
  return d === "left" ? "left" : d === "right" ? "right" : d === "up" ? "top" : "bottom";
}

export interface PoolBoundaryPhrase {
  ref?: string;
  boundary: PoolBoundary;
  direction: MoveDirection;
  distance?: number;
}

/** The sentence IS a boundary move, but nobody said which way. */
export type BoundaryParse = PoolBoundaryPhrase | "needs-direction" | null;

/** The recogniser's spellings of "pool" — the same set the rest of the
 *  grammar accepts, because it hears "pull" and "poll" constantly. */
const POOL_WORD = /^(?:pools?|polls?|pulls?|pooled|pulled)$/i;
/** Lane words are accepted and ignored: "nudge pull lane, left boundary left"
 *  is a person correcting themselves mid-sentence, not a lane command. */
const LANE_WORD = /^(?:lanes?|lines?|sub-?lanes?|sub-?lines?)$/i;
const BOUNDARY_WORD = /^(?:boundary|boundaries|edge|edges|border|borders|side)$/i;
const VERB = /^(?:move|moves?|moved|nudge|nudged|shift|shifted|bump|bumped|drag|dragged|pull|push|pushed|slide|slid)$/i;
const FILLER = /^(?:the|a|an|of|to|please|its|it'?s|and|then)$/i;

const SIDES: Record<string, PoolBoundary> = {
  left: "left", lefthand: "left", "left-hand": "left", west: "left",
  right: "right", righthand: "right", "right-hand": "right", east: "right",
  top: "top", upper: "top", north: "top",
  bottom: "bottom", lower: "bottom", south: "bottom", base: "bottom",
};

// "outward" and "inward" are deliberately absent. They mean opposite things on
// opposite edges, so one sentence would move the boundary two ways depending
// on which edge was named — and a command that reads clearly while doing the
// wrong thing is worse than one the assistant asks about.
const DIRS: Record<string, MoveDirection> = {
  left: "left", right: "right", up: "up", down: "down",
  upward: "up", upwards: "up", downward: "down", downwards: "down",
};

/** Words that could be either, depending on where they sit. */
const isSideWord = (w: string) => w.toLowerCase() in SIDES;
const isDirWord = (w: string) => w.toLowerCase() in DIRS;

/**
 * Tokenise the way a transcript arrives: sentence punctuation becomes
 * whitespace, so "Nudge. Pull, left boundary, left." is eight words and not
 * three fragments the grammar never sees together.
 */
function tokenise(text: string): string[] {
  return text
    .replace(/[.,;:!?"“”]/g, " ")
    .replace(/'s\b/gi, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Parse a pool boundary command.
 *
 * `null` when the sentence is not one at all — which sends it on to the next
 * rule, and then to the AI. `"needs-direction"` when it plainly IS one but
 * left out the way: the caller must decline the sentence rather than pass it
 * to a rule that will do something large and wrong with it.
 */
export function parsePoolBoundaryPhrase(text: string): BoundaryParse {
  // THE LAST SENTENCE WINS. The recogniser punctuates a hesitation as a full
  // stop, so a single command arrives as two or three "sentences" — and the
  // words before the last one are a false start, not a name. "Merge selected
  // pool. Left boundary left." read whole gives a pool called "Merge
  // selected"; read as the sentence it is, it is the command with no name at
  // all, which is right. The whole string is still tried afterwards, so a
  // genuine one-sentence command is unaffected.
  const fragments = text.split(/[.!?]+/).map((f) => f.trim()).filter(Boolean);
  const lastWithBoundary = [...fragments].reverse()
    .find((f) => tokenise(f).some((w) => BOUNDARY_WORD.test(w)));
  if (lastWithBoundary && lastWithBoundary !== text.trim()) {
    const fromFragment = parseWords(tokenise(lastWithBoundary));
    if (fromFragment && fromFragment !== "needs-direction") return fromFragment;
    const whole = parseWords(tokenise(text));
    return whole ?? fromFragment;
  }
  return parseWords(tokenise(text));
}

function parseWords(words: string[]): BoundaryParse {
  const bIdx = words.findIndex((w) => BOUNDARY_WORD.test(w));
  if (bIdx < 0) return null;

  // "side" on its own is too common a word to treat as a boundary; require a
  // side word in front of it ("the left side of the pool"), which the search
  // below will find anyway.
  if (/^sides?$/i.test(words[bIdx]) && !(bIdx > 0 && isSideWord(words[bIdx - 1]))) return null;

  const before = words.slice(0, bIdx);
  const after = words.slice(bIdx + 1);

  // A pool must be mentioned SOMEWHERE, unless the sentence is the bare
  // continuation form ("left boundary, left") — which only counts when a side
  // word introduces it, so an unrelated "…edge…" cannot be captured.
  const poolMentioned = words.some((w) => POOL_WORD.test(w));
  const bareForm = bIdx > 0 && isSideWord(words[bIdx - 1]);
  if (!poolMentioned && !bareForm) return null;

  // THE EDGE: the nearest side word before the boundary word.
  let boundary: PoolBoundary | null = null;
  for (let i = before.length - 1; i >= 0; i--) {
    if (isSideWord(before[i])) { boundary = SIDES[before[i].toLowerCase()]; break; }
  }
  // THE WAY: the first direction word after it.
  let direction: MoveDirection | null = null;
  let dirAt = -1;
  for (let i = 0; i < after.length; i++) {
    if (isDirWord(after[i])) { direction = DIRS[after[i].toLowerCase()]; dirAt = i; break; }
  }

  if (!direction) {
    // "move the pool left boundary" — a real command, missing its way.
    if (boundary) return "needs-direction";
    return null;
  }
  // "nudge the pool boundary left" — the edge the movement heads for.
  if (!boundary) boundary = boundaryFacing(direction);
  if (!boundaryTakesDirection(boundary, direction)) return null;

  // "by 40", "by 40px".
  let distance: number | undefined;
  const byAt = after.findIndex((w) => /^by$/i.test(w));
  if (byAt >= 0) {
    const n = after[byAt + 1]?.match(/^(\d+)/);
    if (n) distance = Number(n[1]);
  }

  // THE POOL: whatever is left once every word doing a job is taken out. The
  // direction word and anything after it is dropped, so "…up by 40" cannot
  // become part of a name.
  const naming = [...before, ...after.slice(0, dirAt)];
  const ref = naming
    .filter((w) => !VERB.test(w) && !FILLER.test(w) && !POOL_WORD.test(w) && !LANE_WORD.test(w)
      && !isSideWord(w) && !BOUNDARY_WORD.test(w))
    .join(" ")
    .trim();

  const out: PoolBoundaryPhrase = { boundary, direction };
  if (ref) out.ref = ref;
  if (distance !== undefined) out.distance = distance;
  return out;
}

/**
 * Does this sentence name a container boundary at all?
 *
 * Used by the greedier rules to DECLINE. "Move the pool left boundary" has no
 * direction, so this module cannot act on it — but the element move rule is
 * happy to read it as "move the pool left", and its step is the element's own
 * width, so a pool travels about 900px. Better to decline and let the AI ask.
 */
export function mentionsPoolBoundary(text: string): boolean {
  const words = tokenise(text);
  const bIdx = words.findIndex((w) => /^(?:boundary|boundaries|border|borders)$/i.test(w));
  if (bIdx < 0) return false;
  return words.some((w) => POOL_WORD.test(w) || LANE_WORD.test(w))
    || (bIdx > 0 && isSideWord(words[bIdx - 1]));
}

/**
 * The rect a boundary move asks for, before any of the canvas's own rules
 * (stop at the content, carry the lanes, keep the pools in lockstep) have had
 * their say. Those belong to the reducer and apply to a spoken drag exactly as
 * they do to a dragged one — which is the point of going through the same
 * action rather than writing new geometry here.
 */
export function boundaryRect(
  pool: { x: number; y: number; width: number; height: number },
  boundary: PoolBoundary,
  direction: MoveDirection,
  distance: number,
): { x: number; y: number; width: number; height: number } {
  const d = direction === "left" || direction === "up" ? -distance : distance;
  switch (boundary) {
    case "left":   return { ...pool, x: pool.x + d, width: pool.width - d };
    case "right":  return { ...pool, width: pool.width + d };
    case "top":    return { ...pool, y: pool.y + d, height: pool.height - d };
    default:       return { ...pool, height: pool.height + d };
  }
}
