/**
 * Document collections (user-guide vs tech-design) must stay isolated:
 *   • the same slug may exist in BOTH collections (composite unique), but not
 *     twice within one collection,
 *   • a User Guide backup/restore (now collection-scoped) must NOT clobber the
 *     Technical Design Notes — the central correctness risk of the shared-model
 *     design.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { buildGuideBackup, restoreGuideBackup } from "@/app/lib/help/guideBackup";

beforeEach(truncateAll);

describe("document collections", () => {
  it("T0649 — same slug allowed across collections, rejected within one", async () => {
    await prisma.helpChapter.create({ data: { collection: "user-guide", slug: "overview", title: "UG Overview", sortOrder: 0 } });
    // Same slug in the other collection is fine.
    await expect(prisma.helpChapter.create({ data: { collection: "tech-design", slug: "overview", title: "TD Overview", sortOrder: 0 } })).resolves.toBeTruthy();
    // A duplicate within the SAME collection violates the composite unique.
    await expect(prisma.helpChapter.create({ data: { collection: "user-guide", slug: "overview", title: "dup", sortOrder: 1 } })).rejects.toThrow();
  });

  it("T0650 — a User Guide restore leaves the Technical Design Notes intact, category survives", async () => {
    // A tech-design chapter that must survive.
    const td = await prisma.helpChapter.create({ data: { collection: "tech-design", slug: "miner-design", title: "Miner Design", sortOrder: 0 } });
    await prisma.helpSection.create({ data: { chapterId: td.id, collection: "tech-design", heading: "Overview", bodyMarkdown: "notes", sortOrder: 0 } });
    // A user-guide chapter (WITH a category) to back up + restore.
    await prisma.helpChapter.create({ data: { collection: "user-guide", slug: "getting-started", title: "Getting Started", category: "Getting Started", sortOrder: 0 } });

    const backup = await buildGuideBackup("user-guide");           // scoped to user-guide only
    await restoreGuideBackup(backup, null, "user-guide");           // scoped wipe + re-insert

    // tech-design survived the restore untouched.
    expect(await prisma.helpChapter.count({ where: { collection: "tech-design" } })).toBe(1);
    const survivor = await prisma.helpChapter.findFirst({ where: { collection: "tech-design", slug: "miner-design" }, include: { sections: true } });
    expect(survivor?.title).toBe("Miner Design");
    expect(survivor?.sections.length).toBe(1);
    // user-guide restored, WITH its category preserved through the backup round-trip.
    expect(await prisma.helpChapter.count({ where: { collection: "user-guide" } })).toBe(1);
    const restored = await prisma.helpChapter.findFirst({ where: { collection: "user-guide", slug: "getting-started" } });
    expect(restored?.category).toBe("Getting Started");
  });

  it("T0901 — importing a Technical Design Notes backup under the User Guide is rejected", async () => {
    await prisma.helpChapter.create({ data: { collection: "tech-design", slug: "miner-design", title: "Miner Design", sortOrder: 0 } });
    const tdBackup = await buildGuideBackup("tech-design");
    // Restoring a tech-design file INTO user-guide must throw before touching the DB.
    await expect(restoreGuideBackup(tdBackup, null, "user-guide")).rejects.toThrow(/tech-design/);
    // The user-guide collection was never wiped/created.
    expect(await prisma.helpChapter.count({ where: { collection: "user-guide" } })).toBe(0);
  });
});
