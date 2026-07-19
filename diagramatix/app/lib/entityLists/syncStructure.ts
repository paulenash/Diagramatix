/**
 * "Sync updates" for an adopted Entity Structure.
 *
 * A project adopts a COPY of an org-master structure (adoptStructureFull); each
 * copied node carries `sourceNodeId` → the master node it came from. Sync merges
 * the current master into the project copy:
 *   • ADD    master nodes that have no project counterpart,
 *   • UPDATE project master-origin nodes whose master was renamed / re-levelled /
 *            re-parented / re-linked (SharePoint),
 *   • REMOVE project master-origin nodes whose master was deleted upstream.
 * Project-local ADDITIONS (nodes with a null `sourceNodeId`) are never touched.
 * Model: the PCF-upgrade re-point, but per adopted list (matched by sourceListId).
 */
import { prisma } from "@/app/lib/db";

export interface SyncResult { added: number; updated: number; removed: number; lists: number; }

export async function syncStructure(projectId: string): Promise<SyncResult> {
  const projectLists = await prisma.entityList.findMany({
    where: { projectId, sourceListId: { not: null } },
    include: { nodes: true },
  });

  let added = 0, updated = 0, removed = 0, listsSynced = 0;

  await prisma.$transaction(async (tx) => {
    for (const pl of projectLists) {
      const master = await tx.entityList.findUnique({ where: { id: pl.sourceListId! }, include: { nodes: true } });
      if (!master) continue; // master gone → leave the copy (incl. its now-orphaned nodes) as-is
      listsSynced++;

      const masterById = new Map(master.nodes.map((n) => [n.id, n]));
      // Project master-origin nodes indexed by the master node they track.
      const projBySource = new Map<string, { id: string; parentId: string | null; name: string; level: string; sortOrder: number; spDriveId: string | null; spItemId: string | null; spName: string | null; spWebUrl: string | null }>();
      for (const pn of pl.nodes) if (pn.sourceNodeId) projBySource.set(pn.sourceNodeId, pn);

      // REMOVE: master-origin project nodes whose master no longer exists.
      for (const pn of pl.nodes) {
        if (pn.sourceNodeId && !masterById.has(pn.sourceNodeId)) {
          await tx.entityNode.delete({ where: { id: pn.id } });
          projBySource.delete(pn.sourceNodeId);
          removed++;
        }
      }

      // ADD + UPDATE, parents-first so a new node's project parent already exists.
      const remaining = [...master.nodes];
      let guard = remaining.length + 1;
      while (remaining.length && guard-- > 0) {
        for (let i = remaining.length - 1; i >= 0; i--) {
          const mn = remaining[i];
          if (mn.parentId && !projBySource.has(mn.parentId)) continue; // wait for parent to be mapped
          const parentProjId = mn.parentId ? projBySource.get(mn.parentId)!.id : null;
          const existing = projBySource.get(mn.id);
          if (existing) {
            if (existing.name !== mn.name || existing.level !== mn.level || existing.sortOrder !== mn.sortOrder
              || existing.parentId !== parentProjId
              || existing.spDriveId !== mn.spDriveId || existing.spItemId !== mn.spItemId
              || existing.spName !== mn.spName || existing.spWebUrl !== mn.spWebUrl) {
              await tx.entityNode.update({
                where: { id: existing.id },
                data: { name: mn.name, level: mn.level, sortOrder: mn.sortOrder, parentId: parentProjId, spDriveId: mn.spDriveId, spItemId: mn.spItemId, spName: mn.spName, spWebUrl: mn.spWebUrl },
              });
              updated++;
            }
          } else {
            const created = await tx.entityNode.create({
              data: { listId: pl.id, parentId: parentProjId, name: mn.name, level: mn.level, sortOrder: mn.sortOrder, spDriveId: mn.spDriveId, spItemId: mn.spItemId, spName: mn.spName, spWebUrl: mn.spWebUrl, sourceNodeId: mn.id },
            });
            projBySource.set(mn.id, { id: created.id, parentId: parentProjId, name: mn.name, level: mn.level, sortOrder: mn.sortOrder, spDriveId: mn.spDriveId, spItemId: mn.spItemId, spName: mn.spName, spWebUrl: mn.spWebUrl });
            added++;
          }
          remaining.splice(i, 1);
        }
      }
    }
  }, { timeout: 60_000, maxWait: 10_000 });

  return { added, updated, removed, lists: listsSynced };
}
