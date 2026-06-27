/**
 * SuperAdmin User Guide restore. POST (multipart, a `.diag-guide` ZIP from
 * ../backup) → wipes the three guide tables and re-inserts every row with its
 * ORIGINAL id: the whole Image Library (HelpImage rows + bytes) plus all
 * HelpChapter/HelpSection rows. Ids are preserved, so `/api/help/images/<id>`
 * references in the content keep resolving — no remapping needed. The whole thing
 * runs in one transaction (a failure rolls back to the prior state).
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { prisma } from "@/app/lib/db";
import JSZip from "jszip";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "file required" }, { status: 400 });

  let zip: JSZip;
  try { zip = await JSZip.loadAsync(await file.arrayBuffer()); }
  catch { return NextResponse.json({ error: "Not a valid backup (couldn't read the ZIP)" }, { status: 400 }); }

  const guideEntry = zip.file("guide.json");
  if (!guideEntry) return NextResponse.json({ error: "Not a guide backup (missing guide.json)" }, { status: 400 });
  let guide: any;
  try { guide = JSON.parse(await guideEntry.async("string")); }
  catch { return NextResponse.json({ error: "guide.json is invalid JSON" }, { status: 400 }); }
  if (guide.kind !== "diagramatix-user-guide-backup") return NextResponse.json({ error: "Not a Diagramatix User Guide backup" }, { status: 400 });

  const t = guide.tables ?? {};

  // Whole Image Library — metadata + bytes from images/<id>.
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
      createdById: session.user.id,
    });
  }
  const helpChapters = (t.HelpChapter ?? []).map((c: any, i: number) => ({
    id: c.id, slug: c.slug, title: c.title || "Untitled", sortOrder: c.sortOrder ?? i, adminOnly: !!c.adminOnly,
  }));
  const helpSections = (t.HelpSection ?? []).map((s: any, i: number) => ({
    id: s.id, chapterId: s.chapterId, heading: s.heading ?? null, bodyMarkdown: s.bodyMarkdown ?? "",
    adminOnly: !!s.adminOnly, image: s.image ?? null, imageAlt: s.imageAlt ?? null, imageCaption: s.imageCaption ?? null,
    sortOrder: s.sortOrder ?? i,
  }));

  await prisma.$transaction(async (tx) => {
    await tx.helpSection.deleteMany({});
    await tx.helpChapter.deleteMany({});
    await tx.helpImage.deleteMany({});
    if (helpImages.length) await tx.helpImage.createMany({ data: helpImages });
    if (helpChapters.length) await tx.helpChapter.createMany({ data: helpChapters });
    if (helpSections.length) await tx.helpSection.createMany({ data: helpSections });
  }, { timeout: 120_000, maxWait: 15_000 });

  return NextResponse.json({ ok: true, images: helpImages.length, chapters: helpChapters.length, sections: helpSections.length });
}
