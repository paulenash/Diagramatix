import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import {
  requireDiagramAccess,
  OrgContextError,
} from "@/app/lib/auth/orgContext";
import { publishDiagramVersion } from "@/app/lib/diagram/publishVersion";

type Params = { params: Promise<{ id: string }> };

async function checkImpersonating(session: Parameters<typeof isReadOnlyImpersonation>[0]) {
  try {
    return isReadOnlyImpersonation(session, await cookies());
  } catch {
    return false;
  }
}

// POST /api/diagrams/[id]/publish — create the next PublishedVersion.
//
// Gate: caller must be the Diagram's diagramOwnerId. Even the project
// owner can't publish unless they're also the diagram owner — mirrors
// the CPS 230 accountability rule for releases.
//
// Body: { releaseNotes?: string; nextReviewDate?: string|null; reviewCadenceMonths?: number|null }
//
// Effects:
//   • Stamps `supersededAt` on the previously-current PublishedVersion (if any).
//   • Creates a new PublishedVersion row with versionNumber = MAX(prev) + 1
//     and a frozen snapshot of the live Diagram's name/type/data/colorConfig/displayMode.
//   • Updates Diagram.currentPublishedVersionId, lifecycle=PUBLISHED,
//     nextReviewDate, reviewCadenceMonths.
//
// No notifications fire from this route — audiences live on
// PublicationBundle (Phase 2 of the lifecycle plan).
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (await checkImpersonating(session)) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }

  const { id } = await params;

  // First gate: caller must have owner-level access to the diagram. This
  // covers the project boundary + cross-org check via the existing helper.
  try {
    await requireDiagramAccess(session, await cookies(), id, "owner");
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  // Fetch the full row for the snapshot. The access check above used a
  // slim projection — we need name / data / colorConfig / displayMode here.
  const diagram = await prisma.diagram.findUnique({ where: { id } });
  if (!diagram) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Second gate: diagramOwnerId must equal the caller. A project owner
  // who isn't the diagram owner cannot publish.
  if (diagram.diagramOwnerId !== session.user.id) {
    return NextResponse.json(
      { error: "Only the Diagram Owner can publish a new version." },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const releaseNotes: string | undefined = typeof body.releaseNotes === "string" && body.releaseNotes.trim().length > 0
    ? body.releaseNotes.trim()
    : undefined;
  const nextReviewDate: Date | null = body.nextReviewDate
    ? new Date(body.nextReviewDate)
    : null;
  const reviewCadenceMonths: number | null = typeof body.reviewCadenceMonths === "number" && Number.isFinite(body.reviewCadenceMonths)
    ? Math.max(1, Math.min(120, Math.floor(body.reviewCadenceMonths)))
    : null;

  if (nextReviewDate && Number.isNaN(nextReviewDate.getTime())) {
    return NextResponse.json({ error: "Invalid nextReviewDate" }, { status: 400 });
  }

  // Capture the user id outside the closure so TypeScript keeps the
  // narrowing from the `if (!session?.user?.id)` guard above.
  const publisherId: string = session.user.id;

  // Delegate the data effects (version snapshot + lifecycle flip) to the lib.
  // Wrapped in try/catch so a DB error surfaces as a 500, behaviour unchanged.
  try {
    const result = await publishDiagramVersion(id, publisherId, {
      releaseNotes,
      nextReviewDate,
      reviewCadenceMonths,
    });
    return NextResponse.json({ ok: true, version: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/diagrams/[id]/publish] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
