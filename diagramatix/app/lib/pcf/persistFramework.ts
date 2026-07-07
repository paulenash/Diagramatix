/** Persist a parsed APQC PCF workbook as a PcfFramework + its PcfNode tree.
 *  Shared by the seed script and the SuperAdmin import route. Idempotent per
 *  (familyKey, version, kind, orgId): re-importing the same version is a no-op.
 *  Pre-assigns node ids so parent links resolve in-memory and the whole tree
 *  goes in with a single createMany. */
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/app/generated/prisma/client";
import type { ParsedPcf } from "./importPcfXlsx";

export interface PcfFrameworkMeta {
  orgId: string | null;
  kind: "reference" | "tailored";
  familyKey: string;
  name: string;
  variant: string;
  version: string;
  sourceKNumber?: string | null;
  division?: string | null;
}

export interface PersistResult { frameworkId: string; nodeCount: number; skipped: boolean }

export async function persistPcfFramework(
  prisma: PrismaClient,
  parsed: ParsedPcf,
  meta: PcfFrameworkMeta,
): Promise<PersistResult> {
  const orgId = meta.orgId ?? null;
  const existing = await prisma.pcfFramework.findFirst({
    where: { familyKey: meta.familyKey, version: meta.version, kind: meta.kind, orgId },
    select: { id: true },
  });
  if (existing) return { frameworkId: existing.id, nodeCount: 0, skipped: true };

  // The newest imported version of a reference family becomes the current one.
  if (meta.kind === "reference") {
    await prisma.pcfFramework.updateMany({ where: { familyKey: meta.familyKey, kind: "reference", orgId, isCurrent: true }, data: { isCurrent: false } });
  }

  const fw = await prisma.pcfFramework.create({
    data: {
      orgId, kind: meta.kind, familyKey: meta.familyKey, name: meta.name,
      variant: meta.variant, version: meta.version, sourceKNumber: meta.sourceKNumber ?? null,
      division: meta.division ?? null, attributionNote: parsed.attributionNote, isCurrent: true,
    },
  });

  // Pre-assign ids, resolve parentId in-memory (parents-before-children ordering).
  const sorted = [...parsed.nodes].sort((a, b) => a.level - b.level || a.hierarchyId.localeCompare(b.hierarchyId, undefined, { numeric: true }));
  const idByHierarchy = new Map<string, string>();
  for (const n of sorted) idByHierarchy.set(n.hierarchyId, randomUUID());

  const data = sorted.map((n, i) => ({
    id: idByHierarchy.get(n.hierarchyId)!,
    frameworkId: fw.id,
    pcfId: n.pcfId,
    hierarchyId: n.hierarchyId,
    name: n.name,
    description: n.description,
    level: n.level,
    parentId: n.parentHierarchyId ? (idByHierarchy.get(n.parentHierarchyId) ?? null) : null,
    sortOrder: i,
    metricsAvailable: n.metricsAvailable,
    changeType: n.changeType,
  }));
  await prisma.pcfNode.createMany({ data });
  return { frameworkId: fw.id, nodeCount: data.length, skipped: false };
}
