/**
 * Which boundaries of a shape the user may take hold of.
 *
 * This existed as four separate `.filter(…)` calls and one missing `onLeft`
 * spread across `Canvas.tsx` and `SymbolRenderer.tsx`, each carrying its own
 * copy of the comment "pools never move their LEFT boundary". When Paul asked
 * for that boundary back — 21 September 2026, "I need to now reintroduce the
 * ability to move the left-hand Pool boundary left and right" — the gesture
 * was dead in four places at once and alive in none, which is the usual cost
 * of a rule written down more than once.
 *
 * It is written down here now. The hit-zones, the small square handles and the
 * click-to-select edge band all ask this same question.
 *
 * Pure.
 */

export type EdgeSide = "n" | "e" | "s" | "w";

const ALL: readonly EdgeSide[] = ["n", "e", "s", "w"] as const;

/**
 * The edges of `type` that can be dragged to resize it.
 *
 * Everything that resizes by its edges currently offers all four. The function
 * exists so that a future exception is a one-line change HERE rather than four
 * filters that drift apart — and so that a test can hold the answer still.
 */
export function resizableSides(type: string): readonly EdgeSide[] {
  void type;
  return ALL;
}

/** Does this shape offer that edge? */
export function edgeIsResizable(type: string, side: EdgeSide): boolean {
  return resizableSides(type).includes(side);
}

/**
 * Corner and mid-edge handles are named by the edges they drag, so a handle is
 * offered when every edge it would move is.
 */
export function handleIsResizable(type: string, handle: string): boolean {
  const sides = handle.split("") as EdgeSide[];
  return sides.every((s) => (ALL as readonly string[]).includes(s) ? edgeIsResizable(type, s) : true);
}
