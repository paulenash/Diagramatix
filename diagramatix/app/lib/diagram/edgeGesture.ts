/**
 * What a drag that STARTED on a container's edge actually means.
 *
 * Paul, 2026-09-19: "I am having some difficulty move a black-box pool. When I
 * attempt to click and drag sometimes it works, sometimes it does not, the pool
 * remains selected but only the cursor moves, and sometimes the alignment green
 * markers appear the pool remains selected without moving."
 *
 * It was not flaky — it was positional, with no cue on screen. Two pieces of
 * code each assumed the other would handle the click:
 *
 *   • The edge hit-zones straddle each edge, 10px either side, running the
 *     container's whole width, and deliberately do NOT stopPropagation — they
 *     wait for a 4px move before claiming the gesture so a plain click can
 *     still fall through and select.
 *   • The element's own mousedown then refused to start a MOVE anywhere within
 *     10px of an edge, precisely because the hit-zone had not claimed it.
 *
 * So inside that band a drag could only ever resize, never move. On a 78px-tall
 * black-box pool the two bands are 20px — a QUARTER of its height, spanning
 * 1004px of width — and the only way to move it was to find the middle 58px.
 *
 * THE RULE. Once the pointer has travelled far enough to be a drag rather than
 * a click, its DIRECTION says which gesture was meant:
 *
 *   • mostly ACROSS the edge (vertically on a top/bottom edge) → resize; that
 *     is the direction the boundary itself can travel.
 *   • mostly ALONG the edge (horizontally on a top/bottom edge) → move; the
 *     boundary cannot go that way, so the user meant the whole shape.
 *
 * On a thin strip this is what people already expect: drag down on the top edge
 * to make it taller, drag sideways to slide it. And because the decision is
 * made from the gesture rather than from where the press landed, there is no
 * dead band left to hunt for.
 *
 * Pure.
 */

export type EdgeSide = "n" | "s" | "e" | "w";
export type EdgeGesture = "resize" | "move" | "pending";

/** How far the pointer must travel before a press counts as a drag at all. */
export const DRAG_THRESHOLD = 4;

/**
 * A drag along the edge has to be clearly along it before it is read as a move,
 * so an ordinary slightly-off resize still resizes. 1.2 is about 40° — well
 * inside what reads as "sideways".
 */
export const ALONG_RATIO = 1.2;

export const isHorizontalEdge = (side: EdgeSide): boolean => side === "n" || side === "s";

/**
 * Classify a drag that began on `side`.
 *
 * Returns "pending" while the pointer is still within the threshold — the
 * press is not yet a drag, and may turn out to be a plain click.
 */
export function classifyEdgeDrag(side: EdgeSide, dx: number, dy: number): EdgeGesture {
  if (Math.hypot(dx, dy) <= DRAG_THRESHOLD) return "pending";
  // Across the edge is the direction the boundary can move; along it is not.
  const across = isHorizontalEdge(side) ? Math.abs(dy) : Math.abs(dx);
  const along = isHorizontalEdge(side) ? Math.abs(dx) : Math.abs(dy);
  return along > across * ALONG_RATIO ? "move" : "resize";
}

/**
 * The edge hit band, in world px, either side of the boundary.
 *
 * The OUTSIDE half can be generous — it is empty canvas, so a wide catch there
 * makes the edge easier to hit and takes nothing from the shape. The INSIDE
 * half comes straight out of the shape, so it scales with the span instead of
 * being a flat 10px: a 78px pool gives up 6px an edge rather than 10, a tall
 * Expanded Subprocess still gets the full 10, and nothing ever drops below 4
 * (which would be unclickable). Widths are not the problem — pools are ~1000px
 * — so in practice only the horizontal edges are ever capped.
 */
export function edgeBand(side: EdgeSide, width: number, height: number): { outside: number; inside: number } {
  const span = isHorizontalEdge(side) ? height : width;
  return { outside: 14, inside: Math.max(4, Math.min(10, Math.floor(span / 12))) };
}
