import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { mergeMissingFromBpmn } from "@/app/lib/entityLists/buildFromBpmn";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/[id]/add-missing-from-bpmn
 * Non-destructive: merge the project's BPMN-derived entities into its CURRENT
 * Entity Structure, adding only what's missing and keeping everything already
 * there (incl. manual additions). Managing entries is edit-level (unlike
 * Populate-from-BPMN, which mints an org-master structure and needs OrgAdmin).
 * Returns `{ added }`.
 */
export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const result = await mergeMissingFromBpmn(id);
  return NextResponse.json({ ok: true, ...result });
}
