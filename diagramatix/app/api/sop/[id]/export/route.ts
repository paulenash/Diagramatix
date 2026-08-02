/**
 * GET /api/sop/:id/export → the SOP as a .docx.
 *
 * Reuses buildDocx. If the SOP's resolved template carries an uploaded Word
 * template, its `word/styles.xml` is adopted (style/brand adoption — fonts +
 * heading styles). Section images that are base64 `data:` URIs embed directly.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import JSZip from "jszip";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { buildDocx, type DocxChapter, type ResolvedImage } from "@/app/lib/documents/exportDocx";

/** Read the real pixel size from a PNG's IHDR (bytes 16-24). SOP figures are PNGs
 *  (canvas toDataURL), so this gives the true aspect ratio — without it the image
 *  is forced into a fixed box and looks stretched/compressed. */
function pngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  const width = buf.readUInt32BE(16), height = buf.readUInt32BE(20);
  return width && height ? { width, height } : null;
}

// Resolve a base64 data: URI to bytes + its true size. External/other URLs are
// skipped (mirrors the Help export — no server-side fetch).
async function resolveImage(url: string): Promise<ResolvedImage | null> {
  const m = /^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i.exec(url.trim());
  if (!m) return null;
  const type = (m[1].toLowerCase() === "jpg" ? "jpeg" : m[1].toLowerCase()) as string;
  const data = Buffer.from(m[2], "base64");
  const t = type === "jpeg" ? "jpg" : (type as "png" | "gif" | "bmp");
  const dims = pngDimensions(data) ?? { width: 600, height: 400 };
  return { data, width: dims.width, height: dims.height, type: t };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const doc = await prisma.sopDocument.findUnique({
    where: { id },
    include: { sections: { orderBy: { sortOrder: "asc" } } },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await requireProjectAccess(session, await cookies(), doc.projectId, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  // The generated diagram figure is rendered on its OWN page(s) — large, aspect-
  // preserved, plus a landscape expanded copy — rather than compressed inline. Take
  // the first section that carries an image as that figure and drop it from the flow.
  const figSec = doc.sections.find((s) => s.image);
  const figure = figSec?.image
    ? { dataUri: figSec.image, caption: figSec.imageCaption ?? (doc.scopeLabel ? `Process diagram — ${doc.scopeLabel}` : undefined) }
    : undefined;

  // Each SOP section → one numbered chapter (its heading owns H1). Inline images are
  // suppressed here; the figure appears on the dedicated pages below.
  const chapters: DocxChapter[] = doc.sections.map((s) => ({
    title: s.heading ?? "",
    sections: [{ heading: null, bodyMarkdown: s.bodyMarkdown, image: null, imageCaption: s.imageCaption }],
  }));

  // Style/brand adoption: lift word/styles.xml from the resolved template's docx.
  let externalStyles: string | undefined;
  if (doc.templateId) {
    const tpl = await prisma.sopTemplate.findUnique({ where: { id: doc.templateId }, select: { docxTemplate: true } });
    if (tpl?.docxTemplate) {
      try {
        const zip = await JSZip.loadAsync(Buffer.from(tpl.docxTemplate));
        externalStyles = await zip.file("word/styles.xml")?.async("text");
      } catch { /* fall back to built-in styles */ }
    }
  }

  const buf = await buildDocx(chapters, { docTitle: doc.title, imageResolver: resolveImage, externalStyles, figure });
  const safe = doc.title.replace(/[^a-z0-9\-_. ]/gi, "_").slice(0, 80) || "SOP";
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safe}.docx"`,
    },
  });
}
