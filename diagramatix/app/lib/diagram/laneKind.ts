/**
 * B6 — is this lane a sub-lane? There are two right answers, which is the bug.
 *
 * A sub-lane can reach the document in either of two shapes:
 *
 *   • `type: "lane"` with a **lane parent** — what every interactive path
 *     produces. `SPLIT_LANE_EVEN`, the palette, a drag-in: all of them make an
 *     ordinary lane and nest it.
 *   • `type: "sublane"` — what the AI plan converter stamps (`planBpmn.ts`) and
 *     what the Visio V3 importer reads, so the layout engine renders a nested
 *     band without having to walk parents.
 *
 * Code that tests only `e.type === "sublane"` therefore misses every sub-lane a
 * user made by hand, and code that tests only the parent misses every one that
 * arrived from the AI or an import. Three guards in the Voice Assist apply loop
 * were of the first kind, so "delete the sublane Staff" asked "which lane?
 * there are 4" — it counted top-level lanes as siblings and never stripped the
 * word "sublane" from the spoken name, so the name could not match either.
 *
 * `resolveRef`'s positional pass had the mirror-image gap: it recognised the
 * parent shape and not the stamped type, so "the middle sublane" found nothing
 * on a generated diagram.
 *
 * One rule, one place. Pure.
 */
import type { DiagramElement } from "./types";

/** Every type that is a lane of some sort, whichever shape it arrived in. */
export function isAnyLane(e: DiagramElement): boolean {
  return e.type === "lane" || e.type === "sublane";
}

/**
 * A sub-lane: stamped as one, or an ordinary lane nested inside another lane.
 *
 * Nesting deeper than one level (a sub-sub-lane) is still a sub-lane — the
 * distinction that matters everywhere this is used is "is it a band inside a
 * band", not how many bands deep.
 */
export function isSublane(e: DiagramElement, elements: readonly DiagramElement[]): boolean {
  if (e.type === "sublane") return true;
  if (e.type !== "lane" || !e.parentId) return false;
  const parent = elements.find((p) => p.id === e.parentId);
  return !!parent && isAnyLane(parent);
}

/** A lane that is NOT nested in another lane — i.e. a band directly in a pool. */
export function isTopLevelLane(e: DiagramElement, elements: readonly DiagramElement[]): boolean {
  return isAnyLane(e) && !isSublane(e, elements);
}

/**
 * What to call this element when speaking to the user: "sub-lane" reads better
 * than "lane" when that is what they pointed at, and the two are counted
 * separately — a sub-lane's siblings are the other sub-lanes, not every lane on
 * the diagram.
 */
export function laneKindWord(e: DiagramElement, elements: readonly DiagramElement[]): "sub-lane" | "lane" {
  return isSublane(e, elements) ? "sub-lane" : "lane";
}

/**
 * The elements of the same kind as `e` — the set a "which one did you mean?"
 * guard should count. For a lane that means lanes at the same nesting level,
 * not every lane in the document.
 */
export function sameKindAs(e: DiagramElement, elements: readonly DiagramElement[]): DiagramElement[] {
  if (isAnyLane(e)) {
    const wantSub = isSublane(e, elements);
    return elements.filter((x) => isAnyLane(x) && isSublane(x, elements) === wantSub);
  }
  return elements.filter((x) => x.type === e.type);
}
