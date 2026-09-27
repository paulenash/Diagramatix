/**
 * "Move <lane> {top, bottom} boundary/divider {up, down}" (Paul, 2026-09-27) —
 * which line that is, and whether it may move there.
 *
 * A lane's top or bottom boundary is the DIVIDER it shares with the band next
 * to it — the line the mouse drags (MOVE_LANE_BOUNDARY: the band above grows,
 * the band below gives way, the pool keeps its size). At the end of a stack
 * the boundary belongs to the band the lane sits in: the first sub-lane's top
 * is its lane's top, and so on up; the top lane's top is the POOL's top edge,
 * which is a pool boundary move (the pool grows or shrinks, the lanes follow).
 *
 * The divider never carries content across it. The mouse lets a divider pass
 * through a task, which then silently belongs to the other lane; a sentence
 * must not do that. So a move that would put the line through, or past,
 * anything in either band is refused, naming what is in the way.
 *
 * Which band: only the one giving way (contentCrossedBy) — Paul, 2026-09-28:
 * "that command uses element positions inside the lane".
 *
 * Except "move dividers" (dividerFlow.ts, Paul 2026-09-28), whose numbered
 * answers go through the elements by design: only the names (wrapLabelInTwo
 * lets one wrap first) and the pool limit them.
 *
 * Pure.
 */
import type { DiagramElement } from "./types";
import { isAnyLane } from "./laneKind";

export type LaneEdgePlan =
  | { divider: { aboveId: string; belowId: string } }
  | { poolEdge: { poolId: string; boundary: "top" | "bottom" } }
  | { error: string };

const byIdOf = (els: readonly DiagramElement[]) => new Map(els.map((e) => [e.id, e] as const));

/** The divider (or pool edge) that is `band`'s top or bottom boundary. */
export function laneEdgePlan(els: readonly DiagramElement[], band: DiagramElement, side: "top" | "bottom"): LaneEdgePlan {
  const byId = byIdOf(els);
  let cur: DiagramElement | undefined = band;
  for (let i = 0; cur && i < 12; i++) {
    const parent = byId.get(cur.parentId ?? "");
    if (!parent) return { error: `${spoken(band)} is in no pool` };
    const stack = els.filter((e) => isAnyLane(e) && e.parentId === parent.id).sort((a, b) => a.y - b.y);
    const at = stack.findIndex((e) => e.id === cur!.id);
    if (side === "top" && at > 0) return { divider: { aboveId: stack[at - 1].id, belowId: cur.id } };
    if (side === "bottom" && at >= 0 && at < stack.length - 1) return { divider: { aboveId: cur.id, belowId: stack[at + 1].id } };
    if (parent.type === "pool") return { poolEdge: { poolId: parent.id, boundary: side } };
    cur = parent;   // the end of this stack: the boundary is the enclosing band's
  }
  return { error: `couldn't find ${spoken(band)}'s ${side} boundary` };
}

/**
 * What the divider between `above` and `below` would pass through at `newY`:
 * anything in the band GIVING WAY that would no longer sit wholly on its own
 * side — moving up, the band above; moving down, the band below.
 *
 * Only that band (Paul's session, 2026-09-28). The band that grows only takes
 * in more of what it already holds. A task the line already cuts — left there
 * by "move dividers" or the mouse, which both go through elements — sits in
 * the growing band, and checking it too refused a 20px nudge UP ("the divider
 * would run through “Task 8” — it can move up at most 98px") because the line
 * was still in Task 8 on its way out of it. This is also exactly the band
 * `dividerRoom` measures, so a refusal and the room it offers always agree.
 */
export function contentCrossedBy(els: readonly DiagramElement[], aboveId: string, belowId: string, newY: number): DiagramElement[] {
  const byId = byIdOf(els);
  const line = byId.get(belowId)?.y;
  if (line === undefined || newY === line) return [];
  const under = (e: DiagramElement, bandId: string): boolean => {
    let cur = byId.get(e.parentId ?? "");
    for (let i = 0; cur && i < 16; i++) { if (cur.id === bandId) return true; cur = byId.get(cur.parentId ?? ""); }
    return false;
  };
  // Touching is not crossing: within half a pixel is clear (a task 19.998px
  // under a divider refused the plain 20px step — the 50-command set, 2026-09-27).
  const EPS = 0.5;
  const up = newY < line;
  return els.filter((e) => !isAnyLane(e) && e.type !== "pool" && under(e, up ? aboveId : belowId)
    && (up ? e.y + e.height > newY + EPS : e.y < newY - EPS));
}

/** Of `els`, those the divider at `lineY` already passes through. */
export function cutByLine(els: readonly DiagramElement[], lineY: number): DiagramElement[] {
  const EPS = 0.5;
  return els.filter((e) => e.y < lineY - EPS && e.y + e.height > lineY + EPS);
}

/**
 * How far the divider between `above` and `below` can move before it would
 * reach anything in the band that gives way — up: the lowest thing in the band
 * above; down: the highest thing in the band below. Infinity when that band is
 * empty (the reducer's own floor still applies).
 */
export function dividerRoom(els: readonly DiagramElement[], aboveId: string, belowId: string, direction: "up" | "down"): number {
  const byId = byIdOf(els);
  const under = (e: DiagramElement, bandId: string): boolean => {
    let cur = byId.get(e.parentId ?? "");
    for (let i = 0; cur && i < 16; i++) { if (cur.id === bandId) return true; cur = byId.get(cur.parentId ?? ""); }
    return false;
  };
  const below = byId.get(belowId);
  if (!below) return 0;
  const line = below.y;
  const content = els.filter((e) => !isAnyLane(e) && e.type !== "pool" && under(e, direction === "up" ? aboveId : belowId));
  if (!content.length) return Infinity;
  return direction === "up"
    ? line - Math.max(...content.map((e) => e.y + e.height))
    : Math.min(...content.map((e) => e.y)) - line;
}

/**
 * A name on two lines, split at the word boundary that makes the longer line
 * shortest — or null when it cannot wrap (one word, or already on two lines).
 *
 * Paul, 2026-09-28: "move dividers" — "the new lane/sublane heights must allow
 * the lane/sublane names to be displayed, BUT wrapping the lane/sublane name
 * to 2 lines to allow for a narrower lane must be tried if it is possible."
 * A lane's floor is its name's length (containerMetrics laneMetrics: the
 * longest LINE), so two lines nearly halve it.
 */
export function wrapLabelInTwo(label: string | undefined | null): string | null {
  const text = (label ?? "").trim();
  if (!text || text.includes("\n")) return null;
  const words = text.split(/\s+/);
  if (words.length < 2) return null;
  let best: string | null = null, bestLong = Infinity;
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).join(" "), b = words.slice(k).join(" ");
    const long = Math.max(a.length, b.length);
    if (long < bestLong) { bestLong = long; best = `${a}\n${b}`; }
  }
  return best;
}

/**
 * The bands that give way when a divider moves into \`band\`: the band itself,
 * and — as MOVE_LANE_BOUNDARY refits it — its edge sub-lane at each depth
 * (the LAST for the band above the line, the FIRST for the band below).
 */
export function givingBands(els: readonly DiagramElement[], band: DiagramElement, edge: "first" | "last"): DiagramElement[] {
  const out: DiagramElement[] = [band];
  let cur: DiagramElement | undefined = band;
  for (let i = 0; cur && i < 12; i++) {
    const kids: DiagramElement[] = els.filter((e) => isAnyLane(e) && e.parentId === cur!.id).sort((a, b) => a.y - b.y);
    cur = edge === "first" ? kids[0] : kids[kids.length - 1];
    if (cur) out.push(cur);
  }
  return out;
}

/** The gap a pool keeps from its neighbour when its edge grows toward it. */
export const POOL_GAP = 10;

/**
 * How far a pool's edge can GROW before it would meet another pool — the
 * mouse lets a pool run over its neighbour; a sentence must not (the
 * 50-command set, 2026-09-27: "move the top boundary of Lane 3 up by 200" put
 * Claims Processing over the Customer pool). Infinity when nothing is that way.
 */
export function poolEdgeRoom(els: readonly DiagramElement[], pool: DiagramElement, boundary: "top" | "bottom" | "left" | "right"): { room: number; neighbour?: DiagramElement } {
  const others = els.filter((e) => e.type === "pool" && e.id !== pool.id);
  const right = pool.x + pool.width, bottom = pool.y + pool.height;
  const spanX = (o: DiagramElement) => o.x < right && o.x + o.width > pool.x;
  const spanY = (o: DiagramElement) => o.y < bottom && o.y + o.height > pool.y;
  let best: { room: number; neighbour?: DiagramElement } = { room: Infinity };
  for (const o of others) {
    const gap =
      boundary === "top" && spanX(o) && o.y + o.height <= pool.y + 0.5 ? pool.y - (o.y + o.height)
      : boundary === "bottom" && spanX(o) && o.y >= bottom - 0.5 ? o.y - bottom
      : boundary === "left" && spanY(o) && o.x + o.width <= pool.x + 0.5 ? pool.x - (o.x + o.width)
      : boundary === "right" && spanY(o) && o.x >= right - 0.5 ? o.x - right
      : Infinity;
    if (gap < best.room) best = { room: Math.max(0, gap - POOL_GAP), neighbour: o };
  }
  return best;
}

const spoken = (e: DiagramElement) => (e.label ?? "").replace(/\s+/g, " ").trim() || e.type;
