/**
 * The receiver a harness run points its `callbackUrl` at.
 *
 * POST — takes the delivery. Deliberately UNAUTHENTICATED, because the caller is
 * our own worker making an ordinary outbound HTTP request: it holds no session
 * and presents no key, exactly as a partner's endpoint would see it. That is the
 * point — an authenticated receiver would be testing something other than what
 * a partner will actually experience.
 *
 * What stops it being a hole: it accepts a body only for a jobId that EXISTS as a
 * PartnerJob, it keeps at most a handful of them in memory, it returns nothing
 * about any job, and nothing it stores is ever read by anything but the harness
 * screen. There is no state here worth reaching for.
 *
 * GET — SuperAdmin only, and the only way anything comes back out.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { acceptDelivery, takeCallback } from "@/app/lib/partner/callbackInbox";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await acceptDelivery(req, async (id) =>
    !!(await prisma.partnerJob.findUnique({ where: { id }, select: { id: true } }).catch(() => null)));
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const jobId = new URL(req.url).searchParams.get("jobId")?.trim() ?? "";
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });
  return NextResponse.json({ callback: takeCallback(jobId) });
}
