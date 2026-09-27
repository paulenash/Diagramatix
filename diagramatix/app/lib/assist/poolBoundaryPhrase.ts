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
// "divider": what a lane's top and bottom edges are called (Paul, 2026-09-27:
// "Move <lane_name> {top, bottom} boundary/divider {up, down}").
const BOUNDARY_WORD = /^(?:boundary|boundaries|edge|edges|border|borders|side|dividers?)$/i;
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

/** One boundary step — what a boundary moves when no distance is said, and what "two steps" counts in. */
export const BOUNDARY_STEP_PX = 20;
/** A Task, for "up a task" / "half a task": its height for a top/bottom edge, its width for a side. */
const TASK_H = 64, TASK_W = 102;

const NUMBER_WORD: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};

/**
 * HOW FAR (Paul, 2026-09-27: "I can only move a lane boundary by 20px"). Only
 * "by <digits>" was read, so "up 40", "up 40 pixels", "up by forty" and "down
 * two steps" all moved the default 20. Now, anywhere after the boundary word:
 *   a number — digits or words ("forty", "forty five", "a hundred") — in
 *   pixels, or in steps (20px, the default move), or in tasks / rows (a Task's
 *   height, or its width for a side); "half a task"; "a bit" / "a little" /
 *   "slightly" (10px). Returns the distance and which words it used, so none
 *   of them can become part of the name.
 */
export function readDistance(words: readonly string[], vertical: boolean): { px: number; used: Set<number> } | null {
  const lower = words.map((w) => w.toLowerCase());
  const unitPx = (u: string | undefined): number | null => {
    if (!u) return null;
    if (/^(?:px|pixels?|points?)$/.test(u)) return 1;
    if (/^(?:steps?|notch(?:es)?|clicks?|nudges?)$/.test(u)) return BOUNDARY_STEP_PX;
    if (/^(?:tasks?|rows?)$/.test(u)) return vertical ? TASK_H : TASK_W;
    return null;
  };
  for (let i = 0; i < lower.length; i++) {
    const w = lower[i];
    // "a bit", "a little", "slightly"
    if (w === "slightly") return { px: 10, used: new Set([i]) };
    if ((w === "a" || w === "an") && /^(?:bit|little|touch)$/.test(lower[i + 1] ?? "")) return { px: 10, used: new Set([i, i + 1]) };
    // "half a task" / "half a step"
    if (w === "half" && /^an?$/.test(lower[i + 1] ?? "")) {
      const u = unitPx(lower[i + 2]);
      if (u) return { px: Math.round(u / 2), used: new Set([i, i + 1, i + 2]) };
    }
    // A number straight after a kind word is a NAME — "the top boundary of
    // Lane 2 up" — never a distance.
    if (i > 0 && (POOL_WORD.test(words[i - 1]) || LANE_WORD.test(words[i - 1]))) continue;
    // a number: "40", "40px", "forty", "forty five", "a hundred", "a task"
    let n: number | null = null, j = i;
    const digits = w.match(/^(\d+)(px)?$/);
    // "one hundred" read as 1, and moved the boundary 1px (Paul's boundary
    // session, 2026-09-27). Now: "one hundred", "two hundred and fifty", "a
    // hundred", and the way people say numbers aloud — "one fifty" is 150.
    const word = (k: number): number | undefined => NUMBER_WORD[lower[k] ?? ""];
    const tail = (k: number): [number, number] => {   // tens and units after position k: [value, last index]
      let v = 0, at = k;
      if (lower[at + 1] === "and") at++;
      const tens = word(at + 1);
      if (tens !== undefined && tens >= 20 && tens < 100 && tens % 10 === 0) {
        v = tens; at++;
        const unit = word(at + 1);
        if (unit !== undefined && unit < 10) { v += unit; at++; }
      } else if (tens !== undefined && tens < 20) { v = tens; at++; }
      return v ? [v, at] : [0, k];
    };
    if (digits) { n = Number(digits[1]); if (digits[2]) return { px: n, used: new Set([i]) }; }
    else if (w in NUMBER_WORD) {
      n = NUMBER_WORD[w];
      if (n < 10 && lower[i + 1] === "hundred") { const [v, at] = tail(i + 1); n = n * 100 + v; j = at; }
      else if (n < 10 && (word(i + 1) ?? 0) >= 20 && (word(i + 1) ?? 0) < 100) { const [v, at] = tail(i); n = n * 100 + v; j = at; }
      else if (n >= 20 && n % 10 === 0 && n < 100 && (word(i + 1) ?? 99) < 10) { n += word(i + 1)!; j = i + 1; }
    } else if ((w === "a" || w === "an") && (lower[i + 1] === "hundred")) { const [v, at] = tail(i + 1); n = 100 + v; j = at; }
    else if ((w === "a" || w === "an") && unitPx(lower[i + 1])) { n = 1; }
    // "down to tasks" — the recogniser's "two tasks"; only straight before a unit.
    else if ((w === "to" || w === "too") && unitPx(lower[i + 1])) { n = 2; }
    if (n === null) continue;
    const used = new Set<number>();
    for (let k = i; k <= j; k++) used.add(k);
    const u = unitPx(lower[j + 1]);
    if (u) { used.add(j + 1); return { px: n * u, used }; }
    return { px: n, used };
  }
  return null;
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
  // A lane's boundary is the same sentence (2026-09-27): "move the Finance
  // Team lane top boundary up", "move lane divider down". The apply layer
  // finds a pool or a lane by the name.
  const laneWord = words.find((w) => LANE_WORD.test(w));
  const bareForm = bIdx > 0 && isSideWord(words[bIdx - 1]);
  // "boundary" and "divider" are never anything else — "move Finance team
  // boundary up" named no kind and no side, and fell to the element move,
  // which moved the whole LANE (Paul's sweep, 2026-09-27). "edge", "border"
  // and "side" are everyday words, so they still need a kind or a side.
  const strongWord = /^(?:boundary|boundaries|dividers?)$/i.test(words[bIdx]);
  // …except a BOUNDARY EVENT, which is an element: "move the boundary event up".
  if (/^events?$/i.test(words[bIdx + 1] ?? "")) return null;
  if (!poolMentioned && !laneWord && !bareForm && !strongWord) return null;

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

  // HOW FAR — anywhere after the boundary word, before or after the way
  // (readDistance); its words, and a "by", are never part of the name.
  const amount = readDistance(after.map((w, i) => (i === dirAt ? "" : w)), direction === "up" || direction === "down");
  const distance = amount?.px;
  const spent = (i: number) => i === dirAt || !!amount?.used.has(i) || (/^by$/i.test(after[i]) && !!amount);

  // THE POOL: whatever is left once every word doing a job is taken out. The
  // direction word and anything after it is dropped, so "…up by 40" cannot
  // become part of a name.
  // A kind word followed by a number is part of the NAME — "Lane 3", "Pool
  // two" — and keeping it binds the name to its kind: without it "move Lane 3
  // bottom boundary down" named only "3" (2026-09-27).
  const NUMBER = /^(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/i;
  const naming = [...before, ...after.slice(0, dirAt).filter((_, i) => !spent(i))];
  const ref = naming
    .filter((w, i) => {
      if ((POOL_WORD.test(w) || LANE_WORD.test(w)) && NUMBER.test(naming[i + 1] ?? "")) return true;
      return !VERB.test(w) && !FILLER.test(w) && !POOL_WORD.test(w) && !LANE_WORD.test(w)
        && !isSideWord(w) && !BOUNDARY_WORD.test(w);
    })
    .join(" ")
    .trim();

  const out: PoolBoundaryPhrase = { boundary, direction };
  if (ref) out.ref = ref;
  // Only the kind word named it — "move lane divider up": the lane (the
  // selected one, or the question), never the pool.
  else if (laneWord && !poolMentioned) out.ref = /^sub/i.test(laneWord) ? "the sub-lane" : "the lane";
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
  const bIdx = words.findIndex((w) => /^(?:boundary|boundaries|border|borders|dividers?)$/i.test(w));
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
