/**
 * One recorded clip: play it back, or delete it.
 *
 * Headers follow `/api/help/images/[id]` — `nosniff` and a sandboxing CSP, so
 * bytes served from a byte column can never be interpreted as anything but what
 * they are claimed to be.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { blockReadOnlyImpersonation } from "@/app/lib/routeGuard";
import { WAV_MIME } from "@/app/lib/dictation/wav";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const clip = await prisma.voiceClip.findUnique({ where: { id }, select: { audioBytes: true } });
  if (!clip?.audioBytes) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(clip.audioBytes as Buffer), {
    headers: {
      "Content-Type": WAV_MIME,
      // A corpus clip never changes once recorded, so it may be cached — but
      // privately: it is somebody's voice.
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await blockReadOnlyImpersonation(session);
  if (blocked) return blocked;
  const { id } = await params;
  await prisma.voiceClip.delete({ where: { id } }).catch(() => { /* already gone */ });
  return NextResponse.json({ ok: true });
}
