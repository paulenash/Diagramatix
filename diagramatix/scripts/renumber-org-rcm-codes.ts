/**
 * One-time (and re-runnable) migration: renumber every Risk/Control/Policy/… code
 * ORG-WIDE. Today each project copy numbers independently (R-01, C-01…); after this
 * every org has a single sequence per kind (R-001, C-001…) shared across all its
 * projects, and clones of the same org-master control keep the SAME new code.
 *
 * Per org:
 *   1. Gather all its libraries (org master(s) + project copies) + items.
 *   2. Canonicalise: a project-copy item cloned from an org master (library
 *      `sourceLibraryId` → that master, matched by code) shares one canonical group
 *      with the master control; anything else is project-local (its own group).
 *   3. Assign new org-wide sequential codes per kind to each canonical group.
 *   4. Update every item's code; seed RiskControlCodeSequence.counter to the max.
 *   5. Rewrite the cached `code` on on-model attachments (element.properties.risk)
 *      in every diagram, keyed by itemId (the real link).
 *
 * Idempotent (stable ordering). Run: DATABASE_URL="…" npx tsx scripts/renumber-org-rcm-codes.ts [orgId]
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assignOrgWideCodes, type RenumberLib } from "../app/lib/riskControls/renumber";

async function renumberOrg(prisma: PrismaClient, orgId: string) {
  const rows = await prisma.riskControlLibrary.findMany({
    where: { OR: [{ orgId }, { project: { orgId } }] },
    select: { id: true, orgId: true, sourceLibraryId: true, items: { select: { id: true, kind: true, code: true, name: true } } },
  });
  if (rows.length === 0) return { org: orgId, groups: 0, items: 0 };

  const libs: RenumberLib[] = rows.map((l) => ({ id: l.id, isMaster: !!l.orgId, sourceLibraryId: l.sourceLibraryId, items: l.items }));
  const { newCodeByItem, counters } = assignOrgWideCodes(libs);

  // Apply: item codes, the sequence counters, then the cached codes on diagrams.
  await prisma.$transaction(async (tx) => {
    for (const [itemId, code] of newCodeByItem) await tx.riskControlItem.update({ where: { id: itemId }, data: { code } });
    for (const c of counters) await tx.riskControlCodeSequence.upsert({ where: { orgId_kind: { orgId, kind: c.kind } }, create: { orgId, kind: c.kind, counter: c.count }, update: { counter: c.count } });
  }, { timeout: 120_000 });

  // Rewrite element.properties.risk[].code across the org's diagrams by itemId.
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

  const groupCount = counters.reduce((s, c) => s + c.count, 0);
  return { org: orgId, groups: groupCount, items: newCodeByItem.size, diagrams: touched };
}

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const only = process.argv[2];
    const orgs = only ? [{ id: only }] : await prisma.org.findMany({ select: { id: true } });
    for (const o of orgs) {
      const r = await renumberOrg(prisma, o.id);
      console.log(`org ${r.org}: ${r.groups} controls renumbered across ${r.items} item(s); ${r.diagrams ?? 0} diagram(s) updated`);
    }
    console.log("Done.");
  } finally { await prisma.$disconnect(); }
}

main().catch((e) => { console.error(e); process.exit(1); });
