/**
 * One saved Voice Assist debug session — read it back, or delete it.
 *
 * The GET returns the session in the SAME SHAPE the bar downloads, so what
 * comes out of the database is a file somebody can save and open. Snapshots
 * come back as metadata plus a URL; their bytes are served by
 * `/api/admin/voice-debug/snapshots/[id]`, because a session with twenty
 * pictures inline is a payload nobody wants on a detail page.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { blockReadOnlyImpersonation } from "@/app/lib/routeGuard";
import { DEBUG_SESSION_FORMAT, DEBUG_SESSION_VERSION } from "@/app/lib/assist/debugSessionFile";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const row = await prisma.voiceDebugSession.findUnique({
    where: { id },
    include: {
      snapshots: {
        // Never the bytes here — see the docblock.
        select: {
          id: true, entryId: true, takenAt: true, label: true,
          pngWidth: true, pngHeight: true, diagramJson: true,
          elementCount: true, connectorCount: true,
        },
        orderBy: { takenAt: "asc" },
      },
    },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let entries: unknown = [];
  try { entries = JSON.parse(row.entries); } catch { entries = []; }

  return NextResponse.json({
    format: DEBUG_SESSION_FORMAT,
    version: DEBUG_SESSION_VERSION,
    id: row.id,
    savedAt: row.createdAt.getTime(),
    ...(row.appVersion ? { appVersion: row.appVersion } : {}),
    ...(row.asrFingerprint ? { asrFingerprint: row.asrFingerprint } : {}),
    diagram: { id: row.diagramId, name: row.diagramName },
    title: row.title,
    ...(row.notes ? { notes: row.notes } : {}),
    counts: {
      entryCount: row.entryCount,
      failureCount: row.failureCount,
      disputeCount: row.disputeCount,
    },
    entries,
    snapshots: row.snapshots.map((s) => ({
      id: s.id,
      entryId: s.entryId,
      takenAt: s.takenAt.getTime(),
      label: s.label,
      width: s.pngWidth,
      height: s.pngHeight,
      url: `/api/admin/voice-debug/snapshots/${s.id}`,
      diagramJson: (() => { try { return JSON.parse(s.diagramJson); } catch { return null; } })(),
      elementCount: s.elementCount,
      connectorCount: s.connectorCount,
    })),
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
  // Snapshots go with it — `onDelete: Cascade` on the relation.
  await prisma.voiceDebugSession.delete({ where: { id } }).catch(() => { /* already gone */ });
  return NextResponse.json({ ok: true });
}
