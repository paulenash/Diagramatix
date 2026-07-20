import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import {
  requireDiagramAccess,
  OrgContextError,
} from "@/app/lib/auth/orgContext";
import { sendSupportDiagramEmail } from "@/app/lib/email";
import { orgPolicyAllows } from "@/app/lib/auth/orgPolicy";

// POST /api/support/diagram
//
// Body: {
//   diagramId: string,
//   subject: string,
//   message: string,
//   svgBase64?: string | null,   // base64 SVG of the canvas, generated client-side
// }
//
// Effects: (1) composes an email to the SMTP_FROM address (the support
// shared mailbox) with the user's note + a JSON snapshot of the diagram
// + (optionally) an SVG. Reply-To is the user's email so the support team
// can reply directly. (2) deposits an annotated COPY of the diagram into the
// SuperAdmin's (paul@nashcc.com.au) "Support" project — see depositToSupportProject.
//
// Gate: caller must have view access to the diagram. Anyone who can
// see the diagram can ask for help on it.
//
// We deliberately read the diagram's `data` server-side rather than
// trusting a client-supplied JSON blob — defends against a forged
// "help" payload that contains arbitrary attachment content.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.user.email) {
    return NextResponse.json({ error: "No reply-to email on session" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const diagramId: string | undefined = typeof body.diagramId === "string" ? body.diagramId : undefined;
  const subject: string = typeof body.subject === "string" ? body.subject.trim() : "";
  const message: string = typeof body.message === "string" ? body.message.trim() : "";
  const svgBase64: string | null = typeof body.svgBase64 === "string" && body.svgBase64.length > 0
    ? body.svgBase64
    : null;

  if (!diagramId) {
    return NextResponse.json({ error: "diagramId required" }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  // Defence-in-depth: reject implausibly large snapshots. Base64 inflates
  // ~33% over the raw bytes, so 8 MB base64 ≈ 6 MB SVG — generous for any
  // reasonable canvas.
  const MAX_SVG_BASE64 = 8 * 1024 * 1024;
  if (svgBase64 && svgBase64.length > MAX_SVG_BASE64) {
    return NextResponse.json({ error: "Snapshot too large" }, { status: 413 });
  }

  // View access (or better) on the diagram. Owners, editors, viewers all qualify.
  try {
    await requireDiagramAccess(session, await cookies(), diagramId, "view");
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // Re-read the diagram server-side so the attached JSON is the canonical
  // saved version, not whatever the client posted.
  const diagram = await prisma.diagram.findUnique({
    where: { id: diagramId },
    select: { id: true, name: true, type: true, data: true, colorConfig: true, displayMode: true },
  });
  if (!diagram) {
    return NextResponse.json({ error: "Diagram not found" }, { status: 404 });
  }

  // Org policy may forbid the diagram itself leaving with the support request —
  // then we send the note only (no JSON snapshot, no screenshot) and skip the
  // copy into the vendor Support project (ENT-10).
  const withDiagram = await orgPolicyAllows(session, "allowSupportDiagram");

  try {
    await sendSupportDiagramEmail({
      fromUserName: session.user.name ?? null,
      fromUserEmail: session.user.email,
      diagramId: diagram.id,
      diagramName: diagram.name,
      subject: subject || `Help with: ${diagram.name}`,
      message,
      diagramJson: withDiagram
        ? JSON.stringify(diagram.data, null, 2)
        : "(diagram content omitted by your organisation's policy)",
      svgBase64: withDiagram ? svgBase64 : null,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/support/diagram] send error:", errMsg);
    return NextResponse.json(
      { error: "Failed to send. Please try again or email support directly." },
      { status: 500 },
    );
  }

  // Best-effort: deposit an annotated copy into the SuperAdmin "Support"
  // project. Never fail the user's request if this side-effect errors.
  // Skipped when org policy forbids the diagram leaving with support requests.
  if (withDiagram) {
    try {
      await depositToSupportProject({
        diagram,
        fromUserName: session.user.name ?? null,
        fromUserEmail: session.user.email,
        message,
      });
    } catch (err) {
      console.error("[POST /api/support/diagram] support-project deposit failed:", err);
    }
  }

  return NextResponse.json({ ok: true });
}

// The SuperAdmin whose "Support" project collects help-requested diagrams.
const SUPPORT_ADMIN_EMAIL = "paul@nashcc.com.au";
const SUPPORT_PROJECT_NAME = "Support";

/**
 * Copy the help-requested diagram into paul@nashcc.com.au's "Support" project
 * (creating the project on first use), stamped with a top-left text annotation
 * carrying the sender, the date, and the message. One copy per request — each
 * is an independent snapshot of what the user saw when they asked for help.
 */
async function depositToSupportProject(input: {
  diagram: { id: string; name: string; type: string; data: unknown; colorConfig: unknown; displayMode: string };
  fromUserName: string | null;
  fromUserEmail: string;
  message: string;
}): Promise<void> {
  const admin = await prisma.user.findUnique({
    where: { email: SUPPORT_ADMIN_EMAIL },
    select: { id: true },
  });
  if (!admin) return; // deployment without the SuperAdmin account — skip silently

  const adminOrg = await prisma.orgMember.findFirst({
    where: { userId: admin.id },
    orderBy: { createdAt: "asc" },
    select: { orgId: true },
  });
  if (!adminOrg) return;

  // Find-or-create the Support project (owned by the admin, in their first org).
  let project = await prisma.project.findFirst({
    where: { userId: admin.id, orgId: adminOrg.orgId, name: SUPPORT_PROJECT_NAME },
    select: { id: true },
  });
  if (!project) {
    project = await prisma.project.create({
      data: {
        name: SUPPORT_PROJECT_NAME,
        description: "Diagrams users have requested help with (auto-collected).",
        ownerName: "",
        userId: admin.id,
        orgId: adminOrg.orgId,
      },
      select: { id: true },
    });
  }

  // Stamp a top-left annotation with sender / date / message onto a copy of the data.
  const stampedData = withSupportAnnotation(input.diagram.data, {
    fromUserName: input.fromUserName,
    fromUserEmail: input.fromUserEmail,
    message: input.message,
  });

  await prisma.diagram.create({
    data: {
      name: input.diagram.name,
      type: input.diagram.type,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: stampedData as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      colorConfig: input.diagram.colorConfig as any,
      displayMode: input.diagram.displayMode,
      userId: admin.id,
      orgId: adminOrg.orgId,
      projectId: project.id,
    },
  });
}

/**
 * Return a copy of the diagram data with a `text-annotation` element added at
 * the top-left of the existing content, describing who asked for help, when,
 * and what they said.
 */
function withSupportAnnotation(
  data: unknown,
  info: { fromUserName: string | null; fromUserEmail: string; message: string },
): unknown {
  const d = (data && typeof data === "object" ? { ...(data as Record<string, unknown>) } : {}) as Record<string, unknown>;
  const elements = Array.isArray(d.elements) ? [...(d.elements as Array<Record<string, unknown>>)] : [];

  // Top-left of the current content (fall back to a fixed origin on empty).
  let minX = Infinity, minY = Infinity;
  for (const e of elements) {
    const x = typeof e.x === "number" ? e.x : NaN;
    const y = typeof e.y === "number" ? e.y : NaN;
    if (Number.isFinite(x)) minX = Math.min(minX, x);
    if (Number.isFinite(y)) minY = Math.min(minY, y);
  }
  if (!Number.isFinite(minX)) minX = 40;
  if (!Number.isFinite(minY)) minY = 40;

  const from = info.fromUserName ? `${info.fromUserName} <${info.fromUserEmail}>` : info.fromUserEmail;
  const sentAt = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const label =
    `SUPPORT REQUEST\n` +
    `From: ${from}\n` +
    `Sent: ${sentAt}\n\n` +
    `${info.message || "(no message)"}`;

  const WIDTH = 340;
  const lines = label.split("\n").length + Math.ceil(info.message.length / 46);
  const height = Math.max(120, Math.min(640, lines * 16 + 40));

  const annotation: Record<string, unknown> = {
    id: `support-note-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`,
    type: "text-annotation",
    // Sit above-left of the content so it doesn't overlap it.
    x: Math.round(minX),
    y: Math.round(minY - height - 40),
    width: WIDTH,
    height,
    label,
    properties: { userResizedAnnotation: true, annotationColor: "red" },
  };

  d.elements = [annotation, ...elements];
  return d;
}
