/**
 * When a gateway branch label shows its tether.
 *
 * A tether is the thin leader from a connector's label back to the line it
 * names. It matters most on a gateway: R5.12 moves those labels furthest to
 * keep them off shapes, three branches leave the same diamond, and the label
 * is a CONDITION — a reader who cannot tell which branch "No" belongs to
 * cannot read the process.
 *
 * Paul's rule, 21 September 2026:
 *
 *   "Gateway tethers should be always visible on connectors in a generated
 *    diagram, and on any diagram when created during a group selection
 *    connector creation — outgoing connectors on a gateway. A connector tether
 *    on a label should permanently cease to be displayed as soon as that label
 *    has been manually moved on a diagram."
 *
 * Three states, and the third is the interesting one:
 *
 *   ALWAYS  the diagram was generated, or the connector came from a group
 *           selection — nobody has placed these labels by hand, so the tether
 *           is doing the explaining.
 *   NEVER   the user has moved this label. They have said where it belongs;
 *           the leader is now clutter pointing at a decision they already
 *           made. PERMANENT — it does not come back if they move it again,
 *           or back, or if the connector re-routes.
 *   AUTO    everything else: show it only when the label has drifted clear of
 *           its line, which is the behaviour that shipped on 2026-09-04.
 *
 * "Permanently" is why this is a stored field rather than a computed one. A
 * rule derived from geometry can always be re-derived — and would switch the
 * tether back on the next time the label happened to sit far from the line,
 * which is exactly what the user was turning off.
 *
 * Pure.
 */

/** Stored on the connector. Absent means AUTO. */
export type LabelTetherMode = "always" | "never";

export interface TetherInput {
  /** The stored mode, if any. */
  mode?: LabelTetherMode;
  /** Does this connector leave a gateway? Only those carry branch tethers. */
  sourceIsGateway: boolean;
  /** Is there anything to tether? */
  hasLabel: boolean;
  /** Has the label drifted clear of the line (the 2026-09-04 box test)? */
  adrift: boolean;
}

/**
 * Should the tether be drawn?
 *
 * `never` wins over everything, including `always` — a connector created in a
 * generated diagram and THEN hand-moved is the case the permanence clause
 * exists for, and it is the commonest way both flags end up set.
 */
export function showLabelTether(t: TetherInput): boolean {
  if (!t.hasLabel || !t.sourceIsGateway) return false;
  if (t.mode === "never") return false;
  if (t.mode === "always") return true;
  return t.adrift;
}

/**
 * The mode a NEW connector should carry.
 *
 * `null` means "store nothing" — the auto behaviour, and the right answer for
 * an ordinary hand-drawn connector, which has no label yet anyway.
 */
export function tetherModeOnCreate(opts: {
  sourceIsGateway: boolean;
  /** The whole diagram was produced by AI generation or layout. */
  generated?: boolean;
  /** This connector was created by a group-selection connect gesture. */
  fromGroupSelection?: boolean;
}): LabelTetherMode | null {
  if (!opts.sourceIsGateway) return null;
  return opts.generated || opts.fromGroupSelection ? "always" : null;
}

/**
 * Has the user MOVED this label, as opposed to editing its text or resizing it?
 *
 * Only a move turns the tether off, so the two have to be told apart at the
 * point of the edit: typing a condition into a label that has never been
 * dragged must leave the tether alone.
 *
 * A change of less than half a pixel is the drag handler settling, not a move.
 */
export function isLabelMove(
  before: { labelOffsetX?: number; labelOffsetY?: number },
  after: { labelOffsetX?: number; labelOffsetY?: number },
): boolean {
  const dx = Math.abs((after.labelOffsetX ?? 0) - (before.labelOffsetX ?? 0));
  const dy = Math.abs((after.labelOffsetY ?? 0) - (before.labelOffsetY ?? 0));
  return dx > 0.5 || dy > 0.5;
}
