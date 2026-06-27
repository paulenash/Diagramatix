/**
 * Serve / delete one captured help image.
 *   GET    → the PNG bytes (any authenticated user — guide images load via <img>).
 *   DELETE → remove it (SuperAdmin).
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { prisma } from "@/app/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const img = await prisma.helpImage.findUnique({ where: { id }, select: { bytes: true, mimeType: true } });
  if (!img) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(img.bytes as Buffer), {
    headers: {
      "Content-Type": img.mimeType || "image/png",
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
