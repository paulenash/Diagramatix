import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { adoptStructureFull, AdoptStructureError } from "@/app/lib/entityLists/adoptStructure";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/adopt-structure
 * The named Entity Structures this project could adopt (from the project's own
 * org). Gated at "view" so the Project Structure UI can populate its dropdown.
 * Also reports whether the project has already adopted (for the Sync button).
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  let access;
  try {
    access = await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const [org, structures, adoptedCount] = await Promise.all([
    prisma.org.findUnique({ where: { id: access.projectOrgId }, select: { id: true, name: true } }),
    prisma.entityStructure.findMany({ where: { orgId: access.projectOrgId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.entityList.count({ where: { projectId: id, sourceListId: { not: null } } }),
  ]);
  return NextResponse.json({ orgId: org?.id, orgName: org?.name ?? "", structures, adopted: adoptedCount > 0 });
}

/**
 * POST /api/projects/[id]/adopt-structure { structureId }[?replace=true]
 * Clone a whole org Entity Structure (all five lists + nodes) into project-scoped
 * COPIES the project edits independently. If the project has already adopted,
 * require ?replace=true (wipes the project's existing entity lists). Owner only.
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

  const structureId = (await req.json())?.structureId as string | undefined;
  if (!structureId) return NextResponse.json({ error: "structureId required" }, { status: 400 });
  const replace = new URL(req.url).searchParams.get("replace") === "true";

  try {
    const result = await adoptStructureFull(id, access.projectOrgId, structureId, { replace });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (err) {
    if (err instanceof AdoptStructureError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
