/**
 * Serve a library icon's source image (the original upload) as the editing
 * underlay. Same hardened headers as the help-image serve route.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const r = await prisma.archimateIconLibrary.findUnique({ where: { id }, select: { sourceBytes: true, sourceMime: true } });
  if (!r?.sourceBytes) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(r.sourceBytes as Buffer), {
    headers: {
      "Content-Type": r.sourceMime || "image/png",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
