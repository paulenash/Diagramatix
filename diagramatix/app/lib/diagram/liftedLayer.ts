/**
 * What rises with a container while it is being dragged.
 *
 * Paul, 18 September 2026, asked for a pool crossing other pools or loose
 * elements to be "always on top and not interact at all with elements they
 * cross over". The canvas does that by LIFTING the dragged container and
 * everything travelling with it into an overlay drawn after every other pass.
 *
 * Paul, 21 September 2026: "When a Pool is selected and the arrow keys are
 * used to move it part of the content disappears. Lanes, sublanes and sequence
 * connectors disappear, other elements remain visible."
 *
 * Nothing was hidden — it was COVERED. The overlay lifted the pool and its
 * tasks but not its lanes and not its flows, so an opaque pool body was drawn
 * straight over the two of them. The tasks looked fine only because they
 * happened to be in the lifted list as well.
 *
 * A connector is the interesting case, and the reason this is a module rather
 * than an inline test: it belongs to two elements, so "is it travelling?" has
 * a real answer only when BOTH ends are. One that crosses out of the group
 * stays where it is — it is the connector's job to show that it leaves.
 *
 * Pure.
 */

export interface ConnectorEnds {
  sourceId: string;
  targetId: string;
}

/**
 * Does this connector travel with the current drag?
 *
 * Both ends must be lifted. A connector with one end outside stays in the
 * normal pass, where it keeps its relationship to the part of the diagram
 * that did not move.
 */
export function connectorTravels(conn: ConnectorEnds, isLifted: (id: string) => boolean): boolean {
  return isLifted(conn.sourceId) && isLifted(conn.targetId);
}

/**
 * The order the lifted overlay draws in: the container first, then its
 * divisions, then the flows between its contents, then the contents.
 *
 * The same order the canvas uses everywhere else, which is the point — a group
 * that rises should look exactly as it did, only higher.
 */
export const LIFTED_LAYER_ORDER = ["container", "lane", "connector", "element"] as const;
export type LiftedLayer = (typeof LIFTED_LAYER_ORDER)[number];

/** Where a thing sits in that order; lower draws first. */
export function liftedLayerOf(kind: LiftedLayer): number {
  return LIFTED_LAYER_ORDER.indexOf(kind);
}
