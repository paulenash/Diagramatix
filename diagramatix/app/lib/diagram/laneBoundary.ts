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
 * anything in either band that would no longer sit wholly on its own side.
 */
export function contentCrossedBy(els: readonly DiagramElement[], aboveId: string, belowId: string, newY: number): DiagramElement[] {
  const byId = byIdOf(els);
  const under = (e: DiagramElement, bandId: string): boolean => {
    let cur = byId.get(e.parentId ?? "");
    for (let i = 0; cur && i < 16; i++) { if (cur.id === bandId) return true; cur = byId.get(cur.parentId ?? ""); }
    return false;
  };
  // Touching is not crossing: within half a pixel is clear (a task 19.998px
  // under a divider refused the plain 20px step — the 50-command set, 2026-09-27).
  const EPS = 0.5;
  return els.filter((e) => !isAnyLane(e) && e.type !== "pool" && (
    (under(e, aboveId) && e.y + e.height > newY + EPS)
    || (under(e, belowId) && e.y < newY - EPS)
  ));
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
