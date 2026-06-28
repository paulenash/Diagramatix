import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { adoptStructure, AdoptStructureError } from "@/app/lib/entityLists/adoptStructure";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/adopt-structure
 * The org-master OrgStructure lists this project could adopt (the project's
 * own org). Gated at "view" so the Project Structure UI can populate its
 * dropdown without the client needing the orgId.
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
  const [org, lists] = await Promise.all([
    prisma.org.findUnique({ where: { id: access.projectOrgId }, select: { id: true, name: true } }),
    prisma.entityList.findMany({
      where: { orgId: access.projectOrgId, kind: "OrgStructure" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return NextResponse.json({ orgId: org?.id, orgName: org?.name ?? "", lists });
}

/**
 * POST /api/projects/[id]/adopt-structure { orgListId }[?replace=true]
 * Clone an org master EntityList (and all its nodes) into a project-scoped
 * COPY the project then edits independently. One list per kind per project:
 * if one already exists for the same kind, require ?replace=true.
 * Owner only.
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

  const orgListId = (await req.json())?.orgListId as string | undefined;
  if (!orgListId) return NextResponse.json({ error: "orgListId required" }, { status: 400 });
  const replace = new URL(req.url).searchParams.get("replace") === "true";

  let created;
  try {
    created = await adoptStructure(id, access.projectOrgId, orgListId, { replace });
  } catch (err) {
    if (err instanceof AdoptStructureError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const list = await prisma.entityList.findUnique({
    where: { id: created.listId },
    include: { nodes: { orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }] } },
  });
  return NextResponse.json({ list }, { status: 201 });
}
