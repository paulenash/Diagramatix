import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { buildOrgStructureFromBpmn } from "@/app/lib/entityLists/buildFromBpmn";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/[id]/build-org-structure { name? }
 * Populate the project's Organisation Hierarchy (OrgStructure EntityList) from the
 * project's BPMN diagrams — white-box Pool→Organisation, Lane→OrgUnit, Sublane→Team,
 * deduped across diagrams and MERGED into any existing structure (existing kept).
 * Owner only. Returns 201 with `added` counts (0s, not an error, when no pools/lanes).
 */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id } = await params;
  let access;
  try {
    access = await requireProjectAccess(session, await cookies(), id, "owner");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const name = (await req.json().catch(() => ({})))?.name as string | undefined;
  const result = await buildOrgStructureFromBpmn(id, access.projectOrgId, { name });
  return NextResponse.json({ ok: true, ...result }, { status: 201 });
}
