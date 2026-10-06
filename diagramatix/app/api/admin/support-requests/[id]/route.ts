/**
 * POST /api/admin/support-requests/[id] — resend a support request whose email failed (or send it again).
 * SuperAdmin only; blocked while viewing as another user read-only. Uses the same attempt as the first send, so the outcome is written back
 * to the row (sent / failed with every route's error).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation, isSuperuser } from "@/app/lib/superuser";
import { attemptSupportSend } from "@/app/lib/support/supportRequests";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return NextResponse.json({ error: "SuperAdmin only" }, { status: 403 });
  if (isReadOnlyImpersonation(session, await cookies())) return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  const { id } = await params;
  if (!(await prisma.supportRequest.findUnique({ where: { id }, select: { id: true } }))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const outcome = await attemptSupportSend(id);
  const row = await prisma.supportRequest.findUnique({
    where: { id },
    select: { id: true, status: true, via: true, error: true, attempts: true, lastAttemptAt: true, sentAt: true },
  });
  return NextResponse.json({ ok: outcome.ok, row });
}
