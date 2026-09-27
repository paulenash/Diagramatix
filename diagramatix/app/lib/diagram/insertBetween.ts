/**
 * Where "insert C between A and B" puts C, and whether room must be made first.
 *
 * Paul, 2026-09-27: "I want it to be inserted into the connector from Task A,
 * if there is room, if not, it should move everything in Task A's Pool or Lane
 * to the right, and then insert it into the existing connector from Task A to
 * Task B. If there is no existing connector between Task A and Task B then
 * insert the new task and connect Task A to Task C, and Task C to Task B."
 *
 * WHEN B LIES AHEAD OF A (B starts at or right of A's right edge — the flow
 * reads left to right): C goes in line after A, the same gap an "add after"
 * leaves (½ a Task width). On A's row — or on B's, when the flow leaves A from
 * its top or bottom (a gateway branch), so it runs up or down and then in.
 * The spot is free when nothing but A (and A's own boundary events) is within
 * that gap of it. When something is, EVERYTHING IN A'S POOL whose centre lies
 * right of A moves right just far enough to free it — the mouse's Insert Space,
 * scoped to the pool (INSERT_SPACE `scopeId`). The whole pool, not only A's
 * lane: moving one lane would shear every flow that crosses into it.
 *
 * OTHERWISE (B above, below or behind A): C goes at the nearest free spot to
 * the midpoint between them, and nothing moves.
 *
 * Pure.
 */
import type { DiagramElement, Side } from "./types";
import { HALF_TASK_W, findFreeSlot, type Box, type Center } from "./assistPlacement";
import { getAllDescendantIds } from "./containment";

/** The gap an "add after" leaves between two steps (½ a Task width). */
export const INSERT_GAP = HALF_TASK_W;

export interface InsertPlan {
  center: Center;
  /** Room to make first — everything in `scopeId` whose centre is right of `markerX` moves right `dx`. */
  shift?: { markerX: number; dx: number; scopeId?: string };
  /** The side of C the flow from A arrives at, and the side the flow to B leaves from. */
  inSide: Side;
  outSide: Side;
}

const cx = (e: Box) => e.x + e.width / 2;
const cy = (e: Box) => e.y + e.height / 2;
const isBand = (e: DiagramElement) => e.type === "pool" || e.type === "lane" || e.type === "sublane";

function ancestorsOf(el: DiagramElement, els: readonly DiagramElement[]): DiagramElement[] {
  const out: DiagramElement[] = [];
  let cur = els.find((e) => e.id === el.parentId);
  while (cur && !out.includes(cur)) { out.push(cur); cur = els.find((e) => e.id === cur!.parentId); }
  return out;
}

/** The pool `el` sits in, if any. */
export function poolOf(el: DiagramElement, els: readonly DiagramElement[]): DiagramElement | undefined {
  return ancestorsOf(el, els).find((e) => e.type === "pool");
}

/** The side of a box at `from` that faces the point `to`. */
function facing(from: Center, to: Center): Side {
  const dx = to.x - from.x, dy = to.y - from.y;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "bottom" : "top");
}

export function planInsertBetween(
  els: readonly DiagramElement[],
  a: DiagramElement,
  b: DiagramElement,
  /** Where the existing A → B flow leaves A, when there is one. */
  flowLeavesA: Side | undefined,
  w: number,
  h: number,
): InsertPlan {
  const aRight = a.x + a.width;
  // What C must keep clear of: every flow node except A, A's own boundary
  // events, and the containers A sits in (it is inside them, as C will be).
  const holders = new Set(ancestorsOf(a, els).map((e) => e.id));
  const obstacles = els.filter((e) => !isBand(e) && e.id !== a.id && e.boundaryHostId !== a.id && !holders.has(e.id));

  if (b.x >= aRight - 1) {
    const rowY = flowLeavesA === "top" || flowLeavesA === "bottom" ? cy(b) : cy(a);
    const center = { x: aRight + INSERT_GAP + w / 2, y: rowY };
    const slot: Box = { x: center.x - w / 2, y: center.y - h / 2, width: w, height: h };
    const pool = poolOf(a, els);
    const inPool = pool ? getAllDescendantIds(els as DiagramElement[], pool.id) : null;
    const moves = (e: DiagramElement): boolean => {
      // A boundary event moves with its host.
      const host = e.boundaryHostId ? els.find((x) => x.id === e.boundaryHostId) : undefined;
      const body = host ?? e;
      return cx(body) > aRight && (!inPool || inPool.has(body.id));
    };
    const blocks = (o: Box) =>
      slot.x - INSERT_GAP < o.x + o.width && slot.x + slot.width + INSERT_GAP > o.x
      && slot.y - INSERT_GAP < o.y + o.height && slot.y + slot.height + INSERT_GAP > o.y;
    const need = Math.max(0, ...obstacles
      .filter((o) => blocks(o) && moves(o))
      .map((o) => slot.x + slot.width + INSERT_GAP - o.x));
    const dx = Math.ceil(need);
    return {
      center,
      ...(dx > 0 ? { shift: { markerX: aRight, dx, ...(pool ? { scopeId: pool.id } : {}) } } : {}),
      inSide: "left",
      outSide: "right",
    };
  }

  const mid = { x: (cx(a) + cx(b)) / 2, y: (cy(a) + cy(b)) / 2 };
  const center = findFreeSlot(mid, w, h, obstacles, INSERT_GAP);
  return { center, inSide: facing(center, { x: cx(a), y: cy(a) }), outSide: facing(center, { x: cx(b), y: cy(b) }) };
}

/** The innermost lane (or pool) that holds this point — where C belongs. */
export function bandAt(p: Center, els: readonly DiagramElement[]): DiagramElement | undefined {
  return els
    .filter((e) => isBand(e) && p.x > e.x && p.x < e.x + e.width && p.y > e.y && p.y < e.y + e.height)
    .sort((x, y) => x.width * x.height - y.width * y.height)[0];
}
