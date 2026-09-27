/**
 * Nesting depths that decide how a container is SHADED — a sub-lane takes the
 * sub-lane colour, a nested process group / expanded subprocess / UML package
 * gets lighter per level, and an ArchiMate element that contains others gets
 * lighter per level of what it contains.
 *
 * These were inline `useMemo`s in Canvas.tsx. They live here so the canvas and
 * the Project-screen tile picture (diagramThumbnail.ts) shade the same element
 * the same way — one rule, one place. Behaviour is unchanged from the inline
 * versions.
 */
import type { DiagramElement } from "./types";

type El = Pick<DiagramElement, "id" | "type" | "parentId">;

/** Lanes whose DIRECT parent is also a lane (sub-lanes). */
export function sublaneIdsOf(elements: readonly El[]): Set<string> {
  const laneIds = new Set(elements.filter((e) => e.type === "lane").map((e) => e.id));
  const result = new Set<string>();
  for (const el of elements) {
    if (el.type === "lane" && el.parentId && laneIds.has(el.parentId)) result.add(el.id);
  }
  return result;
}

/** Lane nesting depth: the number of lane ancestors (0 = top-level lane,
 *  1 = sub-lane, 2 = sub-sub-lane, …). */
export function laneDepths(elements: readonly El[]): Map<string, number> {
  const map = new Map<string, number>();
  const byId = new Map(elements.map((e) => [e.id, e] as const));
  for (const el of elements) {
    if (el.type !== "lane") continue;
    let depth = 0;
    let cur: El | undefined = el;
    const visited = new Set<string>();
    while (cur?.parentId && !visited.has(cur.id)) {
      visited.add(cur.id);
      const parent = byId.get(cur.parentId);
      if (!parent) break;
      if (parent.type === "lane") depth++;
      cur = parent;
    }
    map.set(el.id, depth);
  }
  return map;
}

/**
 * For every element whose type is in `types`: how many ancestors it has of its
 * OWN type (a process group inside a process group is 1; an expanded
 * subprocess inside a process group is 0). Used for process groups + expanded
 * subprocesses, and separately for UML packages.
 */
export function sameTypeAncestorDepths(elements: readonly El[], types: readonly string[]): Map<string, number> {
  const want = new Set(types);
  const map = new Map<string, number>();
  // First occurrence wins, as `elements.find` did.
  const byId = new Map<string, El>();
  for (const e of elements) if (!byId.has(e.id)) byId.set(e.id, e);
  for (const el of elements) {
    if (!want.has(el.type)) continue;
    let depth = 0;
    let cur: El = el;
    const visited = new Set<string>();
    while (cur.parentId && !visited.has(cur.id)) {
      visited.add(cur.id);
      const parent = byId.get(cur.parentId);
      if (!parent) break;
      if (parent.type === el.type) depth++;
      cur = parent;
    }
    map.set(el.id, depth);
  }
  return map;
}

/**
 * ArchiMate descendant depth: for every archimate-shape, the depth of its
 * deepest chain of contained elements (0 = leaf, 1 = parent of leaves,
 * 2 = grandparent, …).
 */
export function archimateDescendantDepths(elements: readonly El[]): Map<string, number> {
  const m = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const e of elements) {
    if (e.parentId) {
      if (!children.has(e.parentId)) children.set(e.parentId, []);
      children.get(e.parentId)!.push(e.id);
    }
  }
  function depth(id: string, visited: Set<string>): number {
    if (m.has(id)) return m.get(id)!;
    if (visited.has(id)) return 0;
    visited.add(id);
    const kids = children.get(id) ?? [];
    if (kids.length === 0) { m.set(id, 0); return 0; }
    let maxChildDepth = 0;
    for (const kid of kids) maxChildDepth = Math.max(maxChildDepth, depth(kid, visited));
    const d = maxChildDepth + 1;
    m.set(id, d);
    return d;
  }
  for (const e of elements) if (e.type === "archimate-shape") depth(e.id, new Set());
  return m;
}
