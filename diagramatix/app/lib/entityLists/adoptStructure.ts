/**
 * Adopt an org-master EntityList into a project as its OWN independent COPY.
 *
 * The data effects of POST /api/projects/[id]/adopt-structure, extracted so
 * they can be unit-tested directly. The auth + impersonation gates stay in the
 * route; this is purely "what happens to the data".
 *
 * KEY INVARIANT (the whole point of the feature): the project gets a fresh
 * EntityList + EntityNode tree CLONED from the master. They are physically
 * separate rows — editing the project copy must never mutate the org master,
 * and editing the master later never retroactively changes an already-adopted
 * project copy. `sourceListId` records provenance only; it carries no live link.
 *
 * One list per kind per project: if the project already has a list of the
 * master's kind, the caller must opt in with `replace: true` (the existing
 * project copy + its nodes are deleted first).
 */
import { prisma } from "@/app/lib/db";

export class AdoptStructureError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export interface AdoptStructureResult {
  /** The new project-scoped EntityList id. */
  listId: string;
  /** How many nodes were cloned into the project copy. */
  nodeCount: number;
}

/**
 * Clone the org master `orgListId` (which must belong to `projectOrgId`) into a
 * project-scoped copy under `projectId`. Throws AdoptStructureError on a missing
 * master (404) or an existing same-kind list without `replace` (409).
 */
export async function adoptStructure(
  projectId: string,
  projectOrgId: string,
  orgListId: string,
  opts: { replace?: boolean } = {},
): Promise<AdoptStructureResult> {
  // The master must belong to the project's org.
  const master = await prisma.entityList.findFirst({
    where: { id: orgListId, orgId: projectOrgId },
    include: { nodes: true },
  });
  if (!master) throw new AdoptStructureError("Org structure not found", 404);

  const existing = await prisma.entityList.findFirst({
    where: { projectId, kind: master.kind }, select: { id: true },
  });
  if (existing && !opts.replace) {
    throw new AdoptStructureError(
      `This project already has a ${master.kind} list. Pass ?replace=true to overwrite.`,
      409,
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    if (existing) await tx.entityList.delete({ where: { id: existing.id } });
    const copy = await tx.entityList.create({
      data: { name: master.name, kind: master.kind, projectId, sourceListId: master.id },
    });
    // Insert nodes parents-first, remapping ids so parentId references resolve.
    const idMap = new Map<string, string>();
    const remaining = [...master.nodes];
    let guard = remaining.length + 1;
    while (remaining.length && guard-- > 0) {
      for (let i = remaining.length - 1; i >= 0; i--) {
        const n = remaining[i];
        if (n.parentId && !idMap.has(n.parentId)) continue; // wait for parent
        const newNode = await tx.entityNode.create({
          data: {
            listId: copy.id,
            parentId: n.parentId ? idMap.get(n.parentId)! : null,
            name: n.name, level: n.level, sortOrder: n.sortOrder,
          },
        });
        idMap.set(n.id, newNode.id);
        remaining.splice(i, 1);
      }
    }
    return copy;
  });

  return { listId: created.id, nodeCount: master.nodes.length };
}

// A transaction client (structural — avoids importing the generated Prisma types).
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
interface MasterNode {
  id: string; parentId: string | null; name: string; level: string; sortOrder: number;
  spDriveId: string | null; spItemId: string | null; spName: string | null; spWebUrl: string | null;
}

/** Clone master nodes into a project list, parents-first, remapping parentId and
 *  stamping each copy's `sourceNodeId` (provenance for Sync) + SharePoint fields. */
async function cloneNodesInto(tx: Tx, listId: string, masterNodes: MasterNode[]): Promise<number> {
  const idMap = new Map<string, string>();
  const remaining = [...masterNodes];
  let guard = remaining.length + 1;
  while (remaining.length && guard-- > 0) {
    for (let i = remaining.length - 1; i >= 0; i--) {
      const n = remaining[i];
      if (n.parentId && !idMap.has(n.parentId)) continue; // wait for parent
      const created = await tx.entityNode.create({
        data: {
          listId, parentId: n.parentId ? idMap.get(n.parentId)! : null,
          name: n.name, level: n.level as never, sortOrder: n.sortOrder,
          spDriveId: n.spDriveId, spItemId: n.spItemId, spName: n.spName, spWebUrl: n.spWebUrl,
          sourceNodeId: n.id,
        },
      });
      idMap.set(n.id, created.id);
      remaining.splice(i, 1);
    }
  }
  return masterNodes.length;
}

export interface AdoptFullResult { lists: number; nodes: number; }

/** Adopt a whole org-master EntityStructure (all five lists) into a project as
 *  independent COPIES. Each copy keeps `sourceListId`; each node keeps
 *  `sourceNodeId` — so "Sync updates" can later merge master changes while
 *  preserving the project's own additions. Replacing wipes ALL the project's
 *  existing entity lists first. */
export async function adoptStructureFull(
  projectId: string,
  projectOrgId: string,
  structureId: string,
  opts: { replace?: boolean } = {},
): Promise<AdoptFullResult> {
  const structure = await prisma.entityStructure.findFirst({
    where: { id: structureId, orgId: projectOrgId },
    include: { lists: { include: { nodes: true } } },
  });
  if (!structure) throw new AdoptStructureError("Structure not found", 404);

  const existingCount = await prisma.entityList.count({ where: { projectId } });
  if (existingCount > 0 && !opts.replace) {
    throw new AdoptStructureError("This project has already adopted a structure. Pass ?replace=true to overwrite.", 409);
  }

  let nodeTotal = 0;
  await prisma.$transaction(async (tx) => {
    if (existingCount > 0) await tx.entityList.deleteMany({ where: { projectId } });
    for (const master of structure.lists) {
      const copy = await tx.entityList.create({
        data: { name: master.name, kind: master.kind, projectId, sourceListId: master.id },
      });
      nodeTotal += await cloneNodesInto(tx, copy.id, master.nodes as MasterNode[]);
    }
  });
  return { lists: structure.lists.length, nodes: nodeTotal };
}
