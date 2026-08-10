/**
 * Build a review-comment element + its review-comment-link tether for a target
 * element — the same shape the desktop editor produces (useDiagram ADD_ELEMENT +
 * the ADD_CONNECTOR review branch, useDiagram.ts:6662-6681), so a note created on
 * mobile opens/edits identically on desktop. Pure; reuses `computeWaypoints`.
 */
import { computeWaypoints } from "./routing";
import type { Connector, DiagramElement } from "./types";

export const REVIEW_COMMENT_W = 227;
export const REVIEW_COMMENT_H = 144;

let seq = 0;
function mkId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function buildReviewComment(
  target: DiagramElement,
  elements: DiagramElement[],
  text: string,
  author: { reviewerId?: string; reviewerName?: string },
): { element: DiagramElement; connector: Connector } {
  const element: DiagramElement = {
    id: mkId("rc"),
    type: "review-comment",
    x: target.x + target.width + 40,
    y: Math.max(0, target.y - 80),
    width: REVIEW_COMMENT_W,
    height: REVIEW_COMMENT_H,
    label: text,
    properties: {
      ...(author.reviewerName ? { reviewerName: author.reviewerName } : {}),
      ...(author.reviewerId ? { reviewerId: author.reviewerId } : {}),
      createdStamp: new Date().toISOString(),
    },
  };
  const sourceSide = "left" as const, targetSide = "right" as const;
  const { waypoints, sourceInvisibleLeader, targetInvisibleLeader } =
    computeWaypoints(element, target, [...elements, element], sourceSide, targetSide, "direct", 0.5, 0.5);
  const connector: Connector = {
    id: mkId("rcl"),
    sourceId: element.id,
    targetId: target.id,
    sourceSide,
    targetSide,
    sourceOffsetAlong: 0.5,
    targetOffsetAlong: 0.5,
    type: "review-comment-link",
    directionType: "non-directed",
    routingType: "direct",
    sourceInvisibleLeader,
    targetInvisibleLeader,
    waypoints,
    label: "",
  };
  return { element, connector };
}
