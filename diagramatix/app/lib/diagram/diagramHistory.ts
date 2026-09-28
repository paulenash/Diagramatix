/**
 * The history snapshot every data-changing save of a diagram writes — the
 * version list's "restore" points. Shared by PUT /api/diagrams/[id] and the
 * phone's server-side generate job, so a generated diagram can be rolled back
 * exactly like a hand-edited one.
 */
import { prisma } from "@/app/lib/db";

/** How many snapshots a diagram keeps; older ones are pruned. */
export const DIAGRAM_HISTORY_KEEP = 50;

/** Snapshot the diagram AS SAVED (call after the write), then prune to the newest 50. */
export async function snapshotDiagramHistory(diagramId: string, userId: string): Promise<void> {
  const current = await prisma.diagram.findUnique({ where: { id: diagramId } });
  if (!current) return;
  const snapshot = {
    name: current.name,
    type: current.type,
    data: current.data,
    colorConfig: current.colorConfig,
    displayMode: current.displayMode,
  };
  await prisma.diagramHistory.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { diagramId, snapshot: snapshot as any, userId },
  });
  // Auto-prune: keep only the most recent 50 entries
  const all = await prisma.diagramHistory.findMany({
    where: { diagramId },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  if (all.length > DIAGRAM_HISTORY_KEEP) {
    const toDelete = all.slice(DIAGRAM_HISTORY_KEEP).map(h => h.id);
    await prisma.diagramHistory.deleteMany({ where: { id: { in: toDelete } } });
  }
}
