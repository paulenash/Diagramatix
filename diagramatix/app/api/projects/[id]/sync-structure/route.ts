/**
 * POST /api/projects/[id]/sync-structure
 * Merge the latest org-master structure into this project's adopted copies —
 * add/rename/remove master-origin nodes while keeping the project's own
 * additions. Owner only. Returns { added, updated, removed, lists }.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { syncStructure } from "@/app/lib/entityLists/syncStructure";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "owner");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const result = await syncStructure(id);
  return NextResponse.json({ ok: true, ...result });
}
