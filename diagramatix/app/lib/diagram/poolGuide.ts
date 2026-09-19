/**
 * When the pool-alignment guide is on screen, and when Escape takes it away.
 *
 * Paul, 2026-09-18: "If the Pool alignment green line and green indicators are
 * showing, then pressing esc removes them."
 *
 * The catch is that the guide is re-proposed on every mouse-move of the gesture
 * that raised it, so clearing the state alone would put it straight back on the
 * next pixel of travel. Escape therefore SUPPRESSES it for the remainder of the
 * current gesture; the next drag or resize starts clean.
 *
 * Pure — the Canvas holds the state and draws it.
 */

export interface PoolBoundaryGuide {
  side: "left" | "right";
  currentX: number;
  others: { id: string; x: number; midY: number; isMoving: boolean }[];
}

export interface PoolGuideState {
  guide: PoolBoundaryGuide | null;
  /** Escape was pressed; ignore anything this gesture proposes from here on. */
  suppressed: boolean;
}

export type PoolGuideEvent =
  /** A drag or resize offering a guide (or null when it has nothing to show). */
  | { type: "propose"; guide: PoolBoundaryGuide | null }
  /** Escape. */
  | { type: "escape" }
  /**
   * The gesture is over, HOWEVER it ended — completed on mouse-up, abandoned
   * (pointer released off-window, component re-rendered mid-drag), or
   * superseded because the user started doing something else.
   *
   * Paul, 2026-09-19: "The green alignment markers should disappear when I
   * click elsewhere but they persist until I explicitly remove them with
   * <esc>." They persisted because only the originating gesture's own mouse-up
   * cleared them, so any gesture that ended another way stranded them on
   * screen. The Canvas now also sends this on mousedown CAPTURE, which fires
   * before any child's stopPropagation and so catches a click anywhere —
   * empty canvas or another element alike.
   */
  | { type: "gestureEnd" };

export const EMPTY_POOL_GUIDE: PoolGuideState = { guide: null, suppressed: false };

export function poolGuideNext(state: PoolGuideState, event: PoolGuideEvent): PoolGuideState {
  switch (event.type) {
    case "escape":
      return { guide: null, suppressed: true };
    case "gestureEnd":
      return EMPTY_POOL_GUIDE;
    case "propose":
      return state.suppressed ? { guide: null, suppressed: true } : { guide: event.guide, suppressed: false };
  }
}
