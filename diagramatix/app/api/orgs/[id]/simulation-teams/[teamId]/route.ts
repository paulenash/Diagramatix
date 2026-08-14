import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string; teamId: string }> };

/** Confirm the team is a MASTER belonging to this org — never a project copy,
 *  and never another tenant's row. */
async function requireMaster(orgId: string, teamId: string) {
  const team = await prisma.simulationTeam.findFirst({ where: { id: teamId, orgId }, select: { id: true } });
  if (!team) return NextResponse.json({ error: "Team not found in this organisation" }, { status: 404 });
  return null;
}

/**
 * PUT /api/orgs/[id]/simulation-teams/[teamId] { name?, capacity?, costPerHour?, efficiency? }
 * Edit a master. Project copies already adopted are NOT touched — provenance
 * (sourceTeamId) records where a copy came from, but carries no live link, so a
 * project's tuned staffing is never rewritten from under it.
 */
export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id, teamId } = await params;
  try {
    await requireOrgAdminFor(session, await cookies(), id);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const missing = await requireMaster(id, teamId);
  if (missing) return missing;

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    const name = body.name.trim();
    const clash = await prisma.simulationTeam.findFirst({
      where: { orgId: id, name, id: { not: teamId } }, select: { id: true },
    });
    if (clash) return NextResponse.json({ error: `A team named "${name}" already exists` }, { status: 409 });
    data.name = name;
  }
  if (body.capacity !== undefined) {
    const n = typeof body.capacity === "number" ? Math.round(body.capacity) : parseInt(String(body.capacity), 10);
    data.capacity = Number.isFinite(n) ? Math.max(1, n) : 1;
  }
  if (body.costPerHour !== undefined) {
    data.costPerHour = typeof body.costPerHour === "number" ? body.costPerHour : null;
  }
  if (body.efficiency !== undefined) {
    data.efficiency = typeof body.efficiency === "number" && body.efficiency > 0 ? body.efficiency : 1;
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const team = await prisma.simulationTeam.update({ where: { id: teamId }, data });
  return NextResponse.json({ team });
}

/**
 * DELETE /api/orgs/[id]/simulation-teams/[teamId]
 * Remove a master. Project copies survive (sourceTeamId nulls via SetNull) —
 * deleting the org's template must not break a project that already adopted it.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id, teamId } = await params;
  try {
    await requireOrgAdminFor(session, await cookies(), id);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const missing = await requireMaster(id, teamId);
  if (missing) return missing;

  await prisma.simulationTeam.delete({ where: { id: teamId } });
  return NextResponse.json({ ok: true });
}
