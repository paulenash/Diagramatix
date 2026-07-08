/**
 * APQC PCF coverage (Level 4a) — of the PCF processes in scope, which are
 * MODELLED (have a diagram classified against them)? Pure + injective so it can
 * be unit-tested without the DB. The route feeds it the framework's nodes and
 * the project's diagram classifications; it returns per-node coverage plus
 * category / level rollups.
 */

export interface CoverageNodeIn {
  id: string;
  pcfId: number;
  hierarchyId: string;
  name: string;
  level: number;
  parentId: string | null;
}

/** A diagram's classification, as read from DiagramData.pcf. */
export interface Classification {
  nodeId?: string;
  pcfId?: number;
  frameworkId?: string;
  diagramId: string;
  diagramName: string;
}

export interface CoverageNode extends CoverageNodeIn {
  modelled: boolean;              // a diagram is classified directly to this node
  subtreeTotal: number;          // nodes in this node's subtree (self inclusive)
  subtreeModelled: number;       // modelled nodes in this node's subtree (self inclusive)
  diagrams: { id: string; name: string }[]; // diagrams classified directly here
}

export interface CoverageResult {
  nodes: CoverageNode[];
  total: number;
  modelled: number;
  byLevel: { level: number; total: number; modelled: number }[];
  /** One row per level-1 (Category) node, for the headline coverage bars. */
  byCategory: { id: string; hierarchyId: string; name: string; total: number; modelled: number }[];
}

export function computePcfCoverage(
  nodes: CoverageNodeIn[],
  classifications: Classification[],
  frameworkId: string,
): CoverageResult {
  const byId = new Map<string, CoverageNode>();
  for (const n of nodes) {
    byId.set(n.id, { ...n, modelled: false, subtreeTotal: 1, subtreeModelled: 0, diagrams: [] });
  }

  // Match a classification to a node: nodeId is exact; pcfId is the stable
  // fallback (survives a framework re-import that changes cuid nodeIds), gated
  // on the same framework so a coincidental pcfId in another variant can't
  // false-positive.
  const byPcfId = new Map<number, CoverageNode>();
  for (const n of byId.values()) byPcfId.set(n.pcfId, n);
  for (const c of classifications) {
    let node: CoverageNode | undefined;
    if (c.nodeId && byId.has(c.nodeId)) node = byId.get(c.nodeId);
    else if (c.pcfId != null && c.frameworkId === frameworkId) node = byPcfId.get(c.pcfId);
    if (!node) continue;
    if (!node.diagrams.some((d) => d.id === c.diagramId)) node.diagrams.push({ id: c.diagramId, name: c.diagramName });
    node.modelled = true;
  }

  // Seed each node's subtree with itself, then propagate every node's
  // contribution up to its ANCESTORS. Walking each node to the root is
  // O(nodes × depth); depth ≤ 5 for APQC so this stays cheap.
  for (const n of byId.values()) {
    n.subtreeTotal = 1;
    n.subtreeModelled = n.modelled ? 1 : 0;
  }
  for (const n of byId.values()) {
    const self = n.modelled ? 1 : 0;
    let cur = n.parentId ? byId.get(n.parentId) : undefined;
    while (cur) {
      cur.subtreeTotal += 1;
      cur.subtreeModelled += self;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
  }

  const all = [...byId.values()];
  const total = all.length;
  const modelled = all.filter((n) => n.modelled).length;

  const levels = [...new Set(all.map((n) => n.level))].sort((a, b) => a - b);
  const byLevel = levels.map((level) => {
    const at = all.filter((n) => n.level === level);
    return { level, total: at.length, modelled: at.filter((n) => n.modelled).length };
  });

  const byCategory = all
    .filter((n) => n.parentId == null)
    .sort((a, b) => a.hierarchyId.localeCompare(b.hierarchyId, undefined, { numeric: true }))
    .map((n) => ({ id: n.id, hierarchyId: n.hierarchyId, name: n.name, total: n.subtreeTotal, modelled: n.subtreeModelled }));

  return { nodes: all, total, modelled, byLevel, byCategory };
}
