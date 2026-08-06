/**
 * Annotation export filtering (items M–P). Review Comments, Pain Points, and
 * Issues are authoring aids that most exports should omit. This is the single
 * place that knows which element/connector types those are, so every export
 * path filters them consistently.
 */
import type { DiagramData } from "./types";

export interface AnnotationInclude {
  reviewComments: boolean;
  painPoints: boolean;
  issues: boolean;
}

/** Default for the PDF/SVG/JSON dialog and the always-exclude paths: none in. */
export const NO_ANNOTATIONS: AnnotationInclude = { reviewComments: false, painPoints: false, issues: false };

const TYPE_FOR = {
  reviewComments: "review-comment",
  painPoints: "uml-pain-point",
  issues: "uml-issue",
} as const;

/** Return a copy of `data` with the DESELECTED annotation element types removed,
 *  along with any connectors that referenced them (e.g. a review-comment-link).
 *  A no-op (returns the same object) when all three are included. */
export function filterAnnotations(data: DiagramData, include: AnnotationInclude): DiagramData {
  const drop = new Set<string>();
  if (!include.reviewComments) drop.add(TYPE_FOR.reviewComments);
  if (!include.painPoints) drop.add(TYPE_FOR.painPoints);
  if (!include.issues) drop.add(TYPE_FOR.issues);
  if (drop.size === 0) return data;

  const removedIds = new Set<string>();
  const elements = data.elements.filter((e) => {
    if (drop.has(e.type)) { removedIds.add(e.id); return false; }
    return true;
  });
  const connectors = (data.connectors ?? []).filter(
    (c) => !removedIds.has(c.sourceId) && !removedIds.has(c.targetId),
  );
  return { ...data, elements, connectors };
}

/** True if the diagram actually contains any of the three annotation types —
 *  used to decide whether the PDF/SVG/JSON options dialog is worth showing. */
export function hasAnnotations(data: DiagramData): boolean {
  return data.elements.some(
    (e) => e.type === "review-comment" || e.type === "uml-pain-point" || e.type === "uml-issue",
  );
}
