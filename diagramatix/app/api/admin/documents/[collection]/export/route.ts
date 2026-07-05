/**
 * GET — export a Document-Editor collection (or a single chapter) to a Word
 * `.docx`. `?chapter=<slug>` exports one chapter; absent = the whole document.
 * Images referenced as /api/help/images/<id> (or data: URIs) are resolved from
 * the HelpImage table. SuperAdmin only.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { prisma } from "@/app/lib/db";
import { buildDocx, type DocxChapter, type ResolvedImage } from "@/app/lib/documents/exportDocx";
import { COLLECTIONS } from "../route";

type Params = { params: Promise<{ collection: string }> };

const TITLES: Record<string, string> = { "user-guide": "User Guide", "tech-design": "Technical Design Notes" };
const TYPE_BY_MIME: Record<string, ResolvedImage["type"]> = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/gif": "gif", "image/bmp": "bmp" };

/** Resolve /api/help/images/<id> and data: URIs to bytes + dimensions. */
async function resolveImage(url: string): Promise<ResolvedImage | null> {
  const m = url.match(/\/api\/help\/images\/([a-z0-9]+)/i);
  if (m) {
    const img = await prisma.helpImage.findUnique({ where: { id: m[1] }, select: { bytes: true, width: true, height: true, mimeType: true } });
    if (!img?.bytes) return null;
    return { data: img.bytes as Buffer, width: img.width ?? 480, height: img.height ?? 320, type: TYPE_BY_MIME[img.mimeType] ?? "png" };
  }
  const d = url.match(/^data:(image\/[a-z]+);base64,(.+)$/i);
  if (d) return { data: Buffer.from(d[2], "base64"), width: 480, height: 320, type: TYPE_BY_MIME[d[1].toLowerCase()] ?? "png" };
  return null;   // external URLs are skipped (no server-side fetch)
}

export async function GET(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { collection } = await params;
  if (!(COLLECTIONS as readonly string[]).includes(collection)) return NextResponse.json({ error: "Unknown collection" }, { status: 404 });

  const chapterSlug = new URL(req.url).searchParams.get("chapter") || undefined;
  const rows = await prisma.helpChapter.findMany({
    where: { collection, ...(chapterSlug ? { slug: chapterSlug } : {}) },
    orderBy: { sortOrder: "asc" },
    include: { sections: { orderBy: { sortOrder: "asc" } } },
  });
  if (rows.length === 0) return NextResponse.json({ error: "Nothing to export" }, { status: 404 });

  const chapters: DocxChapter[] = rows.map((c) => ({
    title: c.title,
    sections: c.sections.map((s) => ({ heading: s.heading, bodyMarkdown: s.bodyMarkdown, image: s.image, imageAlt: s.imageAlt, imageCaption: s.imageCaption })),
  }));
  const docTitle = chapterSlug ? rows[0].title : (TITLES[collection] ?? collection);
  const buf = await buildDocx(chapters, { docTitle, imageResolver: resolveImage });

  const base = (chapterSlug ? rows[0].slug : collection).replace(/[^\w.-]+/g, "-").slice(0, 60) || "document";
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${base}.docx"`,
    },
  });
}
