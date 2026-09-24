/**
 * Saved Voice Assist debug sessions — list and create.
 *
 * SuperAdmin only, by real identity (`isSuperuser`) rather than acting view:
 * the localStorage toggle in the editor hides the door, this is the lock on the
 * room. Mutations also refuse a read-only impersonation, per `routeGuard`.
 *
 * NOTE for anyone copying the `api-harness` routes as a pattern: all six of
 * those are on `KNOWN_UNGUARDED` in `tests/config/mutating-route-guard.test.ts`.
 * They are frozen debt, not an example. A new mutating route must actually
 * reach `blockReadOnlyImpersonation` or the ratchet fails the build.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { blockReadOnlyImpersonation } from "@/app/lib/routeGuard";
import { DEBUG_SESSION_FORMAT, sessionCounts, type DebugSessionFile } from "@/app/lib/assist/debugSessionFile";

export const dynamic = "force-dynamic";

/**
 * A listing must never carry the documents or the pictures. Twenty sessions of
 * a hundred commands each, with their snapshots, is megabytes of payload on
 * every page load — the lesson `api-harness/cases` already wrote down.
 */
const LIST_SELECT = {
  id: true, title: true, diagramId: true, diagramName: true,
  createdById: true, createdAt: true, updatedAt: true,
  entryCount: true, failureCount: true, disputeCount: true,
  appVersion: true, asrFingerprint: true, notes: true,
  _count: { select: { snapshots: true } },
} as const;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  // "Show me only the ones where it said it worked and I said it did not."
  const disputedOnly = url.searchParams.get("disputed") === "1";
  const rows = await prisma.voiceDebugSession.findMany({
    where: disputedOnly ? { disputeCount: { gt: 0 } } : undefined,
    select: LIST_SELECT,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({
    sessions: rows.map((r) => ({ ...r, snapshotCount: r._count.snapshots, _count: undefined })),
  });
}

/** Rough ceiling on one posted session, so a runaway log cannot fill the table. */
const MAX_BYTES = 40 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await blockReadOnlyImpersonation(session);
  if (blocked) return blocked;

  const len = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(len) && len > MAX_BYTES) {
    return NextResponse.json({ error: "Session too large (max 40 MB)." }, { status: 413 });
  }

  // THE BODY IS THE DOWNLOAD FORMAT, unchanged. Save-to-disk and save-to-DB
  // accept exactly the same payload, so a file written by the bar can be posted
  // back and the two can never drift into different shapes.
  const body = (await req.json().catch(() => null)) as DebugSessionFile | null;
  if (!body || body.format !== DEBUG_SESSION_FORMAT || !Array.isArray(body.entries)) {
    return NextResponse.json({ error: "Not a Voice Assist debug session." }, { status: 400 });
  }

  const counts = sessionCounts(body.entries);
  const created = await prisma.voiceDebugSession.create({
    data: {
      title: body.title || "Voice Assist session",
      diagramId: body.diagram?.id ?? null,
      diagramName: body.diagram?.name ?? null,
      createdById: session.user.id,
      ...counts,
      notes: body.notes ?? null,
      appVersion: body.appVersion ?? null,
      asrFingerprint: body.asrFingerprint ?? null,
      entries: JSON.stringify(body.entries),
      tally: JSON.stringify(counts),
    },
    select: { id: true },
  });

  // Snapshots one at a time rather than createMany: the PNG arrives as a data
  // URI and has to be split from its header and decoded, and one malformed
  // picture must not lose the whole session.
  for (const s of body.snapshots ?? []) {
    const b64 = typeof s.png === "string" ? s.png.split(",")[1] : undefined;
    await prisma.voiceDebugSnapshot.create({
      data: {
        sessionId: created.id,
        entryId: s.entryId ?? null,
        takenAt: new Date(s.takenAt || Date.now()),
        label: s.label ?? null,
        pngBytes: b64 ? Buffer.from(b64, "base64") : null,
        pngWidth: s.width ?? null,
        pngHeight: s.height ?? null,
        diagramJson: JSON.stringify(s.diagramJson ?? {}),
        elementCount: s.elementCount ?? 0,
        connectorCount: s.connectorCount ?? 0,
      },
    }).catch(() => { /* a bad snapshot is not worth losing the session over */ });
  }

  return NextResponse.json({ id: created.id, ...counts });
}
