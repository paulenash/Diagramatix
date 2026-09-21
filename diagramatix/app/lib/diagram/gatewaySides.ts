/**
 * Which vertex of a gateway a flow should meet.
 *
 * Paul, 21 September 2026: "Connections to Merge Gateways should follow the
 * connection convention for connecting to a Merge Gateway. Elements above
 * connect to the top gateway vertex, elements that horizontally overlap with
 * the middle left vertex, and elements below to the bottom vertex."
 *
 * A merge gathers branches back together, so the picture reads as a funnel:
 * the branch that ran above comes down into the top point, the one that ran
 * below comes up into the bottom point, and the one that carried straight on
 * arrives at the left point. Attaching all three to the left vertex — which is
 * what happened when nothing chose — draws three lines converging on one
 * corner and crossing each other to get there.
 *
 * THIS IS THE MIRROR OF A RULE THE PRODUCT ALREADY HAD. A DECISION gateway's
 * outgoing branches have picked their vertex by the same test since the
 * fan-out work: a branch above leaves the top point, one below leaves the
 * bottom, one on the same row leaves the right. The two rules are the same
 * geometry seen from opposite ends, so they are expressed here together —
 * a merge that behaved differently from a decision would be the surprise.
 *
 * WHAT COUNTS AS "ABOVE". Entirely above: the element's bottom edge is at or
 * over the gateway's top edge. Anything that overlaps the gateway's own band
 * at all is "level" and takes the side vertex. That is the same predicate the
 * add-branch fan-out uses, so a gateway built by voice and one built by hand
 * agree.
 *
 * Pure.
 */
import type { DiagramElement, Side } from "./types";

/** The vertical relationship of an element to a gateway. */
export type Band = "above" | "level" | "below";

export function bandOf(
  other: Pick<DiagramElement, "y" | "height">,
  gateway: Pick<DiagramElement, "y" | "height">,
): Band {
  if (other.y + other.height <= gateway.y) return "above";
  if (other.y >= gateway.y + gateway.height) return "below";
  return "level";
}

/**
 * The gateway vertex an INCOMING flow should meet — the merge convention.
 * `left` is the "middle left vertex": a diamond's left point sits at mid-height.
 */
export function mergeTargetSide(
  source: Pick<DiagramElement, "y" | "height">,
  gateway: Pick<DiagramElement, "y" | "height">,
): Side {
  const band = bandOf(source, gateway);
  return band === "above" ? "top" : band === "below" ? "bottom" : "left";
}

/**
 * The gateway vertex an OUTGOING flow should leave — the decision convention,
 * stated here so the two live together.
 */
export function decisionSourceSide(
  target: Pick<DiagramElement, "y" | "height">,
  gateway: Pick<DiagramElement, "y" | "height">,
): Side {
  const band = bandOf(target, gateway);
  return band === "above" ? "top" : band === "below" ? "bottom" : "right";
}

/**
 * The side the OTHER end should use, so the line leaves facing the gateway
 * rather than doubling back around the element.
 *
 * Only the cardinal choice — the offset is left to the caller, and a gateway
 * at this end gets its own vertex treatment afterwards.
 */
export function facingSide(band: Band, fallback: Side): Side {
  return band === "above" ? "bottom" : band === "below" ? "top" : fallback;
}

/** A gateway whose role is merge. The role defaults to DECISION when absent. */
export function isMergeGateway(
  el: Pick<DiagramElement, "type" | "properties"> | undefined,
): boolean {
  return !!el && el.type === "gateway" && el.properties?.gatewayRole === "merge";
}
