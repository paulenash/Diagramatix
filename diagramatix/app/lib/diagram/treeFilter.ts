/**
 * Filtering the Project screen's navigation tree.
 *
 * Paul, 2026-09-14: "Add filtering option for the Navigation Tree on the Project
 * Screen. By Diagram Type, By name, By has AL [AI], By Has SI, etc."
 *
 * The facets are the diagram type, a name substring, and the feature badges the
 * tree already draws beside each diagram — AI, SI, MN, AP, RC — which come from
 * `diagramFeatureBadges` and therefore mean exactly what the badge means. A
 * filter with a private idea of "has simulation data" would drift from the
 * badge; this one cannot, because it reads the badge.
 *
 * Pure, so the rule is testable without the 4,600-line screen around it. The
 * screen applies it in the one function every folder's list goes through.
 */
import type { DiagramBadge, DiagramBadgeKey } from "./diagramFeatureBadges";

export interface TreeFilter {
  /** Case-insensitive substring of the diagram name. Empty = any. */
  name: string;
  /** Exact diagram type. Empty = any. */
  type: string;
  /** Every listed badge must be present (AND) — ticking two NARROWS the list. */
  badges: DiagramBadgeKey[];
}

export const EMPTY_TREE_FILTER: TreeFilter = { name: "", type: "", badges: [] };

export function isTreeFilterActive(f: TreeFilter): boolean {
  return f.name.trim() !== "" || f.type !== "" || f.badges.length > 0;
}

export function matchesTreeFilter(
  diagram: { name: string; type: string },
  badges: readonly DiagramBadge[],
  f: TreeFilter,
): boolean {
  const q = f.name.trim().toLowerCase();
  if (q && !diagram.name.toLowerCase().includes(q)) return false;
  if (f.type && diagram.type !== f.type) return false;
  if (f.badges.length) {
    const have = new Set(badges.map((b) => b.key));
    for (const k of f.badges) if (!have.has(k)) return false;
  }
  return true;
}
