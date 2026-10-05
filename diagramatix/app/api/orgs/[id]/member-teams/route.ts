/**
 * Admin-managed team membership — which Org-Structure teams/roles each member
 * belongs to. Powers the Process Portal's "Involving me" view. Gated by
 * requireOrgAdminFor (OrgAdmin of this org, or any SuperAdmin).
 *
 *   GET    /api/orgs/[id]/member-teams  → { members, nodes, memberships }
 *   POST   { userId, entityNodeId }      → assign (idempotent)
 *   DELETE { userId, entityNodeId }      → unassign
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

async function gate(id: string) {
  const session = await auth();
  await requireOrgAdminFor(session, await cookies(), id);
  return session;
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  try {
    await gate(id);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const [members, lists, memberships] = await Promise.all([
    prisma.orgMember.findMany({
      where: { orgId: id },
      select: { userId: true, user: { select: { name: true, email: true } } },
    }),
    prisma.entityList.findMany({
      where: { orgId: id, kind: "OrgStructure" },
      select: { name: true, nodes: { select: { id: true, name: true, parentId: true, level: true, sortOrder: true } } },
    }),
    prisma.orgMemberTeam.findMany({ where: { orgId: id }, select: { userId: true, entityNodeId: true } }),
  ]);

  return NextResponse.json({
    members: members.map((m) => ({ userId: m.userId, name: m.user?.name ?? null, email: m.user?.email ?? "" })),
    nodes: lists.flatMap((l) => l.nodes.map((n) => ({ ...n, listName: l.name }))),
    memberships,
  });
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  let actorId: string;
  try {
    actorId = (await requireOrgAdminFor(session, await cookies(), id)).userId;
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = await req.json().catch(() => ({}));
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const entityNodeId = typeof body?.entityNodeId === "string" ? body.entityNodeId : "";
  if (!userId || !entityNodeId) return NextResponse.json({ error: "userId and entityNodeId are required" }, { status: 400 });

  // Validate both belong to this org (member of the org; node in an org-master list).
  const [member, node] = await Promise.all([
    prisma.orgMember.findFirst({ where: { orgId: id, userId }, select: { id: true } }),
    prisma.entityNode.findFirst({ where: { id: entityNodeId, list: { orgId: id, kind: "OrgStructure" } }, select: { id: true } }),
  ]);
  if (!member) return NextResponse.json({ error: "Not a member of this org" }, { status: 400 });
  if (!node) return NextResponse.json({ error: "Team node not found in this org" }, { status: 400 });

  await prisma.orgMemberTeam.upsert({
    where: { orgId_userId_entityNodeId: { orgId: id, userId, entityNodeId } },
    create: { orgId: id, userId, entityNodeId, createdById: actorId },
    update: {},
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  try {
    await requireOrgAdminFor(session, await cookies(), id);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = await req.json().catch(() => ({}));
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const entityNodeId = typeof body?.entityNodeId === "string" ? body.entityNodeId : "";
  if (!userId || !entityNodeId) return NextResponse.json({ error: "userId and entityNodeId are required" }, { status: 400 });

  await prisma.orgMemberTeam.deleteMany({ where: { orgId: id, userId, entityNodeId } });
  return NextResponse.json({ ok: true });
}
