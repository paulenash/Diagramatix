import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { adoptTeams, AdoptTeamsError } from "@/app/lib/simulation/adoptTeams";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/adopt-teams
 * The org-master simulation teams this project could adopt (from the project's
 * OWN org), each flagged with whether the project already has a team of that
 * name. Gated at "view" so the Team Library picker can populate.
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
  const [org, masters, projectTeams] = await Promise.all([
    prisma.org.findUnique({ where: { id: access.projectOrgId }, select: { id: true, name: true } }),
    prisma.simulationTeam.findMany({
      where: { orgId: access.projectOrgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, capacity: true, costPerHour: true, efficiency: true },
    }),
    prisma.simulationTeam.findMany({ where: { projectId: id }, select: { name: true } }),
  ]);
  const here = new Set(projectTeams.map((t) => t.name));
  return NextResponse.json({
    orgId: org?.id,
    orgName: org?.name ?? "",
    teams: masters.map((m) => ({ ...m, alreadyInProject: here.has(m.name) })),
  });
}

/**
 * POST /api/projects/[id]/adopt-teams { teamIds?: string[], overwriteExisting?: boolean }
 * Clone the chosen org-master teams into project-scoped COPIES (all masters when
 * `teamIds` is omitted/empty). The copies are independent: editing one never
 * touches the master, and a later master edit never rewrites the copy.
 *
 * A project team of the same name is left alone unless `overwriteExisting`, so
 * an adopt can't silently stamp over staffing the project has already tuned.
 * Edit access required.
 */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id } = await params;
  let access;
  try {
    access = await requireProjectAccess(session, await cookies(), id, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json().catch(() => ({}));
  const teamIds = Array.isArray(body.teamIds) ? body.teamIds.filter((t: unknown) => typeof t === "string") : [];
  const overwriteExisting = body.overwriteExisting === true;

  try {
    const result = await adoptTeams(id, access.projectOrgId, teamIds, { overwriteExisting });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (err) {
    if (err instanceof AdoptTeamsError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
