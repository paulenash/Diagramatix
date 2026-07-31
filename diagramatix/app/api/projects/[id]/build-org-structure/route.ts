import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";
import { buildStructureFromBpmn } from "@/app/lib/entityLists/buildFromBpmn";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/[id]/build-org-structure { name? }
 * Create a NAMED, reusable org-level Entity Structure from this project's BPMN
 * diagrams — all five lists (Organisation Hierarchy from white-box pools/lanes/
 * sublanes; Participants/Systems/Documents/DataStores from the matching shapes),
 * deduped. It then appears in this project's "Adopt a structure…" list and is
 * editable as a master under Admin → Entity Lists. Creating an org master is an
 * ORG-ADMIN action, so the caller must be an Org Admin/Owner of the project's org
 * (SuperAdmins always pass). Returns 201 with `{ structureId, name, added }`
 * (empty structureId when the BPMN yielded nothing).
 */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id } = await params;
  let orgId: string;
  try {
    const access = await requireProjectAccess(session, await cookies(), id, "view");
    orgId = access.projectOrgId;
    // Creating a reusable org structure requires org-admin rights.
    await requireOrgAdminFor(session, await cookies(), orgId);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const name = (await req.json().catch(() => ({})))?.name as string | undefined;
  const result = await buildStructureFromBpmn(orgId, id, name);
  return NextResponse.json({ ok: true, ...result }, { status: 201 });
}
