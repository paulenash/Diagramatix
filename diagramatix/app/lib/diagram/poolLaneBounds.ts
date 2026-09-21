/**
 * Two rules about a pool's boundary, in one place.
 *
 * Paul, 21 September 2026, reporting the same thing from both ends:
 *
 *   "Pool dissociation from its lanes when moving the Pool boundary up
 *    further than the minimum lane size is still a serious issue."
 *
 *   "In addition Pool boundary moves should never move elements up. They
 *    should just be prevented from moving when the boundary hits anything in
 *    the pool or lane."
 *
 * RULE 1 — A POOL IS ITS LANE STACK. A pool that has lanes has no height of
 * its own: top = the first lane's top, bottom = the last lane's bottom. The
 * resize reducer now derives it that way, but a pool's height is written from
 * a dozen places (add lane, delete lane, split, EP cascade, import, layout)
 * and any one of them getting it wrong leaves the lanes hanging out of the
 * pool. `poolFollowsLanes` is the repair, cheap enough to run on every
 * containment pass, so the invariant holds no matter which path last wrote.
 *
 * RULE 2 — A BOUNDARY STOPS, IT DOES NOT SHOVE. Dragging a pool edge inward
 * used to squeeze the lane past its contents; `clampChildrenToLane` then
 * pushed the elements along ahead of the edge. The user was moving a
 * container and their process moved with it. `clampRectToContent` caps the
 * drag at the content instead: the edge comes to rest against the first thing
 * it meets and the diagram underneath does not change.
 *
 * Everything here is pure geometry — no reducer, no React, no ids minted.
 */

import type { DiagramElement } from "./types";

export interface Rect { x: number; y: number; width: number; height: number }

/** A lane by any other name. Sublanes are `type: "lane"` with a lane parent. */
const isLaneish = (e: DiagramElement) => e.type === "lane" || e.type === "sublane";

/**
 * The union of everything a container holds that is NOT structure — the
 * tasks, events, gateways and EPs, at any depth, but not the lanes and
 * sublanes that merely divide the space.
 *
 * `null` when the container is empty: an empty pool may be dragged to
 * nothing, and that is the one case with no content to stop at.
 */
export function contentBoundsOf(
  elements: DiagramElement[],
  rootId: string,
): Rect | null {
  const kidsOf = new Map<string, DiagramElement[]>();
  for (const e of elements) {
    if (!e.parentId) continue;
    const list = kidsOf.get(e.parentId) ?? [];
    list.push(e);
    kidsOf.set(e.parentId, list);
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (id: string, depth: number) => {
    if (depth > 12) return;                     // pathological-cycle guard
    for (const kid of kidsOf.get(id) ?? []) {
      if (isLaneish(kid)) { walk(kid.id, depth + 1); continue; }
      minX = Math.min(minX, kid.x);
      minY = Math.min(minY, kid.y);
      maxX = Math.max(maxX, kid.x + kid.width);
      maxY = Math.max(maxY, kid.y + kid.height);
      walk(kid.id, depth + 1);                  // an EP's own children count too
    }
  };
  walk(rootId, 0);
  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export interface ClampInsets {
  /** Breathing room between an edge and the content it stops against. */
  pad?: number;
  /** The pool header strip + the lane header strip, which the left edge
   *  must leave room for on top of the pad. */
  insetLeft?: number;
}

/**
 * Cap a dragged rect so no edge crosses the content it contains.
 *
 * Each edge is capped independently and only INWARD: dragging an edge away
 * from the content is always allowed, dragging it in stops at the content.
 * The opposite edge is left exactly where the drag put it, so a corner drag
 * that is legal on one axis still moves on that axis.
 *
 * A container that is ALREADY overlapping its content (an import, an older
 * diagram, a bug upstream) is not yanked back out — that would move the
 * boundary on a gesture the user did not make. It is simply not allowed to
 * go any further in, so the next outward drag fixes it and every inward one
 * is a no-op.
 */
export function clampRectToContent(
  before: Rect,
  raw: Rect,
  content: Rect | null,
  opts: ClampInsets = {},
): Rect {
  if (!content) return raw;
  const pad = opts.pad ?? 8;
  const insetLeft = opts.insetLeft ?? 0;

  const beforeRight = before.x + before.width;
  const beforeBottom = before.y + before.height;

  let left = raw.x;
  let top = raw.y;
  let right = raw.x + raw.width;
  let bottom = raw.y + raw.height;

  // Left / top move inward by INCREASING; cap them.
  left = Math.min(left, Math.max(content.x - pad - insetLeft, before.x));
  top = Math.min(top, Math.max(content.y - pad, before.y));
  // Right / bottom move inward by DECREASING; floor them.
  right = Math.max(right, Math.min(content.x + content.width + pad, beforeRight));
  bottom = Math.max(bottom, Math.min(content.y + content.height + pad, beforeBottom));

  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Half an event's width — the gap a container must leave between the right
 * edge of its header strip and the first thing inside it.
 *
 * Paul, 21 September 2026: "when surrounding elements manually with a Pool, or
 * when adding Lanes and Sublanes to a Pool with elements inside, make sure
 * there is always a gap of at least 1/2 event width between the left edge of
 * the left-most element (normally a Start Event) and the right-hand edge of
 * the new Pool, Lane or Sublane."
 *
 * A start event butted up against the lane header reads as though it belongs
 * to the header, and there is nowhere to put the flow's first connector.
 */
export const MIN_LEFT_GAP = 18;     // half of a 36px event

/**
 * How far LEFT a container has to move so its header strip clears the content.
 *
 * Returns 0 when the gap is already there — the common case, and the one that
 * must not nudge anything. Callers subtract this from `x` and add it to
 * `width`, so the right edge stays where it is and nothing inside moves.
 */
export function leftGapShortfall(
  containerX: number,
  headerWidth: number,
  contentLeft: number | null,
): number {
  if (contentLeft === null) return 0;
  const headerRight = containerX + headerWidth;
  const shortfall = headerRight + MIN_LEFT_GAP - contentLeft;
  return shortfall > 0 ? shortfall : 0;
}

/**
 * Make every pool's vertical bounds equal its lane stack's.
 *
 * Only the POOL is rewritten. Nothing that lives in a lane moves, and no lane
 * is re-stacked: a gap between two lanes is a different bug and repairing it
 * here would shift a lane out from under its contents — exactly the shoving
 * rule 2 forbids. This answers one question only, the one Paul's exports kept
 * showing: is the pool wrapped around its lanes?
 *
 * Pools without lanes are untouched — their height is their own.
 */
export function poolFollowsLanes(elements: DiagramElement[]): DiagramElement[] {
  const lanesByPool = new Map<string, DiagramElement[]>();
  for (const e of elements) {
    if (e.type !== "lane" || !e.parentId) continue;
    const list = lanesByPool.get(e.parentId) ?? [];
    list.push(e);
    lanesByPool.set(e.parentId, list);
  }
  if (lanesByPool.size === 0) return elements;
  let changed = false;
  const next = elements.map((e) => {
    if (e.type !== "pool") return e;
    const lanes = lanesByPool.get(e.id);
    if (!lanes || lanes.length === 0) return e;
    const top = Math.min(...lanes.map((l) => l.y));
    const bottom = Math.max(...lanes.map((l) => l.y + l.height));
    const height = bottom - top;
    if (Math.abs(top - e.y) < 0.01 && Math.abs(height - e.height) < 0.01) return e;
    changed = true;
    return { ...e, y: top, height };
  });
  return changed ? next : elements;
}
