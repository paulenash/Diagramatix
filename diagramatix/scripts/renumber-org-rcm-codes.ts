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
import { renumberOrgCodes } from "../app/lib/riskControls/renumberOrg";

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const only = process.argv[2];
    const orgs = only ? [{ id: only }] : await prisma.org.findMany({ select: { id: true } });
    for (const o of orgs) {
      const r = await renumberOrgCodes(prisma, o.id);
      console.log(`org ${o.id}: ${r.groups} controls renumbered across ${r.items} item(s); ${r.diagrams} diagram(s) updated`);
    }
    console.log("Done.");
  } finally { await prisma.$disconnect(); }
}

main().catch((e) => { console.error(e); process.exit(1); });
