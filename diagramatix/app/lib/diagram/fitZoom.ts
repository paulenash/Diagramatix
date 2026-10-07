/**
 * The zoom for "show me the WHOLE diagram" — used after an AI generation (Paul, 2026-10-07: "the initial zoom after an AI Generation is too
 * close — I would prefer to see the whole diagram that was generated and then zoom in if need be").
 *
 * The smaller of the person's own initial zoom and the zoom at which the whole diagram (already padded) fits the window. So a small
 * diagram keeps the readable initial zoom and a large one shrinks until all of it shows — but never below `floor`, because a diagram too
 * small to read helps nobody.
 */
export const WHOLE_FIT_MIN_ZOOM = 0.1;

export function wholeFitZoom(a: {
  /** The person's own initial zoom (System menu ▸ Initial Zoom; default 0.7). */
  initialZoom: number;
  viewportW: number; viewportH: number;
  contentW: number; contentH: number;
  floor?: number;
}): number {
  const { initialZoom, viewportW, viewportH, contentW, contentH, floor = WHOLE_FIT_MIN_ZOOM } = a;
  if (!(contentW > 0) || !(contentH > 0) || !(viewportW > 0) || !(viewportH > 0)) return initialZoom;
  return Math.max(floor, Math.min(initialZoom, viewportW / contentW, viewportH / contentH));
}
