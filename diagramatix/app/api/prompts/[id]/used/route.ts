/**
 * POST /api/prompts/[id]/used — record that a diagram was generated from this
 * prompt.
 *
 * A separate endpoint rather than a field on the PUT, for one reason that
 * matters: **using a prompt is not editing it.** Prisma's `@updatedAt` fires on
 * any model update, so folding this into the normal save would make "last
 * modified" mean "last run" — and the two answer completely different
 * questions when you are deciding what to keep. This goes through raw SQL so
 * `updatedAt` is left exactly as it was.
 *
 * Best-effort by design: a failure here must never cost somebody their
 * generated diagram, which is already on screen by the time this is called.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { pgPool } from "@/app/lib/db";
import { getEffectiveUserId } from "@/app/lib/superuser";
import { getCurrentOrgId, OrgContextError } from "@/app/lib/auth/orgContext";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cookieStore = await cookies();
  let orgId: string;
  try { orgId = await getCurrentOrgId(session, cookieStore); }
  catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const userId = getEffectiveUserId(session, cookieStore) ?? session.user.id;

  const { id } = await params;
  const { model } = await req.json().catch(() => ({ model: undefined }));

  // Scoped to the caller's own prompt, like every other write here. Someone
  // else generating from a prompt they cannot see is not a thing that happens.
  const { rowCount } = await pgPool.query(
    `UPDATE "Prompt"
        SET "useCount"   = "useCount" + 1,
            "lastUsedAt" = NOW(),
            "modelUsed"  = COALESCE($1, "modelUsed")
      WHERE id = $2 AND "userId" = $3 AND "orgId" = $4`,
    [typeof model === "string" && model.trim() ? model.trim() : null, id, userId, orgId],
  );

  return NextResponse.json({ recorded: rowCount === 1 });
}
