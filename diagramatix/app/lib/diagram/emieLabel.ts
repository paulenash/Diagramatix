/**
 * Where an edge-mounted intermediate event's (EMIE's) label starts out.
 *
 * Paul, 2026-09-19: "The default location for EMIE labels should be 1/2 the
 * initial default label length to the left of its current centrally placed
 * position, so it is clear of any outbound connector. This is on Manual
 * creation, Assist Creation and Voice Assist creation. If an EMIE is ever
 * manually placed on a vertical boundary then its label should be just above
 * the outgoing connector."
 *
 * The problem being solved: a boundary event's label is centred under the
 * event, and the event's whole job is to carry a sequence flow away from the
 * host — so the label and the outbound connector start life on top of each
 * other. Half a label-width to the left moves the text off the line without
 * moving it so far that it stops reading as this event's label.
 *
 * A LEFT or RIGHT mount is the different case. There the flow leaves
 * horizontally, straight through where a label below the event would sit, so
 * "left a bit" does not help: the label goes ABOVE the line instead, on the
 * side the line travels.
 *
 * Paul, 2026-09-19 after testing: "EMIE label placement good except when placed
 * on top horizontal boundary. The label should be outside the parent to the top
 * left of the EMIE."
 *
 * A TOP mount is the third case, and the reason is the same one in a different
 * direction: the event straddles the host's TOP edge, so everything below that
 * edge is the host's own body. A label the usual distance below the event lands
 * INSIDE the host, over whatever is drawn there. It goes above the event
 * instead — outside the parent entirely — and far enough left to clear the
 * event, since a top-mounted event sends its flow upward through the space
 * directly above it.
 *
 * Scope is deliberately the three USER creation paths — a palette drop, a drag
 * onto a host rim, and the assist/Voice Assist `addBoundary` op, all three of
 * which mount through the reducer. Generated diagrams keep R7.05 in
 * `bpmnLayout.ts`, which solves the same problem with the whole picture in
 * hand (it knows where the target is).
 *
 * Pure — the reducer merges what this returns into the element's properties.
 */
import type { DiagramElement } from "./types";

/** The renderer's fallback label width (`properties.labelWidth ?? 80`). */
export const DEFAULT_LABEL_WIDTH = 80;
/** The renderer's fallback for a label below the shape. */
export const DEFAULT_LABEL_OFFSET_Y = 7;
/** One wrapped line, per the renderer's `lines.length * 14`. */
export const LABEL_LINE_H = 14;
/** Air between the bottom of the label and the connector it sits above. */
export const CONNECTOR_CLEARANCE = 4;

export type BoundarySide = "top" | "bottom" | "left" | "right";

export interface LabelOffsets {
  labelOffsetX: number;
  labelOffsetY: number;
}

/**
 * Which edge of `host` the event has been dropped on, from the event's centre.
 * A tie goes to the horizontal edges: top and bottom are the ordinary mount,
 * and a corner drop reads as "on the top" far more often than "on the side".
 */
export function boundarySideOf(host: DiagramElement, ev: DiagramElement): BoundarySide {
  const cx = ev.x + ev.width / 2;
  const cy = ev.y + ev.height / 2;
  const toTop = Math.abs(cy - host.y);
  const toBottom = Math.abs(cy - (host.y + host.height));
  const toLeft = Math.abs(cx - host.x);
  const toRight = Math.abs(cx - (host.x + host.width));
  const horizontal = Math.min(toTop, toBottom);
  const vertical = Math.min(toLeft, toRight);
  if (horizontal <= vertical) return toTop <= toBottom ? "top" : "bottom";
  return toLeft <= toRight ? "left" : "right";
}

/** Is this a vertical (left/right) host edge — the case with its own rule? */
export const isVerticalBoundary = (side: BoundarySide): boolean =>
  side === "left" || side === "right";

/**
 * The label offsets for an EMIE freshly mounted on `side`.
 *
 * `labelOffsetX` shifts the label's CENTRE from the event's centre, and
 * `labelOffsetY` the label's TOP from the event's bottom — the two the
 * renderer reads.
 */
export function emieLabelOffset(side: BoundarySide, eventWidth: number, eventHeight: number): LabelOffsets {
  const half = DEFAULT_LABEL_WIDTH / 2;

  if (side === "top") {
    // Up and to the left, both by enough to be clear: the label's BOTTOM above
    // the event's top (which puts it outside the host, whose body starts at the
    // edge the event straddles), and its RIGHT edge left of the event's left
    // edge, out of the way of the flow leaving upward.
    return {
      labelOffsetX: -(half + eventWidth / 2 + CONNECTOR_CLEARANCE),
      labelOffsetY: -(eventHeight + LABEL_LINE_H + CONNECTOR_CLEARANCE),
    };
  }

  if (side === "bottom") {
    // Below a bottom mount is already outside the host, so only the sideways
    // shift is needed: half a label left of centre, at the usual distance down.
    return { labelOffsetX: -half, labelOffsetY: DEFAULT_LABEL_OFFSET_Y };
  }

  // Sit the label's BOTTOM just above the outgoing connector, which leaves
  // horizontally from the event's vertical centre; and put it on the side the
  // connector travels, so it labels that line rather than floating off it.
  return {
    labelOffsetX: side === "right" ? half : -half,
    labelOffsetY: -(eventHeight / 2 + LABEL_LINE_H + CONNECTOR_CLEARANCE),
  };
}

/**
 * The properties to merge when mounting `ev` on `host`. Returns the side too,
 * so the caller can store `boundarySide` the way the generated path does.
 */
export function emieMountProps(
  host: DiagramElement,
  ev: DiagramElement,
): LabelOffsets & { boundarySide: BoundarySide } {
  const side = boundarySideOf(host, ev);
  return { boundarySide: side, ...emieLabelOffset(side, ev.width, ev.height) };
}
