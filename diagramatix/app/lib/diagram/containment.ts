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

/**
 * Every element that travels with a container: its children, theirs, and the
 * events mounted on any of them. Lifted out of useDiagram.ts (which re-exports
 * it) so the pure lane geometry (laneFit.ts) walks the same tree the reducer
 * does, without importing the reducer.
 */
export function getAllDescendantIds(elements: DiagramElement[], containerId: string): Set<string> {
  const result = new Set<string>();
  const queue = [containerId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of elements) {
      // Walk BOTH the parent-child edge AND the boundary-host edge so a
      // boundary event whose host is inside this container is treated
      // as a descendant. Without the boundaryHostId branch, dragging a
      // Lane / Pool that contains a Task with a boundary error event
      // would leave the boundary event behind.
      if ((e.parentId === id || e.boundaryHostId === id) && !result.has(e.id)) {
        result.add(e.id);
        queue.push(e.id);
      }
    }
  }
  return result;
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

/**
 * The parent an event on an element's edge takes, its host's parent being
 * `hostParentId`. It belongs where its host does — the mount convention
 * (MOVE_END, SET_EVENT_BOUNDARY and ADD_ELEMENT mount with the host's parent;
 * the BPMN export files a flow node under the lane its parentId names) —
 * except a start or end event on a sub-process's rim that the sub-process
 * already owns, as "Non-Interruptible Process Pattern" and "Expanded
 * Subprocess Loop" carry theirs. That one is the sub-process's OWN start or
 * end, and keeps it: the export nests it inside the <bpmn:subProcess> its
 * flows run in, and the simulator starts the sub-process's body there. Given
 * the host's lane, the export puts the start and end outside the sub-process
 * while their flows to its steps stay inside — each flow crossing the
 * sub-process's boundary — and the simulator finds no body to run.
 *
 * Asked wherever a host's parent is (re)decided: an applied template
 * (APPLY_TEMPLATE) and a drop that re-parents a host (useDiagram
 * `edgeEventsFollowHosts`, one element or many).
 */
export function edgeEventParentId(
  e: Pick<DiagramElement, "type" | "parentId" | "boundaryHostId">,
  hostParentId: string | undefined,
): string | undefined {
  const ownRim = (e.type === "start-event" || e.type === "end-event")
    && !!e.boundaryHostId && e.parentId === e.boundaryHostId;
  return ownRim ? e.parentId : hostParentId;
}
