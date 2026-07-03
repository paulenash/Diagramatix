/**
 * Adopt a portable MiningExamplePackage INTO a fresh project owned by the
 * caller — recreates the reference state-machine diagram(s) (element/connector
 * ids preserved so conformance-by-label + overlay ids stay valid) and a ready
 * ProcessMiningRun (mapping + compressed variants + performance + stats), with
 * the run's `referenceSmId` remapped to the freshly-minted diagram id. The user
 * lands in DiagramatixMINER with the run present — Discover / Conformance /
 * Calibrate & simulate all work immediately. The inverse of captureMiningPackage.
 *
 * Mirrors app/lib/simulation/adoptPackage.ts.
 */
import { prisma } from "@/app/lib/db";
import type { MiningExamplePackage } from "./examplePackage";

export interface AdoptMiningCtx {
  userId: string;
  orgId: string;
  ownerName: string;
  projectName: string;
}

export async function adoptMiningPackage(
  pkg: MiningExamplePackage,
  ctx: AdoptMiningCtx,
): Promise<{ projectId: string; projectName: string; runId: string; openDiagramId: string | null }> {
  // One transaction so a partial failure never leaves a half-built project.
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: { name: ctx.projectName, userId: ctx.userId, orgId: ctx.orgId, ownerName: ctx.ownerName },
    });

    // Reference diagrams — preserve `data`; pre-assign ids so the run's
    // referenceSmKey (a package KEY) can point at the new id.
    const keyToDiagramId = new Map<string, string>();
    for (const d of pkg.diagrams) keyToDiagramId.set(d.key, crypto.randomUUID());
    for (const d of pkg.diagrams) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = JSON.parse(JSON.stringify(d.data)) as any;
      await tx.diagram.create({
        data: {
          id: keyToDiagramId.get(d.key)!, name: d.name, type: d.type || "state-machine",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: data as any,
          userId: ctx.userId, diagramOwnerId: ctx.userId, orgId: ctx.orgId, projectId: project.id,
        },
      });
    }

    // The run — scalars via Prisma, the four JSON columns via raw SQL (Prisma 7
    // omits ProcessMiningRun JSON writes from model inputs; matches the import route).
    const r = pkg.run;
    const referenceSmId = r.referenceSmKey ? keyToDiagramId.get(r.referenceSmKey) ?? null : null;
    const run = await tx.processMiningRun.create({
      data: { name: r.name, projectId: project.id, orgId: ctx.orgId, createdById: ctx.userId, referenceSmId },
    });
    await tx.$executeRaw`UPDATE "ProcessMiningRun" SET mapping = ${JSON.stringify(r.mapping)}::jsonb, stats = ${JSON.stringify(r.stats)}::jsonb, variants = ${JSON.stringify(r.variants)}::jsonb, performance = ${JSON.stringify(r.performance)}::jsonb, "updatedAt" = NOW() WHERE id = ${run.id}`;

    const openDiagramId = referenceSmId ?? keyToDiagramId.values().next().value ?? null;
    return { projectId: project.id, projectName: project.name, runId: run.id, openDiagramId };
  });
}
