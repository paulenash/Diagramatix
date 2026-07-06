/**
 * Build the order in which a diagram's elements + connectors are revealed by the
 * Animate feature. Ordering:
 *   1. Pools, 2. Lanes, 3. Sub-lanes (outermost containers first),
 *   4. Flow elements traversed Breadth- or Depth-first from the start events
 *      (following control-flow connectors), islands appended in reading order,
 *      boundary events revealed with their host,
 *   5. a connector is revealed the moment BOTH its endpoints are present.
 * Pure + deterministic (reading order = left-to-right, then top-to-bottom).
 */
import type { DiagramData, DiagramElement } from "./types";

export type AnimateTraversal = "bfs" | "dfs";

const CONTAINER = new Set(["pool", "lane", "sublane"]);
// Control-flow edge types we traverse for BFS/DFS ordering (not message/association).
const CONTROL_FLOW = new Set(["sequence", "transition", "flow", "flowline"]);

export function buildAnimationOrder(data: DiagramData, mode: AnimateTraversal): string[] {
  const order: string[] = [];
  const added = new Set<string>();
  const add = (id: string) => { if (id && !added.has(id)) { added.add(id); order.push(id); } };

  const byId = new Map(data.elements.map((e) => [e.id, e]));
  const reading = (a: DiagramElement, b: DiagramElement) => (a.x - b.x) || (a.y - b.y);
  const readingIds = (a: string, b: string) => {
    const ea = byId.get(a), eb = byId.get(b);
    return ea && eb ? reading(ea, eb) : 0;
  };

  // Reveal every connector whose endpoints are both already present (repeat until
  // stable — revealing one never unlocks another, but keep it robust).
  const revealReadyConnectors = () => {
    for (const c of data.connectors) {
      if (!added.has(c.id) && added.has(c.sourceId) && added.has(c.targetId)) add(c.id);
    }
  };

  // 1–3) Containers, outermost first.
  data.elements.filter((e) => e.type === "pool").sort(reading).forEach((e) => add(e.id));
  data.elements.filter((e) => e.type === "lane").sort(reading).forEach((e) => add(e.id));
  data.elements.filter((e) => e.type === "sublane").sort(reading).forEach((e) => add(e.id));
  revealReadyConnectors();

  // 4) Flow elements — BFS/DFS from start events over control-flow edges.
  const flow = data.elements.filter((e) => !CONTAINER.has(e.type));
  const flowSet = new Set(flow.map((e) => e.id));
  const adj = new Map<string, string[]>();
  for (const e of flow) adj.set(e.id, []);
  for (const c of data.connectors) {
    if (CONTROL_FLOW.has(c.type) && flowSet.has(c.sourceId) && flowSet.has(c.targetId)) {
      adj.get(c.sourceId)!.push(c.targetId);
    }
  }
  for (const arr of adj.values()) arr.sort(readingIds);

  // Root order: start events first (reading order), then every other flow element
  // (so disconnected islands / boundary events still get placed).
  const rootOrder: DiagramElement[] = [
    ...flow.filter((e) => e.type === "start-event").sort(reading),
    ...flow.filter((e) => e.type !== "start-event").sort(reading),
  ];
  let rootCursor = 0;
  const nextRoot = (): string | null => {
    while (rootCursor < rootOrder.length) {
      const id = rootOrder[rootCursor++].id;
      if (!added.has(id)) return id;
    }
    return null;
  };

  const revealBoundaryOf = (hostId: string) => {
    for (const e of flow) if (e.boundaryHostId === hostId && !added.has(e.id)) add(e.id);
  };

  const frontier: string[] = [];
  const visited = new Set<string>();
  while (true) {
    if (frontier.length === 0) {
      const r = nextRoot();
      if (r == null) break;
      frontier.push(r);
    }
    const id = mode === "bfs" ? frontier.shift()! : frontier.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    add(id);
    revealBoundaryOf(id);
    revealReadyConnectors();
    // DFS: push neighbours reversed so the first (leftmost) is explored first.
    const nbrs = adj.get(id) ?? [];
    const ordered = mode === "dfs" ? [...nbrs].reverse() : nbrs;
    for (const n of ordered) if (!visited.has(n)) frontier.push(n);
  }

  // Safety net: anything still unplaced (all endpoints are present by now).
  for (const e of data.elements) add(e.id);
  revealReadyConnectors();
  for (const c of data.connectors) add(c.id);

  return order;
}
