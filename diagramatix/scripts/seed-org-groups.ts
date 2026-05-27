/**
 * Seed one Org-wide Collaboration Group per Org.
 *
 * Idempotent: if a Collaboration Group with `orgId=org.id` and
 * `isOrgGroup=true` already exists, the script skips that Org. Otherwise:
 *
 *   1. Pick the Org's OrgMember with role=Owner — fall back to the
 *      oldest OrgMember if no Owner exists.
 *   2. Create a CollaborationGroup named "{org.name} — Org" owned by
 *      that user.
 *   3. Create a CollaborationGroupMember row (status=accepted) for
 *      every existing OrgMember in that Org.
 *
 * Run with:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/seed-org-groups.ts
 *
 * Against prod:
 *   DATABASE_URL="<prod url>" npx tsx scripts/seed-org-groups.ts
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });

  try {
    const orgs = await prisma.org.findMany({
      include: {
        members: {
          orderBy: { createdAt: "asc" },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });

    let inserted = 0;
    let skipped = 0;
    for (const org of orgs) {
      const existing = await prisma.collaborationGroup.findFirst({
        where: { orgId: org.id, isOrgGroup: true },
      });
      if (existing) {
        skipped++;
        continue;
      }
      if (org.members.length === 0) {
        console.warn(`  ! Skipping ${org.name} (${org.id}) — no OrgMembers`);
        skipped++;
        continue;
      }
      // Pick the Org Owner. Fall back to oldest member if none have
      // role=Owner (shouldn't happen post-Phase-0 backfill).
      const ownerMember =
        org.members.find(m => m.role === "Owner") ?? org.members[0];

      const group = await prisma.collaborationGroup.create({
        data: {
          name: `${org.name} — Org`,
          ownerId: ownerMember.userId,
          orgId: org.id,
          isOrgGroup: true,
          members: {
            create: org.members.map(m => ({
              userId: m.userId,
              status: "accepted",
              joinedAt: new Date(),
              // The Org Owner is `invitedBy=null` — they created the
              // group. For all other members, set invitedBy = Owner.
              invitedById: m.userId === ownerMember.userId ? null : ownerMember.userId,
            })),
          },
        },
      });
      console.log(`  + Created Org group "${group.name}" for org ${org.id} (owner=${ownerMember.user.email}, ${org.members.length} members)`);
      inserted++;
    }
    console.log(`Done. Created ${inserted} Org groups, skipped ${skipped} (already existed or empty).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
