import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { gateFeature } from "@/app/lib/subscription-route";

type Params = { params: Promise<{ id: string }> };

/** GET /api/projects/[id]/simulation/studies — the project's simulation
 *  studies (portfolios) with their root + scenario counts, plus the project's
 *  BPMN diagrams so the manager can offer them as pickable roots. Gated at
 *  "view" so any editor/viewer can browse studies. */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const [studies, diagrams] = await Promise.all([
    prisma.simulationStudy.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { roots: true, scenarios: true } } },
    }),
    // Only BPMN diagrams can be simulated — they carry the sim annotations.
    prisma.diagram.findMany({
      where: { projectId: id, type: "bpmn" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return NextResponse.json({ studies, diagrams });
}

/** POST /api/projects/[id]/simulation/studies { name } — create a study. */
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
  const fg = await gateFeature(session?.user?.id ?? "", "simulator");
  if (fg) return fg;
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const study = await prisma.simulationStudy.create({
    data: { name, projectId: id, createdById: session?.user?.id ?? null },
    include: { _count: { select: { roots: true, scenarios: true } } },
  });
  return NextResponse.json({ study }, { status: 201 });
}
