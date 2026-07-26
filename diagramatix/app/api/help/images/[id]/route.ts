/**
 * Serve / delete one captured help image.
 *   GET    → the PNG bytes (any authenticated user — guide images load via <img>).
 *   DELETE → remove it (SuperAdmin).
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { prisma } from "@/app/lib/db";

// 1×1 transparent PNG — served in place of any record whose stored content-type
// is NOT an image (e.g. a corrupt/test HelpImage holding an HTML document). Such a
// record would otherwise be served as text/html, and anything loading it via <img>
// (the guide, the library, the screen-capture rasteriser) would fail to decode it —
// which was aborting the SuperAdmin screen-capture with a "data:text/html" error.
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const img = await prisma.helpImage.findUnique({ where: { id }, select: { bytes: true, mimeType: true } });
  if (!img) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Never serve non-image bytes from an image endpoint: a record whose mimeType
  // isn't image/* is coerced to a transparent PNG so every <img> that references it
  // loads cleanly instead of failing to decode.
  const isImage = /^image\//i.test(img.mimeType || "");
  const body = isImage ? new Uint8Array(img.bytes as Buffer) : new Uint8Array(TRANSPARENT_PNG);
  return new NextResponse(body, {
    headers: {
      "Content-Type": isImage ? (img.mimeType as string) : "image/png",
      "Cache-Control": "private, max-age=300",
      // Defence in depth: never sniff a different type, and neutralise scripts
      // in an SVG if the URL is opened directly as a document (rendered via <img>
      // these don't run anyway).
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await prisma.helpImage.delete({ where: { id } }).catch(() => { /* already gone */ });
  return NextResponse.json({ ok: true });
}
