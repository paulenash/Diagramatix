import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string; teamId: string }> };

/** PUT /api/projects/[id]/simulation-teams/[teamId] — update name/capacity/etc. */
export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id, teamId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const existing = await prisma.simulationTeam.findFirst({ where: { id: teamId, projectId: id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (body.capacity !== undefined) data.capacity = Math.max(1, Math.round(Number(body.capacity)) || 1);
  if (body.costPerHour !== undefined) data.costPerHour = body.costPerHour === null ? null : Number(body.costPerHour);
  if (body.efficiency !== undefined) data.efficiency = Number(body.efficiency) > 0 ? Number(body.efficiency) : 1;
  const team = await prisma.simulationTeam.update({ where: { id: teamId }, data });
  return NextResponse.json({ team });
}

/** DELETE /api/projects/[id]/simulation-teams/[teamId] */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id, teamId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const existing = await prisma.simulationTeam.findFirst({ where: { id: teamId, projectId: id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.simulationTeam.delete({ where: { id: teamId } });
  return NextResponse.json({ ok: true });
}
