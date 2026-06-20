import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

/** GET /api/projects/[id]/simulation-teams — the project's simulation teams
 *  (resource pools). Gated at "view" so any editor/viewer can load them when
 *  running a simulation. */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const teams = await prisma.simulationTeam.findMany({
    where: { projectId: id },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ teams });
}

/** POST /api/projects/[id]/simulation-teams { name, capacity?, costPerHour?, efficiency? } */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const team = await prisma.simulationTeam.create({
    data: {
      name,
      projectId: id,
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
