/**
 * User Guide backup/restore CORE (used by the admin routes AND the tests).
 *
 * Backup is a `.diag-guide` ZIP: guide.json carries the three guide tables at
 * TABLE level with ids preserved (HelpChapter / HelpSection / HelpImage metadata),
 * and images/<id> carries each library image's raw bytes. Restore wipes the three
 * tables and re-inserts every row with its ORIGINAL id — so `/api/help/images/<id>`
 * references in the content keep resolving with no remapping.
 */
import JSZip from "jszip";
import { prisma } from "@/app/lib/db";

export const GUIDE_BACKUP_KIND = "diagramatix-user-guide-backup";
export const GUIDE_BACKUP_VERSION = 2;

export interface GuideRestoreResult { images: number; chapters: number; sections: number; }

/** Build a `.diag-guide` ZIP of the whole User Guide (content + image library). */
export async function buildGuideBackup(exportedBy?: string | null): Promise<Uint8Array> {
  // Scoped to the User Guide collection — tech-design notes are exported as .docx.
  const HelpChapter = await prisma.helpChapter.findMany({ where: { collection: "user-guide" }, orderBy: { sortOrder: "asc" } });
  const HelpSection = await prisma.helpSection.findMany({ where: { collection: "user-guide" }, orderBy: [{ chapterId: "asc" }, { sortOrder: "asc" }] });
  const images = await prisma.helpImage.findMany({ orderBy: { createdAt: "asc" } });

  const zip = new JSZip();
  const HelpImage = images.map((im) => {
    zip.file(`images/${im.id}`, im.bytes as Buffer); // bytes ride alongside, not in JSON
    return {
      id: im.id, filename: im.filename, screenName: im.screenName, diagramName: im.diagramName,
      alt: im.alt, mimeType: im.mimeType, width: im.width, height: im.height,
    };
  });

  zip.file("guide.json", JSON.stringify({
    kind: GUIDE_BACKUP_KIND,
    version: GUIDE_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy: exportedBy ?? null,
    counts: { HelpChapter: HelpChapter.length, HelpSection: HelpSection.length, HelpImage: HelpImage.length },
    tables: {
      HelpChapter: HelpChapter.map((c) => ({ id: c.id, slug: c.slug, title: c.title, sortOrder: c.sortOrder, adminOnly: c.adminOnly })),
      HelpSection: HelpSection.map((s) => ({
        id: s.id, chapterId: s.chapterId, heading: s.heading, bodyMarkdown: s.bodyMarkdown,
        adminOnly: s.adminOnly, image: s.image, imageAlt: s.imageAlt, imageCaption: s.imageCaption, sortOrder: s.sortOrder,
      })),
      HelpImage,
    },
  }, null, 2));

  return await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Restore a `.diag-guide` ZIP: wipe the three guide tables, re-insert with
 *  original ids. Throws on a malformed/foreign file (before touching the DB). */
export async function restoreGuideBackup(
  bytes: ArrayBuffer | Uint8Array,
  restoredById: string | null,
): Promise<GuideRestoreResult> {
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(bytes); }
  catch { throw new Error("Not a valid backup (couldn't read the ZIP)"); }

  const guideEntry = zip.file("guide.json");
  if (!guideEntry) throw new Error("Not a guide backup (missing guide.json)");
  let guide: any;
  try { guide = JSON.parse(await guideEntry.async("string")); }
  catch { throw new Error("guide.json is invalid JSON"); }
  if (guide.kind !== GUIDE_BACKUP_KIND) throw new Error("Not a Diagramatix User Guide backup");

  const t = guide.tables ?? {};

  const helpImages: any[] = [];
  for (const im of (t.HelpImage ?? [])) {
    const entry = zip.file(`images/${im.id}`);
    helpImages.push({
      id: im.id,
      filename: im.filename ?? "image.png",
      screenName: im.screenName ?? "Restored",
      diagramName: im.diagramName ?? null,
      alt: im.alt ?? null,
      mimeType: im.mimeType ?? "image/png",
      bytes: entry ? Buffer.from(await entry.async("nodebuffer")) : Buffer.alloc(0),
      width: im.width ?? null,
      height: im.height ?? null,
      createdById: restoredById,
    });
  }
  // Restore into the User Guide collection (a user-guide backup never carries or
  // touches tech-design rows).
  const helpChapters = (t.HelpChapter ?? []).map((c: any, i: number) => ({
    id: c.id, slug: c.slug, collection: "user-guide", title: c.title || "Untitled", sortOrder: c.sortOrder ?? i, adminOnly: !!c.adminOnly,
  }));
  const helpSections = (t.HelpSection ?? []).map((s: any, i: number) => ({
    id: s.id, chapterId: s.chapterId, collection: "user-guide", heading: s.heading ?? null, bodyMarkdown: s.bodyMarkdown ?? "",
    adminOnly: !!s.adminOnly, image: s.image ?? null, imageAlt: s.imageAlt ?? null, imageCaption: s.imageCaption ?? null,
    sortOrder: s.sortOrder ?? i,
  }));
  const imageIds = helpImages.map((im) => im.id);

  await prisma.$transaction(async (tx) => {
    // Wipe ONLY the User Guide collection; leave tech-design (and its images) intact.
    await tx.helpSection.deleteMany({ where: { collection: "user-guide" } });
    await tx.helpChapter.deleteMany({ where: { collection: "user-guide" } });
    if (imageIds.length) await tx.helpImage.deleteMany({ where: { id: { in: imageIds } } });   // replace-by-id, don't wipe the library
    if (helpImages.length) await tx.helpImage.createMany({ data: helpImages });
    if (helpChapters.length) await tx.helpChapter.createMany({ data: helpChapters });
    if (helpSections.length) await tx.helpSection.createMany({ data: helpSections });
  }, { timeout: 120_000, maxWait: 15_000 });

  return { images: helpImages.length, chapters: helpChapters.length, sections: helpSections.length };
}
