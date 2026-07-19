/**
 * Document backup/restore CORE (used by the admin routes AND the tests).
 *
 * Backup is a `.diag-guide` ZIP: guide.json carries a single document collection's
 * tables at TABLE level with ids preserved (HelpChapter / HelpSection + the shared
 * HelpImage library metadata), and images/<id> carries each library image's raw
 * bytes. Restore wipes that collection and re-inserts every row with its ORIGINAL
 * id — so `/api/help/images/<id>` references in the content keep resolving with no
 * remapping.
 *
 * Collection-parameterised so it moves EITHER the User Guide or the Technical
 * Design Notes between environments (both are HelpChapter collections). Images are
 * a shared library (no collection column), so every backup carries the whole image
 * library and restore replaces those images by id — never wiping the library.
 */
import JSZip from "jszip";
import { prisma } from "@/app/lib/db";

export const GUIDE_BACKUP_KIND = "diagramatix-user-guide-backup";
export const GUIDE_BACKUP_VERSION = 3;
const DEFAULT_COLLECTION = "user-guide";

export interface GuideRestoreResult { images: number; chapters: number; sections: number; collection: string; }

/** Build a `.diag-guide` ZIP of one document collection (content + image library). */
export async function buildGuideBackup(collection: string = DEFAULT_COLLECTION, exportedBy?: string | null): Promise<Uint8Array> {
  const HelpChapter = await prisma.helpChapter.findMany({ where: { collection }, orderBy: { sortOrder: "asc" } });
  const HelpSection = await prisma.helpSection.findMany({ where: { collection }, orderBy: [{ chapterId: "asc" }, { sortOrder: "asc" }] });
  // The image library is shared across collections (no collection column) — carry it whole.
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
    collection,
    exportedAt: new Date().toISOString(),
    exportedBy: exportedBy ?? null,
    counts: { HelpChapter: HelpChapter.length, HelpSection: HelpSection.length, HelpImage: HelpImage.length },
    tables: {
      HelpChapter: HelpChapter.map((c) => ({ id: c.id, slug: c.slug, title: c.title, category: c.category, sortOrder: c.sortOrder, adminOnly: c.adminOnly })),
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
/** Restore a `.diag-guide` ZIP: wipe the target collection, re-insert with original
 *  ids. `expectedCollection` (the collection being restored INTO) must match the
 *  file's collection when both are known — guards against importing a Technical
 *  Design Notes file over the User Guide. Throws on a malformed/foreign/mismatched
 *  file BEFORE touching the DB. Pre-v3 files have no `collection` → treated as user-guide. */
export async function restoreGuideBackup(
  bytes: ArrayBuffer | Uint8Array,
  restoredById: string | null,
  expectedCollection?: string,
): Promise<GuideRestoreResult> {
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(bytes); }
  catch { throw new Error("Not a valid backup (couldn't read the ZIP)"); }

  const guideEntry = zip.file("guide.json");
  if (!guideEntry) throw new Error("Not a guide backup (missing guide.json)");
  let guide: any;
  try { guide = JSON.parse(await guideEntry.async("string")); }
  catch { throw new Error("guide.json is invalid JSON"); }
  if (guide.kind !== GUIDE_BACKUP_KIND) throw new Error("Not a Diagramatix document backup");

  const fileCollection: string = typeof guide.collection === "string" && guide.collection ? guide.collection : DEFAULT_COLLECTION;
  if (expectedCollection && expectedCollection !== fileCollection) {
    throw new Error(`This file is a "${fileCollection}" backup — import it under that document, not "${expectedCollection}".`);
  }
  const collection = expectedCollection ?? fileCollection;

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
  const helpChapters = (t.HelpChapter ?? []).map((c: any, i: number) => ({
    id: c.id, slug: c.slug, collection, title: c.title || "Untitled", category: c.category ?? null,
    sortOrder: c.sortOrder ?? i, adminOnly: !!c.adminOnly,
  }));
  const helpSections = (t.HelpSection ?? []).map((s: any, i: number) => ({
    id: s.id, chapterId: s.chapterId, collection, heading: s.heading ?? null, bodyMarkdown: s.bodyMarkdown ?? "",
    adminOnly: !!s.adminOnly, image: s.image ?? null, imageAlt: s.imageAlt ?? null, imageCaption: s.imageCaption ?? null,
    sortOrder: s.sortOrder ?? i,
  }));
  const imageIds = helpImages.map((im) => im.id);

  await prisma.$transaction(async (tx) => {
    // Wipe ONLY the target collection; leave the other collection (and its images) intact.
    await tx.helpSection.deleteMany({ where: { collection } });
    await tx.helpChapter.deleteMany({ where: { collection } });
    if (imageIds.length) await tx.helpImage.deleteMany({ where: { id: { in: imageIds } } });   // replace-by-id, don't wipe the library
    if (helpImages.length) await tx.helpImage.createMany({ data: helpImages });
    if (helpChapters.length) await tx.helpChapter.createMany({ data: helpChapters });
    if (helpSections.length) await tx.helpSection.createMany({ data: helpSections });
  }, { timeout: 120_000, maxWait: 15_000 });

  return { images: helpImages.length, chapters: helpChapters.length, sections: helpSections.length, collection };
}
