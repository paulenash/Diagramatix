/**
 * Adopt an org-master Risk & Control library into a project as its OWN
 * independent COPY. Mirrors app/lib/entityLists/adoptStructure.ts.
 *
 * KEY INVARIANT: the project gets a fresh RiskControlLibrary + Item + Link set
 * CLONED from the master — physically separate rows. Editing the project copy
 * never mutates the org master, and editing the master later never changes an
 * already-adopted project copy. `sourceLibraryId` records provenance only.
 *
 * One library per project: if the project already has one, the caller must opt
 * in with `replace: true` (the existing copy + its items/links are deleted).
 */
import { prisma } from "@/app/lib/db";

export class AdoptLibraryError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export interface AdoptLibraryResult {
  libraryId: string;
  itemCount: number;
  linkCount: number;
}

export async function adoptLibrary(
  projectId: string,
  projectOrgId: string,
  orgLibraryId: string,
  opts: { replace?: boolean } = {},
): Promise<AdoptLibraryResult> {
  const master = await prisma.riskControlLibrary.findFirst({
    where: { id: orgLibraryId, orgId: projectOrgId },
    include: { items: true, links: true },
  });
  if (!master) throw new AdoptLibraryError("Risk & Control library not found", 404);

  const existing = await prisma.riskControlLibrary.findFirst({
    where: { projectId }, select: { id: true },
  });
  if (existing && !opts.replace) {
    throw new AdoptLibraryError("This project already has a Risk & Control library. Pass ?replace=true to overwrite.", 409);
  }

  const created = await prisma.$transaction(async (tx) => {
    if (existing) await tx.riskControlLibrary.delete({ where: { id: existing.id } });
    const copy = await tx.riskControlLibrary.create({
      data: { name: master.name, projectId, sourceLibraryId: master.id },
    });
    // Clone items, remapping ids so links resolve to the new item ids.
    const idMap = new Map<string, string>();
    for (const it of master.items) {
      const newItem = await tx.riskControlItem.create({
        data: {
          libraryId: copy.id,
          kind: it.kind, code: it.code, name: it.name, description: it.description, sortOrder: it.sortOrder,
          likelihood: it.likelihood, impact: it.impact, riskCategory: it.riskCategory,
          controlType: it.controlType, frequency: it.frequency, owner: it.owner, frameworkRef: it.frameworkRef,
        },
      });
      idMap.set(it.id, newItem.id);
    }
    let linkCount = 0;
    for (const ln of master.links) {
      const sourceId = idMap.get(ln.sourceId), targetId = idMap.get(ln.targetId);
      if (!sourceId || !targetId) continue;
      await tx.riskControlLink.create({ data: { libraryId: copy.id, sourceId, targetId } });
      linkCount++;
    }
    return { copy, linkCount };
  });

  return { libraryId: created.copy.id, itemCount: master.items.length, linkCount: created.linkCount };
}
