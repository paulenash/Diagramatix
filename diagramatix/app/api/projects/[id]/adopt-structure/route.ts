import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";

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

  // The master must belong to the project's org.
  const master = await prisma.entityList.findFirst({
    where: { id: orgListId, orgId: access.projectOrgId },
    include: { nodes: true },
  });
  if (!master) return NextResponse.json({ error: "Org structure not found" }, { status: 404 });

  const existing = await prisma.entityList.findFirst({
    where: { projectId: id, kind: master.kind }, select: { id: true },
  });
  if (existing && !replace) {
    return NextResponse.json(
      { error: `This project already has a ${master.kind} list. Pass ?replace=true to overwrite.` },
      { status: 409 },
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    if (existing) await tx.entityList.delete({ where: { id: existing.id } });
    const copy = await tx.entityList.create({
      data: { name: master.name, kind: master.kind, projectId: id, sourceListId: master.id },
    });
    // Insert nodes parents-first, remapping ids so parentId references resolve.
    const idMap = new Map<string, string>();
    const remaining = [...master.nodes];
    let guard = remaining.length + 1;
    while (remaining.length && guard-- > 0) {
      for (let i = remaining.length - 1; i >= 0; i--) {
        const n = remaining[i];
        if (n.parentId && !idMap.has(n.parentId)) continue; // wait for parent
        const newNode = await tx.entityNode.create({
          data: {
            listId: copy.id,
            parentId: n.parentId ? idMap.get(n.parentId)! : null,
            name: n.name, level: n.level, sortOrder: n.sortOrder,
          },
        });
        idMap.set(n.id, newNode.id);
        remaining.splice(i, 1);
      }
    }
    return copy;
  });

  const list = await prisma.entityList.findUnique({
    where: { id: created.id },
    include: { nodes: { orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }] } },
  });
  return NextResponse.json({ list }, { status: 201 });
}
