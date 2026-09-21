/**
 * Speaking about ONE edge of a pool.
 *
 * Paul, 21 September 2026, once the left boundary could be dragged again:
 *
 *   "New Voice Assist commands, if not already implemented:
 *    {Move, Nudge} Pool {left, right, top, bottom} boundary {left, right, up,
 *    down}"
 *
 * Two words that both name a side, in one sentence — "move the pool's left
 * boundary right". The grammar has to keep them apart, and it has to refuse
 * the pairings that mean nothing: a LEFT edge is a vertical line and can only
 * slide sideways; a TOP edge is horizontal and can only go up or down. "Move
 * the left boundary up" is not a near miss to be guessed at, it is two
 * different gestures, so it is rejected and the speaker asked again.
 *
 * Pure. No reducer, no ids.
 */

export type PoolBoundary = "left" | "right" | "top" | "bottom";
export type MoveDirection = "up" | "down" | "left" | "right";

/** A vertical edge slides sideways; a horizontal one moves up and down. */
export function boundaryTakesDirection(b: PoolBoundary, d: MoveDirection): boolean {
  const vertical = b === "left" || b === "right";
  const sideways = d === "left" || d === "right";
  return vertical === sideways;
}

export interface PoolBoundaryPhrase {
  ref?: string;
  boundary: PoolBoundary;
  direction: MoveDirection;
  distance?: number;
}

const BOUNDARY_WORDS: Record<string, PoolBoundary> = {
  left: "left", "left-hand": "left", "lefthand": "left", west: "left",
  right: "right", "right-hand": "right", "righthand": "right", east: "right",
  top: "top", upper: "top", north: "top",
  bottom: "bottom", lower: "bottom", south: "bottom", base: "bottom",
};

// "outward" and "inward" are deliberately absent. They mean opposite things
// on opposite edges, so the same sentence would move the boundary two ways
// depending on which one was named — and a command that reads clearly while
// doing the wrong thing is worse than one the assistant asks about.
const DIRECTION_WORDS: Record<string, MoveDirection> = {
  left: "left", right: "right", up: "up", down: "down",
  upward: "up", upwards: "up", downward: "down", downwards: "down",
};

/**
 * Parse "move the Warehouse pool's left boundary right by 40".
 *
 * Returns null when the sentence is not this command at all, and null when it
 * IS this command but names an impossible pairing — the caller treats both as
 * "the rule grammar has nothing", which sends it to the AI fallback, which
 * canonicalises and comes back through here.
 */
export function parsePoolBoundaryPhrase(text: string): PoolBoundaryPhrase | null {
  const raw = text.trim().replace(/[.!?]+$/, "");
  const verbs = "move|nudge|shift|bump|drag|pull|push|slide";
  const bw = Object.keys(BOUNDARY_WORDS).join("|");
  const dw = Object.keys(DIRECTION_WORDS).join("|");
  // "<verb> [the] [<ref> ]pool['s] <side> (boundary|edge|side) [to the] <dir> [by N px]"
  // and the possessive-free "<verb> the <side> boundary of the <ref> pool <dir>".
  const forms = [
    new RegExp(
      `^(?:${verbs})\\s+(?:the\\s+)?(?<ref>.*?)\\s*pool'?s?\\s+(?<side>${bw})\\s+(?:boundary|edge|side|border)\\s+` +
      `(?:to\\s+the\\s+)?(?<dir>${dw})(?:\\s+by\\s+(?<n>\\d+)\\s*(?:px|pixels?)?)?$`, "i"),
    new RegExp(
      `^(?:${verbs})\\s+(?:the\\s+)?(?<side>${bw})\\s+(?:boundary|edge|side|border)\\s+of\\s+(?:the\\s+)?(?<ref>.*?)\\s*pool\\s+` +
      `(?:to\\s+the\\s+)?(?<dir>${dw})(?:\\s+by\\s+(?<n>\\d+)\\s*(?:px|pixels?)?)?$`, "i"),
  ];
  for (const re of forms) {
    const m = raw.match(re);
    if (!m?.groups) continue;
    const boundary = BOUNDARY_WORDS[m.groups.side.toLowerCase()];
    const direction = DIRECTION_WORDS[m.groups.dir.toLowerCase()];
    if (!boundary || !direction) return null;
    if (!boundaryTakesDirection(boundary, direction)) return null;
    const ref = (m.groups.ref ?? "").replace(/\b(?:the|a|an)\b/gi, "").trim();
    const out: PoolBoundaryPhrase = { boundary, direction };
    if (ref) out.ref = ref;
    if (m.groups.n) out.distance = Number(m.groups.n);
    return out;
  }
  return null;
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
