import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

type Params = { params: Promise<{ id: string; fid: string }> };

const VALID_STATUSES = new Set(["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"]);

// POST /api/diagrams/[id]/feedback/[fid] — update a feedback item's status.
//
// Body: { status: "OPEN"|"ACKNOWLEDGED"|"RESOLVED"|"DISMISSED", resolutionNote?: string }
//
// Owner-only (diagramOwnerId === caller). Stamps resolvedAt + resolvedById
// when moving to RESOLVED or DISMISSED; clears them when moving back to
// OPEN / ACKNOWLEDGED.
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, fid } = await params;

  const diagram = await prisma.diagram.findUnique({
    where: { id },
    select: { diagramOwnerId: true },
  });
  if (!diagram) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (diagram.diagramOwnerId !== session.user.id) {
    return NextResponse.json({ error: "Only the Diagram Owner can manage feedback" }, { status: 403 });
  }

  // Make sure the feedback belongs to this diagram (defence against id
  // mismatch / cross-diagram tampering).
  const existing = await prisma.diagramFeedback.findUnique({
    where: { id: fid },
    select: { diagramId: true },
  });
  if (!existing || existing.diagramId !== id) {
    return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
  }

  const raw = await req.json().catch(() => ({}));
  const status: string = typeof raw.status === "string" ? raw.status : "";
  const resolutionNote: string | null = typeof raw.resolutionNote === "string" && raw.resolutionNote.trim().length > 0
    ? raw.resolutionNote.trim()
    : null;

  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const isClosed = status === "RESOLVED" || status === "DISMISSED";
  await prisma.diagramFeedback.update({
    where: { id: fid },
    data: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      status: status as any,
      resolutionNote,
      resolvedAt: isClosed ? new Date() : null,
      resolvedById: isClosed ? session.user.id : null,
    },
  });

  return NextResponse.json({ ok: true });
}
