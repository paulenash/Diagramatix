/**
 * Resizing a stack of bands — lanes in a pool, sublanes in a lane.
 *
 * Paul, 21 September 2026: "When moving the top or bottom boundary of a Lane
 * with 2 or more sublanes the boundary moves ok but the middle sublane
 * dividers also move. This does not happen with Lanes within a Pool. Only the
 * boundary should move."
 *
 * He had spotted that the two levels disagreed. A pool's resize picks ONE lane
 * to absorb the change — the top one for a top-edge drag, the bottom one for a
 * bottom-edge drag — and leaves every other lane alone. `MOVE_LANE_BOUNDARY`
 * spread the change PROPORTIONALLY across the sublanes instead, so one divider
 * was dragged and all of them moved.
 *
 * THE RULE. A stack always fills its container exactly — that part is not
 * negotiable, it is what a swimlane IS. So when the container's height
 * changes, the change is taken by the band AT THE EDGE THAT MOVED, and every
 * other divider stays exactly where it is:
 *
 *      drag the container's TOP        drag the container's BOTTOM
 *      ┌──────────┐  ┌──────────┐      ┌──────────┐  ┌──────────┐
 *      │    A     │  │    A     │      │    A     │  │    A     │
 *      ├──────────┤  │          │      ├──────────┤  ├──────────┤
 *      │    B     │  ├──────────┤      │    B     │  │    B     │
 *      ├──────────┤  │    B     │      ├──────────┤  │          │
 *      │    C     │  ├──────────┤      │    C     │  │          │
 *      └──────────┘  │    C     │      └──────────┘  └──────────┘
 *                    └──────────┘        ↑ only C's height changed
 *        ↑ only A's height changed
 *
 * And when that band reaches its own floor the gesture STOPS rather than
 * passing the shortfall inward — the same rule the pool boundary follows
 * (T4627). `shrinkRoom` is what the caller clamps the drag with.
 *
 * Pure.
 */

export interface Band {
  /** Current height. */
  height: number;
  /** The least this band may be on its own account — its label, its contents. */
  min: number;
  /** Its own stack, if it has one. */
  bands?: Band[];
}

export type StackEdge = "first" | "last";

/**
 * How far this container may SHRINK before something stops it.
 *
 * RECURSIVE, and that is the whole point. Only the band at the moved edge
 * changes size, so the container's room is not "the sum of what all its bands
 * could give" — it is exactly what that ONE band can give, which in turn is
 * what ITS edge band can give, all the way down. Summing the minimums instead
 * over-states the room by whatever the untouched bands are holding, the drag
 * runs past the true floor, and the stack ends up taller than the lane that
 * contains it. (Two pixels, in the case that caught this.)
 *
 * Never negative: a stack already past its floor has no room to give, and is
 * not asked to give any back either.
 *
 * A container with no bands answers for itself — a lane with no sublanes still
 * has a name to fit.
 */
export function shrinkRoom(node: Band, edge: StackEdge): number {
  const kids = node.bands ?? [];
  if (kids.length === 0) return Math.max(0, node.height - node.min);
  return shrinkRoom(edge === "first" ? kids[0] : kids[kids.length - 1], edge);
}

/**
 * The stack's new heights after the container's height changes by `delta`.
 *
 * The band at `edge` takes all of it; every other band keeps the height it
 * had, so every divider between them stays put. The edge band is floored at
 * its own minimum — callers that clamped with `shrinkRoom` first will never
 * see that floor bite, and callers that did not get a stack that is too tall
 * for its container rather than a band with a negative height.
 */
export function absorbAtEdge(bands: Band[], delta: number, edge: StackEdge): number[] {
  const heights = bands.map((b) => b.height);
  if (bands.length === 0) return heights;
  const i = edge === "first" ? 0 : bands.length - 1;
  heights[i] = Math.max(bands[i].min, bands[i].height + delta);
  return heights;
}

/**
 * Lay the bands out from `top`, in order, at the given heights.
 *
 * Returns each band's y. The stack is tight by construction — no gaps to
 * close, no overlaps to resolve.
 */
export function stackFrom(top: number, heights: number[]): number[] {
  const ys: number[] = [];
  let y = top;
  for (const h of heights) { ys.push(y); y += h; }
  return ys;
}
