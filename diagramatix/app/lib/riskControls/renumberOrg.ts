/** Server-side apply of the org-wide RCM renumber: reads an org's whole catalog,
 *  computes new codes (pure `assignOrgWideCodes`), writes item codes + the per-kind
 *  sequence counters, and rewrites the cached codes on diagram attachments.
 *
 *  Renumbering only ever touches `code` fields. Traceability LINKS and on-model
 *  attachments key off item **ids**, never codes, so every link is preserved.
 *
 *  Shared by `scripts/renumber-org-rcm-codes.ts` (its own client) and the
 *  OrgAdmin renumber route (`app/api/orgs/[id]/risk-controls/renumber`). */
import type { PrismaClient } from "@/app/generated/prisma/client";
import { assignOrgWideCodes, type RenumberLib } from "./renumber";
import type { RiskControlKind } from "./types";

export interface RenumberResult { groups: number; items: number; diagrams: number }

export async function renumberOrgCodes(
  prisma: PrismaClient,
  orgId: string,
  opts?: { kinds?: RiskControlKind[] },
): Promise<RenumberResult> {
  const rows = await prisma.riskControlLibrary.findMany({
    where: { OR: [{ orgId }, { project: { orgId } }] },
    select: { id: true, orgId: true, sourceLibraryId: true, items: { select: { id: true, kind: true, code: true, name: true } } },
  });
  if (rows.length === 0) return { groups: 0, items: 0, diagrams: 0 };

  const libs: RenumberLib[] = rows.map((l) => ({ id: l.id, isMaster: !!l.orgId, sourceLibraryId: l.sourceLibraryId, items: l.items }));
  const { newCodeByItem, counters } = assignOrgWideCodes(libs, opts?.kinds);

  // Item codes + the per-(org,kind) sequence counters, in one transaction.
  await prisma.$transaction(async (tx) => {
    for (const [itemId, code] of newCodeByItem) await tx.riskControlItem.update({ where: { id: itemId }, data: { code } });
    for (const c of counters) await tx.riskControlCodeSequence.upsert({ where: { orgId_kind: { orgId, kind: c.kind } }, create: { orgId, kind: c.kind, counter: c.count }, update: { counter: c.count } });
  }, { timeout: 120_000 });

  // Rewrite element.properties.risk[].code across the org's diagrams by itemId
  // (the id is the real link; the cached code is display-only and would go stale).
  const diagrams = await prisma.diagram.findMany({ where: { project: { orgId } }, select: { id: true, data: true } });
  let touched = 0;
  for (const d of diagrams) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (d.data ?? {}) as any;
    let changed = false;
    for (const el of data.elements ?? []) {
      const rc = el?.properties?.risk;
      if (!rc) continue;
      for (const key of ["riskRefs", "controlRefs"] as const) {
        for (const ref of rc[key] ?? []) {
          const nc = newCodeByItem.get(ref.itemId);
          if (nc && nc !== ref.code) { ref.code = nc; changed = true; }
        }
      }
    }
    if (changed) { await prisma.$executeRawUnsafe('UPDATE "Diagram" SET data = $1::jsonb, "updatedAt" = NOW() WHERE id = $2', JSON.stringify(data), d.id); touched++; }
  }

  return { groups: counters.reduce((s, c) => s + c.count, 0), items: newCodeByItem.size, diagrams: touched };
}
