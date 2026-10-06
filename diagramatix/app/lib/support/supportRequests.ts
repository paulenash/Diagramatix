/**
 * "Send to support" requests — recorded first, emailed second (Paul, 2026-10-07).
 *
 * The request is saved as a SupportRequest row BEFORE any mail is attempted. Then `attemptSupportSend` tries the email and writes the
 * outcome back: status "sent" (and which route delivered it), or "failed" with every route's error. A failure therefore never loses the
 * user's words; the SuperAdmin's Support Requests list shows it and can resend (`attemptSupportSend` again) once mail is fixed.
 */
import { prisma } from "@/app/lib/db";
import { sendSupportDiagramEmail } from "@/app/lib/email";

export const POLICY_OMITTED_JSON = "(diagram content omitted by your organisation's policy)";

export interface SupportSendOutcome { ok: boolean; via?: string; error?: string }

export async function attemptSupportSend(
  id: string,
  opts: {
    /** The SVG from the request in hand; a resend uses the copy kept on the row. */
    svgBase64?: string | null;
    send?: typeof sendSupportDiagramEmail;
  } = {},
): Promise<SupportSendOutcome> {
  const row = await prisma.supportRequest.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "Support request not found" };
  const send = opts.send ?? sendSupportDiagramEmail;

  // The diagram as saved NOW — a resend days later should show support the current state; if it has been deleted, say so.
  const diagram = row.withDiagram
    ? await prisma.diagram.findUnique({ where: { id: row.diagramId }, select: { data: true } })
    : null;
  const diagramJson = !row.withDiagram
    ? POLICY_OMITTED_JSON
    : diagram ? JSON.stringify(diagram.data, null, 2) : "(the diagram no longer exists)";
  const svg = row.withDiagram ? (opts.svgBase64 ?? row.svgBase64 ?? null) : null;

  try {
    const { via } = await send({
      fromUserName: row.userName,
      fromUserEmail: row.userEmail,
      diagramId: row.diagramId,
      diagramName: row.diagramName,
      subject: row.subject,
      message: row.message,
      diagramJson,
      svgBase64: svg,
    });
    await prisma.supportRequest.update({
      where: { id },
      data: { status: "sent", via, error: null, svgBase64: null, attempts: { increment: 1 }, lastAttemptAt: new Date(), sentAt: new Date() },
    });
    return { ok: true, via };
  } catch (err) {
    const error = (err instanceof Error ? err.message : String(err)).slice(0, 2000);
    console.error(`[support] request ${id} could not be emailed: ${error}`);
    await prisma.supportRequest.update({
      where: { id },
      // Keep the SVG so a resend can attach it.
      data: { status: "failed", error, svgBase64: svg, attempts: { increment: 1 }, lastAttemptAt: new Date() },
    }).catch((e) => console.error("[support] could not record the failure:", e));
    return { ok: false, error };
  }
}
