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
  /** Mouse-up — the gesture is over, so the suppression expires with it. */
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
