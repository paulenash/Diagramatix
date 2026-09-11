/**
 * POST /api/prompts/bulk-delete — delete several of YOUR OWN saved prompts.
 *
 * The filter-then-clear-out gesture would otherwise be one request per prompt,
 * which is slow, half-succeeds on a dropped connection, and reports nothing
 * useful when it does.
 *
 * Scope is the same as `/api/prompts`: the effective user, in the active org.
 * An id naming somebody else's prompt is not an error — it simply is not
 * yours, so it is skipped and counted. Deleting a colleague's prompt goes
 * through `/api/prompts/org`, which is gated on OrgAdmin.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { getEffectiveUserId, isReadOnlyImpersonation } from "@/app/lib/superuser";
import { getCurrentOrgId, OrgContextError } from "@/app/lib/auth/orgContext";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cookieStore = await cookies();
  let orgId: string;
  try { orgId = await getCurrentOrgId(session, cookieStore); }
  catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (isReadOnlyImpersonation(session, cookieStore)) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  // SEC-21: the same impersonation-aware owner scope the single-prompt routes use.
  const userId = getEffectiveUserId(session, cookieStore) ?? session.user.id;

  const body = await req.json().catch(() => null);
  const ids: unknown = (body as { ids?: unknown } | null)?.ids;
  if (!Array.isArray(ids) || ids.some((i) => typeof i !== "string")) {
    return NextResponse.json({ error: "ids must be an array of strings" }, { status: 400 });
  }
  if (ids.length === 0) return NextResponse.json({ deleted: 0 });

  const { count } = await prisma.prompt.deleteMany({
    where: { id: { in: ids as string[] }, userId, orgId },
  });

  // The shortfall is reported rather than swallowed — asking for twelve and
  // getting nine means three were not yours, and that is worth seeing.
  return NextResponse.json({ deleted: count, skipped: ids.length - count });
}
