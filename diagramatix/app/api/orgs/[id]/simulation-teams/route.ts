import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/orgs/[id]/simulation-teams
 * The org's MASTER simulation teams — the standing resource pools (name,
 * capacity, cost/hour, efficiency) a project can adopt as its own copies.
 * SuperAdmin OR Owner/Admin in this org.
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  try {
    await requireOrgAdminFor(session, await cookies(), id);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const teams = await prisma.simulationTeam.findMany({
    where: { orgId: id },
    orderBy: { name: "asc" },
    // How many project copies came from each master — the "in use" signal for
    // the admin list.
    include: { _count: { select: { clones: true } } },
  });
  return NextResponse.json({ teams });
}

/**
 * POST /api/orgs/[id]/simulation-teams { name, capacity?, costPerHour?, efficiency? }
 * Create a master team for the org.
 */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id } = await params;
  try {
    await requireOrgAdminFor(session, await cookies(), id);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  // Name is the identity a diagram references, so a duplicate master would be
  // ambiguous the moment a project adopted both.
  const clash = await prisma.simulationTeam.findFirst({ where: { orgId: id, name }, select: { id: true } });
  if (clash) return NextResponse.json({ error: `A team named "${name}" already exists` }, { status: 409 });

  const team = await prisma.simulationTeam.create({
    data: {
      name,
      orgId: id,
      capacity: clampInt(body.capacity, 1),
      costPerHour: typeof body.costPerHour === "number" ? body.costPerHour : null,
      efficiency: typeof body.efficiency === "number" && body.efficiency > 0 ? body.efficiency : 1,
    },
  });
  return NextResponse.json({ team }, { status: 201 });
}

function clampInt(v: unknown, min: number): number {
  const n = typeof v === "number" ? Math.round(v) : parseInt(String(v), 10);
  return Number.isFinite(n) ? Math.max(min, n) : min;
}
