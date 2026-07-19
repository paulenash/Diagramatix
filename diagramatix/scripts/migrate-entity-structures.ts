/**
 * Migrate existing per-org Entity Lists into named Entity Structures.
 *
 * Before: an org held loose master lists — OrgStructure (0..n, named), Participant
 * (0..1), System (0..1). After: each org has one EntityStructure per OrgStructure
 * list, and every structure bundles the five lists (OrgStructure, Participant,
 * System, Document, DataStore). The org's existing Participant/System lists attach
 * to the FIRST structure; additional structures get clones of their nodes. Empty
 * Document/DataStore lists are created everywhere. An org with only Participant/
 * System (no OrgStructure) gets a single "Default" structure.
 *
 * Idempotent: a master list that already has a structureId is skipped.
 *
 *   export PATH="$PATH:/c/Program Files/nodejs"; cd diagramatix
 *   DATABASE_URL="<url>" npx tsx scripts/migrate-entity-structures.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const FLAT_LEVEL: Record<string, string> = { Participant: "Participant", System: "System", Document: "Document", DataStore: "DataStore" };

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const orgs = await prisma.org.findMany({ select: { id: true, name: true } });
    let structuresCreated = 0, listsCreated = 0;

    for (const org of orgs) {
      const masters = await prisma.entityList.findMany({
        where: { orgId: org.id, projectId: null },
        include: { nodes: true },
      });
      const orgStructs = masters.filter((l) => l.kind === "OrgStructure");
      const participant = masters.find((l) => l.kind === "Participant");
      const system = masters.find((l) => l.kind === "System");

      // Nothing to migrate for this org.
      if (orgStructs.length === 0 && !participant && !system) continue;
      // Already migrated (every OrgStructure has a structure) and no loose P/S.
      if (orgStructs.length > 0 && orgStructs.every((l) => l.structureId)) continue;

      // The structures to create = one per OrgStructure list, or a single Default.
      const targets = orgStructs.length > 0 ? orgStructs : [null];

      for (let i = 0; i < targets.length; i++) {
        const orgStructList = targets[i];
        if (orgStructList?.structureId) continue; // already grouped

        const struct = await prisma.entityStructure.create({
          data: { name: orgStructList?.name ?? "Default", orgId: org.id },
        });
        structuresCreated++;

        // Attach or create the OrgStructure list.
        if (orgStructList) {
          await prisma.entityList.update({ where: { id: orgStructList.id }, data: { structureId: struct.id } });
        } else {
          await prisma.entityList.create({ data: { name: "Organisation Hierarchy", kind: "OrgStructure", orgId: org.id, structureId: struct.id } });
          listsCreated++;
        }

        // Participant + System: attach the existing ones to the first structure,
        // clone their nodes into fresh lists for the rest.
        for (const [kind, src] of [["Participant", participant], ["System", system]] as const) {
          if (src && i === 0) {
            await prisma.entityList.update({ where: { id: src.id }, data: { structureId: struct.id } });
          } else {
            const copy = await prisma.entityList.create({ data: { name: kind === "Participant" ? "External Participants" : "IT Systems", kind, orgId: org.id, structureId: struct.id } });
            listsCreated++;
            if (src && src.nodes.length) {
              await prisma.entityNode.createMany({
                data: src.nodes.map((n) => ({ listId: copy.id, name: n.name, level: FLAT_LEVEL[kind] as never, sortOrder: n.sortOrder })),
              });
            }
          }
        }

        // Empty Documents + Data Stores lists.
        for (const kind of ["Document", "DataStore"] as const) {
          await prisma.entityList.create({ data: { name: kind === "Document" ? "Documents" : "Data Stores", kind, orgId: org.id, structureId: struct.id } });
          listsCreated++;
        }
      }
    }
    console.log(`Done. Structures created: ${structuresCreated}; lists created: ${listsCreated}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
