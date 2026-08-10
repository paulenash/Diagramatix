/**
 * Collapse a review-comment element to its icon form — pure, so mobile Save can
 * "always collapse review comments" without the editor's useReducer. Mirrors the
 * desktop TOGGLE_REVIEW_COLLAPSE collapse branch (useDiagram.ts): stash the
 * expanded geometry under `properties.expanded*` and shrink to the 38×32 icon, so
 * a desktop open can expand it back exactly. Idempotent.
 */
import type { DiagramData, DiagramElement } from "./types";

export const REVIEW_COLLAPSED_W = 38;
export const REVIEW_COLLAPSED_H = 32;

export function collapseReviewCommentElement(el: DiagramElement): DiagramElement {
  if (el.type !== "review-comment") return el;
  const props = (el.properties ?? {}) as Record<string, unknown>;
  if (props.collapsed) return el; // already collapsed — no double-stash
  return {
    ...el,
    width: REVIEW_COLLAPSED_W,
    height: REVIEW_COLLAPSED_H,
    properties: {
      ...props,
      collapsed: true,
      expandedWidth: el.width,
      expandedHeight: el.height,
      expandedX: el.x,
      expandedY: el.y,
    },
  };
}

/** Return a copy of the diagram with every review-comment collapsed. */
export function collapseAllReviewComments(data: DiagramData): DiagramData {
  return { ...data, elements: data.elements.map(collapseReviewCommentElement) };
}
