/**
 * Growing an existing pool around elements it has just adopted.
 *
 * "Put a pool around everything" does not draw a second pool when one already
 * exists — it adopts the loose elements into the biggest one. The reducer set
 * their `parentId` and left the sizing to the shared enclosure pass, and that
 * pass does not do it: for a pool or a lane it counts ONLY lane and sub-lane
 * children, deliberately, so that ordinary elements never shove swimlanes about.
 *
 * So the adoption said "grew Pool 1 to take in 11 loose elements" and Pool 1 did
 * not move a pixel (Paul, 2026-09-18). The elements became children of a pool
 * drawn nowhere near them — which is precisely the stale parentage that made a
 * nudge move an entire diagram the day before.
 *
 * A container has to end up drawn around what it contains, or it is not a
 * container. This does that sizing explicitly.
 */
import type { DiagramElement } from "./types";

/** Gap left between an adopted element and the pool edge. */
export const ADOPT_PAD = 40;
/** Width of the pool's rotated name strip on the left. */
export const POOL_HEADER_W = 36;

interface Box { x: number; y: number; width: number; height: number }

const boundsOf = (els: readonly DiagramElement[]): Box => {
  const x = Math.min(...els.map((e) => e.x));
  const y = Math.min(...els.map((e) => e.y));
  const right = Math.max(...els.map((e) => e.x + e.width));
  const bottom = Math.max(...els.map((e) => e.y + e.height));
  return { x, y, width: right - x, height: bottom - y };
};

/**
 * Resize `poolId` so it encloses everything it now owns, and stretch its lanes
 * to match.
 *
 * `adoptedIds` are the elements just taken in. The pool grows in whichever
 * directions it must and never shrinks — an adoption should not quietly crop a
 * pool around its existing contents.
 *
 * Lanes tile a pool top to bottom, so when the pool grows vertically the lane
 * that took the elements absorbs the new space and the lanes after it shift.
 * With no lanes the pool simply covers the elements itself.
 */
export function growPoolToAdopt(
  elements: readonly DiagramElement[],
  poolId: string,
  holderId: string,
  adoptedIds: readonly string[],
): DiagramElement[] {
  const adopted = elements.filter((e) => adoptedIds.includes(e.id));
  const pool = elements.find((e) => e.id === poolId);
  if (!pool || adopted.length === 0) return [...elements];

  const b = boundsOf(adopted);
  // The union of where the pool is and where its new contents are, padded.
  const left = Math.min(pool.x, b.x - ADOPT_PAD - POOL_HEADER_W);
  const top = Math.min(pool.y, b.y - ADOPT_PAD);
  const right = Math.max(pool.x + pool.width, b.x + b.width + ADOPT_PAD);
  const bottom = Math.max(pool.y + pool.height, b.y + b.height + ADOPT_PAD);

  const grown: Box = { x: left, y: top, width: right - left, height: bottom - top };
  const dTop = pool.y - grown.y;          // how far the pool's top rose
  const dBottom = (grown.y + grown.height) - (pool.y + pool.height);

  const lanes = elements
    .filter((e) => e.type === "lane" && e.parentId === poolId)
    .sort((a, b2) => a.y - b2.y);

  const out = elements.map((e) => {
    if (e.id === poolId) return { ...e, ...grown };

    if (e.type === "lane" && e.parentId === poolId) {
      // Every lane spans the pool's width past the header.
      const laneX = grown.x + POOL_HEADER_W;
      const laneW = grown.width - POOL_HEADER_W;
      const first = lanes[0]?.id === e.id;
      const last = lanes[lanes.length - 1]?.id === e.id;
      const holder = e.id === holderId;

      let y = e.y;
      let height = e.height;
      // The pool grew upward: the top lane covers the new space, and every lane
      // keeps its own height. If the holder IS the top lane it absorbs it; if
      // not, the top lane does, because a gap above the first lane is not legal.
      if (dTop > 0) {
        if (first) { y = grown.y; height = e.height + dTop; }
        else { y = e.y; }
      }
      // The pool grew downward: the last lane takes the extra, unless the holder
      // is a different lane whose contents caused it, in which case the holder
      // grows and the lanes after it move down.
      if (dBottom > 0) {
        if (holder && !last) height += dBottom;
        else if (last && !holder) height += dBottom;
        else if (last) height += dBottom;
      }
      return { ...e, x: laneX, width: laneW, y, height };
    }
    return e;
  });

  // Re-tile: lanes must sit end to end from the pool's top with no gaps, which
  // the per-lane adjustments above can leave behind once more than one lane
  // moved. Heights are kept; only the offsets are recomputed.
  if (lanes.length > 0) {
    const byId = new Map(out.map((e) => [e.id, e] as const));
    let cursor = grown.y;
    for (const lane of lanes) {
      const live = byId.get(lane.id)!;
      (live as DiagramElement).y = cursor;
      cursor += live.height;
    }
    // The last lane stretches to the pool's bottom so the tiling is exact.
    const lastLive = byId.get(lanes[lanes.length - 1].id)!;
    const bottomEdge = grown.y + grown.height;
    if (lastLive.y + lastLive.height !== bottomEdge) {
      (lastLive as DiagramElement).height = Math.max(20, bottomEdge - lastLive.y);
    }
    return out.map((e) => byId.get(e.id) ?? e);
  }

  return out;
}
