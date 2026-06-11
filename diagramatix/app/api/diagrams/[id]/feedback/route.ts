import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { getDiagramAccess } from "@/app/lib/auth/orgContext";
import { createNotification } from "@/app/lib/notifications";

type Params = { params: Promise<{ id: string }> };

// POST /api/diagrams/[id]/feedback — file a piece of feedback.
//
// Body: { body: string, attachedElementId?: string|null, bundleId?: string|null }
//
// Who can file: anyone with access to the diagram — a business user via
// a bundle audience grant, or the owner/editor/viewer. Feedback is
// anchored to the diagram's CURRENT published version (the snapshot the
// filer was looking at). Diagrams with no published version reject —
// there's nothing published to give feedback on.
//
// Fires a `feedback-received` notification to the diagram owner.
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const access = await getDiagramAccess(session.user.id, id);
  if (!access) {
    return NextResponse.json({ error: "No access to this diagram" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const body: string = typeof raw.body === "string" ? raw.body.trim() : "";
  const attachedElementId: string | null = typeof raw.attachedElementId === "string" && raw.attachedElementId.length > 0
    ? raw.attachedElementId
    : null;
  const bundleId: string | null = typeof raw.bundleId === "string" && raw.bundleId.length > 0
    ? raw.bundleId
    : (access.bundleId ?? null);

  if (!body) {
    return NextResponse.json({ error: "Feedback message required" }, { status: 400 });
  }

  // Anchor to the current published version.
  const diagram = await prisma.diagram.findUnique({
    where: { id },
    select: { currentPublishedVersionId: true, diagramOwnerId: true, name: true },
  });
  if (!diagram?.currentPublishedVersionId) {
    return NextResponse.json({ error: "Diagram has no published version" }, { status: 409 });
  }

  const created = await prisma.diagramFeedback.create({
    data: {
      diagramId: id,
      publishedVersionId: diagram.currentPublishedVersionId,
      bundleId,
      authorId: session.user.id,
      body,
      attachedElementId,
    },
    select: { id: true },
  });

  // Notify the diagram owner (if set and not the author themselves).
  if (diagram.diagramOwnerId && diagram.diagramOwnerId !== session.user.id) {
    await createNotification(diagram.diagramOwnerId, "feedback-received", {
      diagramId: id,
      diagramName: diagram.name,
      feedbackId: created.id,
      fromUserId: session.user.id,
      fromUserName: session.user.name ?? null,
      fromUserEmail: session.user.email ?? undefined,
    });
  }

  return NextResponse.json({ ok: true, feedbackId: created.id });
}

// GET /api/diagrams/[id]/feedback — list feedback on the diagram.
//
// Two modes:
//   • Default (owner): the diagram owner sees ALL feedback, for the
//     editor's FeedbackPanel.
//   • ?mine=1 (any author): a business user sees only the feedback they
//     themselves filed, for the live list in the published viewer.
//
// Returns rows newest-first with author identity + version + bundle.
export async function GET(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const mine = new URL(req.url).searchParams.get("mine") === "1";

  const diagram = await prisma.diagram.findUnique({
    where: { id },
    select: { diagramOwnerId: true },
  });
  if (!diagram) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Owner sees all; ?mine=1 scopes to the caller's own feedback (any
  // author may read their own). A non-owner without ?mine=1 is rejected.
  if (!mine && diagram.diagramOwnerId !== session.user.id) {
    return NextResponse.json({ error: "Only the Diagram Owner can view all feedback" }, { status: 403 });
  }

  const feedback = await prisma.diagramFeedback.findMany({
    where: mine
      ? { diagramId: id, authorId: session.user.id }
      : { diagramId: id },
    select: {
      id: true,
      body: true,
      attachedElementId: true,
      status: true,
      resolutionNote: true,
      createdAt: true,
      resolvedAt: true,
      author: { select: { id: true, name: true, email: true } },
      publishedVersion: { select: { versionNumber: true } },
      bundle: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    feedback: feedback.map(f => ({
      id: f.id,
      body: f.body,
      attachedElementId: f.attachedElementId,
      status: f.status,
      resolutionNote: f.resolutionNote,
      createdAt: f.createdAt.toISOString(),
      resolvedAt: f.resolvedAt?.toISOString() ?? null,
      author: f.author,
      versionNumber: f.publishedVersion.versionNumber,
      bundle: f.bundle,
    })),
  });
}
