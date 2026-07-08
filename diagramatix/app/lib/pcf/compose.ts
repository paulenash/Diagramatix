/**
 * Tailored-framework composition (Level 5) — copy a branch from a reference (or
 * another) framework into an org's tailored framework, keeping PROVENANCE back
 * to the APQC source so attribution holds and the upgrade wizard can refresh it.
 * Pure + injective id-gen so it's deterministic under test.
 */

export interface SourceNode {
  id: string;
  pcfId: number;
  hierarchyId: string;
  name: string;
  description: string | null;
  level: number;
  parentId: string | null;
  sortOrder: number;
  metricsAvailable: boolean;
}

export interface ComposedNode {
  id: string;
  frameworkId: string;
  pcfId: number;
  hierarchyId: string;
  name: string;
  description: string | null;
  level: number;
  parentId: string | null;
  sortOrder: number;
  metricsAvailable: boolean;
  isCustom: false;
  active: true;
  orgCode: null;
  sourceFrameworkId: string;
  sourcePcfId: number;
}

/**
 * Copy the subtree rooted at `rootNodeId` (from `sourceNodes`) into
 * `targetFrameworkId` under `targetParentId` (null = top level). Every copied
 * node carries `sourceFrameworkId` + `sourcePcfId` provenance. Levels are
 * re-based so the copied root sits one below its new parent, keeping the tree
 * internally consistent wherever it's grafted.
 */
export function composeBranch(
  sourceNodes: SourceNode[],
  rootNodeId: string,
  targetFrameworkId: string,
  sourceFrameworkId: string,
  targetParent: { id: string; level: number } | null,
  newId: () => string,
): ComposedNode[] {
  const byId = new Map(sourceNodes.map((n) => [n.id, n]));
  const childrenByParent = new Map<string, SourceNode[]>();
  for (const n of sourceNodes) {
    if (!n.parentId) continue;
    (childrenByParent.get(n.parentId) ?? childrenByParent.set(n.parentId, []).get(n.parentId)!).push(n);
  }
  for (const kids of childrenByParent.values()) kids.sort((a, b) => a.sortOrder - b.sortOrder);

  const root = byId.get(rootNodeId);
  if (!root) return [];

  const baseLevel = (targetParent ? targetParent.level : 0) + 1; // level of the copied root
  const out: ComposedNode[] = [];

  // BFS carrying (sourceNode, newParentId, newLevel).
  const queue: { src: SourceNode; parentId: string | null; level: number }[] = [
    { src: root, parentId: targetParent?.id ?? null, level: baseLevel },
  ];
  while (queue.length) {
    const { src, parentId, level } = queue.shift()!;
    const id = newId();
    out.push({
      id,
      frameworkId: targetFrameworkId,
      pcfId: src.pcfId,
      hierarchyId: src.hierarchyId,
      name: src.name,
      description: src.description,
      level,
      parentId,
      sortOrder: src.sortOrder,
      metricsAvailable: src.metricsAvailable,
      isCustom: false,
      active: true,
      orgCode: null,
      sourceFrameworkId,
      sourcePcfId: src.pcfId,
    });
    for (const child of childrenByParent.get(src.id) ?? []) {
      queue.push({ src: child, parentId: id, level: level + 1 });
    }
  }
  return out;
}
