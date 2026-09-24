/**
 * The PNG bytes of one debug snapshot.
 *
 * Headers copied from `/api/help/images/[id]` deliberately: same problem, same
 * answer. `nosniff` so the browser cannot decide these bytes are something
 * else, a sandboxing CSP so opening the URL directly as a document can never
 * execute anything, and `no-store` because a snapshot is evidence about one
 * moment and a stale cached copy of the wrong moment is worse than a refetch.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const shot = await prisma.voiceDebugSnapshot.findUnique({
    where: { id },
    select: { pngBytes: true },
  });
  // A snapshot whose picture failed to capture is a real, valid snapshot — it
  // still carries its diagram JSON. 404 is the honest answer for the image.
  if (!shot?.pngBytes) return NextResponse.json({ error: "No picture for this snapshot" }, { status: 404 });
  return new NextResponse(new Uint8Array(shot.pngBytes as Buffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
