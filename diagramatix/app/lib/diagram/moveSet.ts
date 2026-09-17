/**
 * Which elements actually move when you move a selection.
 *
 * Moving a container takes its contents with it, and moving an element takes
 * anything mounted on its edge. Those two rules are obvious separately and
 * conflict the moment an element is mounted on one thing and parented to
 * another — which is exactly what Paul hit (2026-09-18):
 *
 *   Select "Pool 1", say "nudge selected up", and the Start, the End and three
 *   intermediate events mounted on the "Document Handling" subprocess slide up
 *   too, off the boundary they are mounted on. Their `parentId` said Pool 1
 *   while their `boundaryHostId` said the subprocess, and the move followed the
 *   parent.
 *
 * AN EDGE-MOUNTED ELEMENT FOLLOWS ITS HOST, NEVER ITS PARENT. Being mounted on
 * a boundary is a hard geometric commitment: the element sits ON that edge and
 * is meaningless a few pixels off it. Containment is a much looser statement
 * about where something lives, and for a boundary event it is close to
 * bookkeeping. So when the two disagree, the host wins.
 *
 * The one exception is an element the user selected outright. If you pick a
 * boundary event and move it, you meant to move it.
 *
 * Fixing this in the move set rather than at the voice command covers the mouse
 * drag too, which had the same defect and nobody had noticed.
 */
import type { DiagramElement } from "./types";

/**
 * Container types whose descendants travel with them.
 *
 * Takes the element's own `type` so the caller's narrower predicate (which is
 * keyed on the SymbolType union) can be passed straight in.
 */
export type IsContainer = (type: DiagramElement["type"]) => boolean;

/**
 * Is `child` drawn inside `container`?
 *
 * Measured from the child's CENTRE, the same test the drag and the wrap use, so
 * an element whose corner pokes out still counts as in. A small tolerance keeps
 * something sitting exactly on the edge on the inside, where it looks.
 */
export function centreInside(child: DiagramElement, container: DiagramElement): boolean {
  const EDGE = 2;
  const cx = child.x + child.width / 2;
  const cy = child.y + child.height / 2;
  return cx >= container.x - EDGE
    && cx <= container.x + container.width + EDGE
    && cy >= container.y - EDGE
    && cy <= container.y + container.height + EDGE;
}

/**
 * Every id that should move, given the ids the user asked to move.
 *
 * `descendantsOf` and `isContainer` are injected so this stays free of the
 * reducer's own helpers and can be tested on plain data.
 */
export function expandMoveSet(
  elements: DiagramElement[],
  ids: readonly string[],
  isContainer: IsContainer,
  descendantsOf: (elements: DiagramElement[], id: string) => Iterable<string>,
): Set<string> {
  const asked = new Set(ids);
  const moving = new Set(ids);
  const byId = new Map(elements.map((e) => [e.id, e] as const));

  // 1. Containers take their contents — the ones they are actually drawn
  //    around. `parentId` is bookkeeping and it goes stale: in Paul's diagram
  //    (2026-09-18) a row of elements sat well ABOVE Pool 1 while claiming it as
  //    their parent, so nudging the pool moved the entire diagram. A container
  //    is a visual statement; something drawn outside it is not in it, whatever
  //    the record says.
  for (const id of ids) {
    const el = byId.get(id);
    if (!el) continue;
    if (!isContainer(el.type)) continue;
    for (const d of descendantsOf(elements, id)) {
      const child = byId.get(d);
      if (child && !centreInside(child, el)) continue;
      moving.add(d);
    }
  }

  // 2. Anything mounted on something that is moving comes too — repeatedly,
  //    since a boundary event can be mounted on an element that is itself only
  //    moving because IT is mounted on something else.
  for (let pass = 0; pass < 8; pass++) {
    let grew = false;
    for (const e of elements) {
      if (moving.has(e.id)) continue;
      if (e.boundaryHostId && moving.has(e.boundaryHostId)) { moving.add(e.id); grew = true; }
    }
    if (!grew) break;
  }

  // 3. Drop anything edge-mounted whose host is staying put. Step 1 can sweep
  //    these in through a parent that has nothing to do with the boundary they
  //    live on. Repeated, because dropping one can orphan another mounted on it.
  for (let pass = 0; pass < 8; pass++) {
    let shrank = false;
    for (const id of [...moving]) {
      if (asked.has(id)) continue; // picked outright: the user meant it
      const el = elements.find((e) => e.id === id);
      if (!el?.boundaryHostId) continue;
      if (!moving.has(el.boundaryHostId)) { moving.delete(id); shrank = true; }
    }
    if (!shrank) break;
  }

  return moving;
}

/**
 * Edge-mounted elements whose `parentId` points somewhere their host is not.
 *
 * Not used to move anything — it is the reporting half. This state is legal to
 * hold and harmless to draw, but it is what made a pool nudge drag five events
 * off a subprocess, so it is worth being able to find.
 */
export function mountedAwayFromParent(elements: readonly DiagramElement[]): DiagramElement[] {
  const byId = new Map(elements.map((e) => [e.id, e] as const));
  const ancestors = (id: string | undefined): Set<string> => {
    const out = new Set<string>();
    let cur = id ? byId.get(id) : undefined;
    for (let i = 0; cur && i < 12; i++) {
      out.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return out;
  };
  return elements.filter((e) => {
    if (!e.boundaryHostId || !e.parentId) return false;
    // Fine when the host is the parent, or sits inside it, or contains it.
    if (e.boundaryHostId === e.parentId) return false;
    if (ancestors(e.boundaryHostId).has(e.parentId)) return false;
    if (ancestors(e.parentId).has(e.boundaryHostId)) return false;
    return true;
  });
}
