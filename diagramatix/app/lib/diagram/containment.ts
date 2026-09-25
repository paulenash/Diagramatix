/**
 * Shared container-membership helpers for diagram elements.
 *
 * Membership (which pool / lane / sublane / expanded-subprocess an element sits
 * in) is recorded by `element.parentId` and resolved by walking that chain.
 * These helpers were duplicated inline across prompt-from-diagram.ts,
 * bpmnLayout.ts, useDiagram.ts and diagramChecks.ts; they're lifted here so the
 * SOP extractor (and everyone else) resolves membership one canonical way.
 *
 * Each takes a pre-built id→element index (`indexById`) so a caller resolving
 * many elements pays the map-build cost once. Guarded at depth 16 against cycles.
 */
import type { DiagramElement } from "./types";

export type ElementIndex = Map<string, DiagramElement>;

export function indexById(elements: DiagramElement[]): ElementIndex {
  return new Map(elements.map((e) => [e.id, e]));
}

/** The containing LANE, or null when the element sits directly in a pool (or has
 *  no lane ancestor). Walks up the parentId chain, stopping at the first lane;
 *  hitting a pool first means "no lane". */
export function laneOf(el: DiagramElement | undefined, byId: ElementIndex): DiagramElement | null {
  let cur = el;
  let guard = 0;
  while (cur && guard++ < 16) {
    const p = cur.parentId ? byId.get(cur.parentId) : undefined;
    if (!p) return null;
    if (p.type === "lane") return p;
    if (p.type === "pool") return null;
    cur = p;
  }
  return null;
}

/** The containing POOL (or the element itself if it IS a pool), else null. */
export function poolOf(el: DiagramElement | undefined, byId: ElementIndex): DiagramElement | null {
  let cur = el;
  let guard = 0;
  while (cur && guard++ < 16) {
    if (cur.type === "pool") return cur;
    const p = cur.parentId ? byId.get(cur.parentId) : undefined;
    if (!p) return null;
    cur = p;
  }
  return null;
}

/** Is `child` a descendant of container `ancestorId` (via the parentId chain)? */
export function isInside(child: DiagramElement, ancestorId: string, byId: ElementIndex): boolean {
  let cur: DiagramElement | undefined = child;
  let g = 0;
  while (cur && g++ < 16) {
    if (cur.parentId === ancestorId) return true;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return false;
}

/**
 * Elements no lane or pool ever OWNS: a marker (pain point, issue) sticks to
 * the shape it annotates, and a free-floating note (text annotation, review
 * comment) is deliberately unowned — adopted into a lane, it would travel with
 * that lane. The lane pass (useDiagram `reconcileLaneMembership`) skips them,
 * the parentage check does not expect them to have a lane, and an attached
 * template leaves them where they land.
 */
const LANE_UNOWNED_TYPES: ReadonlySet<string> = new Set(["uml-pain-point", "uml-issue", "text-annotation", "review-comment"]);

export function isLaneUnowned(el: { type: string }): boolean {
  return LANE_UNOWNED_TYPES.has(el.type);
}
