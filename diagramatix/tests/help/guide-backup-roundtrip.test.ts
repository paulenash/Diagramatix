/**
 * User Guide backup → restore round-trip.
 *
 * Proves the table-level guide backup/restore preserves everything end-to-end:
 *   • all HelpChapter / HelpSection / HelpImage rows come back,
 *   • image BYTES survive the ZIP round-trip byte-for-byte,
 *   • ids are PRESERVED, so /api/help/images/<id> references in a section's
 *     image field AND inline body markdown still resolve to a real image,
 *   • adminOnly flags + metadata survive,
 *   • restore is idempotent (wipe + re-insert with original ids),
 *   • a non-guide / garbage upload is rejected BEFORE the DB is touched.
 *
 * Restore is destructive (it wipes the three guide tables), so this is the
 * highest-value test in the User Guide suite.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUserWithOrg } from "../_setup/factories";
import { buildGuideBackup, restoreGuideBackup } from "@/app/lib/help/guideBackup";

const BYTES_A = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const BYTES_B = Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 8, 7, 6]);

async function seedGuide(userId: string) {
  const imgA = await prisma.helpImage.create({
    data: { filename: "capture-a.png", screenName: "Dashboard", mimeType: "image/png", bytes: BYTES_A, width: 100, height: 50, createdById: userId },
  });
  const imgB = await prisma.helpImage.create({
    data: { filename: "visio.png", screenName: "Diagram Editor", diagramName: "Order Process", mimeType: "image/png", bytes: BYTES_B, createdById: userId },
  });

  const ch1 = await prisma.helpChapter.create({ data: { slug: "getting-started", title: "Getting Started", category: "Getting Started", sortOrder: 0 } });
  const ch2 = await prisma.helpChapter.create({ data: { slug: "admin", title: "Admin", sortOrder: 1, adminOnly: true } });

  // Section-image-FIELD ref + INLINE body ref, both pointing at library images.
  await prisma.helpSection.create({
    data: {
      chapterId: ch1.id, heading: "Welcome", sortOrder: 0,
      bodyMarkdown: `See the dashboard.\n\n![dash](/api/help/images/${imgA.id})`,
      image: `/api/help/images/${imgA.id}`, imageAlt: "dash",
    },
  });
  await prisma.helpSection.create({
    data: { chapterId: ch1.id, heading: "Diagrams", sortOrder: 1, bodyMarkdown: `A Visio diagram: ![](/api/help/images/${imgB.id})` },
  });
  await prisma.helpSection.create({
    data: { chapterId: ch2.id, heading: "Secret", sortOrder: 0, adminOnly: true, bodyMarkdown: "admin only" },
  });

  return { imgA, imgB, ch1, ch2 };
}

describe("User Guide backup round-trip", () => {
  beforeEach(async () => { await truncateAll(); });

  it("restores content + the whole image library with ids (and image refs) preserved", async () => {
    const { user } = await createUserWithOrg();
    const { imgA, imgB, ch1 } = await seedGuide(user.id);

    const bytes = await buildGuideBackup("user-guide", "admin@test");

    // Simulate restoring into a fresh DB: wipe the three guide tables first.
    await prisma.helpSection.deleteMany({});
    await prisma.helpChapter.deleteMany({});
    await prisma.helpImage.deleteMany({});
    expect(await prisma.helpChapter.count()).toBe(0);
    expect(await prisma.helpImage.count()).toBe(0);

    const result = await restoreGuideBackup(bytes, user.id);
    expect(result).toEqual({ images: 2, chapters: 2, sections: 3, collection: "user-guide" });

    expect(await prisma.helpChapter.count()).toBe(2);
    expect(await prisma.helpSection.count()).toBe(3);
    expect(await prisma.helpImage.count()).toBe(2);

    // Image bytes survive byte-for-byte, id preserved.
    const ra = await prisma.helpImage.findUnique({ where: { id: imgA.id } });
    expect(ra).not.toBeNull();
    expect(Buffer.from(ra!.bytes as Uint8Array).equals(BYTES_A)).toBe(true);
    expect(ra!.filename).toBe("capture-a.png");
    const rb = await prisma.helpImage.findUnique({ where: { id: imgB.id } });
    expect(Buffer.from(rb!.bytes as Uint8Array).equals(BYTES_B)).toBe(true);
    expect(rb!.diagramName).toBe("Order Process");

    // Chapter + sections preserved (id, order, content).
    const rch1 = await prisma.helpChapter.findUnique({ where: { id: ch1.id }, include: { sections: { orderBy: { sortOrder: "asc" } } } });
    expect(rch1?.title).toBe("Getting Started");
    expect(rch1?.category).toBe("Getting Started"); // category survives the backup round-trip
    expect(rch1?.sections.length).toBe(2);

    // CRUCIAL: references still resolve because ids are preserved.
    const welcome = rch1!.sections[0];
    expect(welcome.image).toBe(`/api/help/images/${imgA.id}`);
    expect(welcome.bodyMarkdown).toContain(`/api/help/images/${imgA.id}`);
    expect(await prisma.helpImage.findUnique({ where: { id: imgA.id } })).not.toBeNull();

    // adminOnly survives on both chapter and section.
    expect((await prisma.helpChapter.findFirst({ where: { slug: "admin", collection: "user-guide" } }))?.adminOnly).toBe(true);
    expect((await prisma.helpSection.findFirst({ where: { heading: "Secret" } }))?.adminOnly).toBe(true);
  });

  it("is idempotent — restoring twice yields one set, not duplicates", async () => {
    const { user } = await createUserWithOrg();
    await seedGuide(user.id);
    const bytes = await buildGuideBackup("user-guide");

    await restoreGuideBackup(bytes, user.id);
    await restoreGuideBackup(bytes, user.id);

    expect(await prisma.helpImage.count()).toBe(2);
    expect(await prisma.helpChapter.count()).toBe(2);
    expect(await prisma.helpSection.count()).toBe(3);
  });

  it("T0902 — round-trips the Technical Design Notes collection independently", async () => {
    const { user } = await createUserWithOrg();
    // A user-guide chapter that must NOT be touched by a tech-design restore.
    await prisma.helpChapter.create({ data: { collection: "user-guide", slug: "ug", title: "UG", sortOrder: 0 } });
    // A tech-design chapter to back up + restore.
    const td = await prisma.helpChapter.create({ data: { collection: "tech-design", slug: "miner", title: "Miner Design", sortOrder: 0 } });
    await prisma.helpSection.create({ data: { chapterId: td.id, collection: "tech-design", heading: "Overview", bodyMarkdown: "internal", sortOrder: 0 } });

    const bytes = await buildGuideBackup("tech-design");
    const result = await restoreGuideBackup(bytes, user.id, "tech-design");
    expect(result.collection).toBe("tech-design");
    expect(result.chapters).toBe(1);

    // tech-design restored; user-guide untouched.
    expect(await prisma.helpChapter.count({ where: { collection: "tech-design" } })).toBe(1);
    expect(await prisma.helpChapter.count({ where: { collection: "user-guide" } })).toBe(1);
    expect((await prisma.helpChapter.findFirst({ where: { collection: "tech-design", slug: "miner" } }))?.title).toBe("Miner Design");
  });

  it("rejects a non-guide / garbage upload before touching the DB", async () => {
    const { user } = await createUserWithOrg();
    await seedGuide(user.id);
    const before = await prisma.helpChapter.count();

    await expect(restoreGuideBackup(new Uint8Array([1, 2, 3, 4]), user.id)).rejects.toThrow();
    expect(await prisma.helpChapter.count()).toBe(before); // untouched
  });
});
