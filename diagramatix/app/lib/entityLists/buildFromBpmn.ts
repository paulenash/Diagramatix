/**
 * Populate a project's OrgStructure (Organisation Hierarchy) EntityList from its
 * BPMN diagrams. Mirrors the shape of adoptStructure.ts (a pure "what happens to
 * the data" unit the route calls after auth), but the SOURCE is the project's own
 * BPMN pools/lanes/sublanes rather than an org master.
 *
 * MERGE semantics (non-destructive): the derived tree is folded into the existing
 * OrgStructure list — a node is added only when no same-name child exists under
 * the same parent; existing nodes are never touched. Added nodes get
 * `sourceNodeId: null` (project-local), so a later "Sync updates" never removes them.
 */
import { prisma } from "@/app/lib/db";
import { extractOrgTreeFromBpmn, type OrgTreeNode } from "./bpmnOrgTree";

export interface BuildFromBpmnResult {
  listId: string;
  added: { organisations: number; orgUnits: number; teams: number };
}

export async function buildOrgStructureFromBpmn(
  projectId: string,
  _projectOrgId: string,
  opts: { name?: string } = {},
): Promise<BuildFromBpmnResult> {
  const diagrams = await prisma.diagram.findMany({
    where: { projectId, type: "bpmn" }, select: { data: true },
  });
  const tree = extractOrgTreeFromBpmn(diagrams);
  const added = { organisations: 0, orgUnits: 0, teams: 0 };
  const name = opts.name?.trim();

  const listId = await prisma.$transaction(async (tx) => {
    // Get-or-create the project's OrgStructure list (one per kind per project).
    let list = await tx.entityList.findFirst({ where: { projectId, kind: "OrgStructure" }, select: { id: true } });
    if (!list) {
      list = await tx.entityList.create({
        data: { name: name || "Organisation Hierarchy", kind: "OrgStructure", projectId },
        select: { id: true },
      });
    } else if (name) {
      await tx.entityList.update({ where: { id: list.id }, data: { name } });
    }

    // In-memory index of the current children per parent, so merge + sortOrder
    // don't need a round-trip per node.
    const existing = await tx.entityNode.findMany({
      where: { listId: list.id }, select: { id: true, parentId: true, name: true, sortOrder: true },
    });
    const childrenOf = new Map<string | null, { id: string; name: string; sortOrder: number }[]>();
    for (const n of existing) {
      const arr = childrenOf.get(n.parentId) ?? [];
      arr.push({ id: n.id, name: n.name, sortOrder: n.sortOrder });
      childrenOf.set(n.parentId, arr);
    }
    const findChild = (parentId: string | null, nm: string) =>
      (childrenOf.get(parentId) ?? []).find((c) => c.name.toLowerCase() === nm.toLowerCase());
    const nextSort = (parentId: string | null) =>
      (childrenOf.get(parentId) ?? []).reduce((m, c) => Math.max(m, c.sortOrder), -1) + 1;

    const mergeNode = async (node: OrgTreeNode, parentId: string | null): Promise<void> => {
      let id = findChild(parentId, node.name)?.id;
      if (!id) {
        const so = nextSort(parentId);
        const created = await tx.entityNode.create({
          data: { listId: list!.id, parentId, name: node.name, level: node.level, sortOrder: so, sourceNodeId: null },
          select: { id: true },
        });
        id = created.id;
        (childrenOf.get(parentId) ?? childrenOf.set(parentId, []).get(parentId)!).push({ id, name: node.name, sortOrder: so });
        if (node.level === "Organisation") added.organisations++;
        else if (node.level === "OrgUnit") added.orgUnits++;
        else added.teams++;
      }
      for (const child of node.children) await mergeNode(child, id);
    };
    for (const root of tree) await mergeNode(root, null);
    return list.id;
  });

  return { listId, added };
}
