import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import {
  requireDiagramAccess,
  OrgContextError,
} from "@/app/lib/auth/orgContext";
import { sendSupportDiagramEmail } from "@/app/lib/email";

// POST /api/support/diagram
//
// Body: {
//   diagramId: string,
//   subject: string,
//   message: string,
//   pngBase64?: string | null,   // base64 PNG of the canvas, generated client-side
// }
//
// Effects: composes an email to the SMTP_FROM address (the support
// shared mailbox) with the user's note + a JSON snapshot of the diagram
// + (optionally) a PNG screenshot. Reply-To is the user's email so the
// support team can reply directly.
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
  const pngBase64: string | null = typeof body.pngBase64 === "string" && body.pngBase64.length > 0
    ? body.pngBase64
    : null;

  if (!diagramId) {
    return NextResponse.json({ error: "diagramId required" }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  // Defence-in-depth: reject implausibly large screenshots. Base64 inflates
  // ~33% over the raw bytes, so 8 MB base64 ≈ 6 MB PNG — generous for any
  // reasonable canvas screenshot.
  const MAX_PNG_BASE64 = 8 * 1024 * 1024;
  if (pngBase64 && pngBase64.length > MAX_PNG_BASE64) {
    return NextResponse.json({ error: "Screenshot too large" }, { status: 413 });
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
    select: { id: true, name: true, data: true },
  });
  if (!diagram) {
    return NextResponse.json({ error: "Diagram not found" }, { status: 404 });
  }

  try {
    await sendSupportDiagramEmail({
      fromUserName: session.user.name ?? null,
      fromUserEmail: session.user.email,
      diagramId: diagram.id,
      diagramName: diagram.name,
      subject: subject || `Help with: ${diagram.name}`,
      message,
      diagramJson: JSON.stringify(diagram.data, null, 2),
      pngBase64,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/support/diagram] send error:", errMsg);
    return NextResponse.json(
      { error: "Failed to send. Please try again or email support directly." },
      { status: 500 },
    );
  }
}
