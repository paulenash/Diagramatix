/**
 * SuperAdmin User Guide backup. GET → a `.diag-guide` ZIP that backs up the guide
 * at TABLE level, ids preserved, so restoring into another environment (e.g. prod)
 * keeps every `/api/help/images/<id>` reference valid with no remapping:
 *   - guide.json : { tables: { HelpChapter[], HelpSection[], HelpImage[] } }
 *                  (HelpImage rows carry metadata only — no bytes)
 *   - images/<id>: the raw bytes of each library image
 * Restore (../restore) wipes the three guide tables and re-inserts these rows
 * with their original ids.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { prisma } from "@/app/lib/db";
import JSZip from "jszip";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const HelpChapter = await prisma.helpChapter.findMany({ orderBy: { sortOrder: "asc" } });
  const HelpSection = await prisma.helpSection.findMany({ orderBy: [{ chapterId: "asc" }, { sortOrder: "asc" }] });
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
    kind: "diagramatix-user-guide-backup",
    version: 2,
    exportedAt: new Date().toISOString(),
    exportedBy: session.user.email ?? null,
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

  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="user-guide-backup.diag-guide"`,
    },
  });
}
