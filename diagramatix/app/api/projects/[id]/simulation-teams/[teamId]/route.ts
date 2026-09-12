import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string; teamId: string }> };

/** The three orderings the engine implements. Anything else is ignored rather
 *  than stored, so a typo cannot put a team into a state the pool has no branch
 *  for. */
const DISCIPLINES = new Set(["fifo", "priority", "shortest-first"]);
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
  if (typeof body.name === "string" && body.name.trim()) {
    const name = body.name.trim();
    // Names are unique per project: two resources sharing one name split that
    // resource's capacity and make it impossible to tell which a task uses.
    const clash = await prisma.simulationTeam.findFirst({
      where: { projectId: id, name: { equals: name, mode: "insensitive" }, NOT: { id: teamId } },
      select: { id: true, name: true },
    });
    if (clash) {
      return NextResponse.json(
        { error: `Another resource is already called "${clash.name}". Resource names must be unique.` },
        { status: 409 },
      );
    }
    data.name = name;
  }
  if (body.capacity !== undefined) data.capacity = Math.max(1, Math.round(Number(body.capacity)) || 1);
  if (body.costPerHour !== undefined) data.costPerHour = body.costPerHour === null ? null : Number(body.costPerHour);
  if (body.efficiency !== undefined) data.efficiency = Number(body.efficiency) > 0 ? Number(body.efficiency) : 1;
  // "fifo" is stored as NULL so the column keeps ONE meaning for "the default"
  // rather than two values that behave identically.
  if (body.discipline !== undefined) {
    const d = typeof body.discipline === "string" ? body.discipline : "";
    data.discipline = DISCIPLINES.has(d) && d !== "fifo" ? d : null;
  }
  if (body.preemptive !== undefined) data.preemptive = body.preemptive === true;
  if (body.calendarId !== undefined) data.calendarId = typeof body.calendarId === "string" && body.calendarId ? body.calendarId : null;

  // ── People, and what each of them can do ─────────────────────────────────
  //
  // NAMING PEOPLE IS WHAT TURNS SKILLS ON. ResourcePool short-circuits on
  // `if (!this.skilled)`: a team with no named members grants every skill
  // requirement to anyone, so a task's requiredSkills are silently ignored and
  // the run reports no queue where there should be one. That is why this is
  // editable at all — before it, only an ArchiMate fill could name anybody.
  //
  // Written with raw SQL because `members` is a Json column and Prisma 7 omits
  // Json fields from model update inputs.
  let members: { name: string; skills: string[] }[] | null = null;
  if (Array.isArray(body.members)) {
    members = (body.members as unknown[])
      .map((m) => {
        const row = (m ?? {}) as { name?: unknown; skills?: unknown };
        const name = typeof row.name === "string" ? row.name.replace(/s+/g, " ").trim() : "";
        const skills = Array.isArray(row.skills)
          ? [...new Set((row.skills as unknown[]).filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()))]
          : [];
        return { name, skills };
      })
      // A nameless person is not a person. Dropping the row is right: the only
      // thing a member's name does is identify them, so one without a name
      // would be an anonymous unit — which is what CAPACITY already expresses.
      .filter((m) => m.name.length > 0);
  }

  const team = Object.keys(data).length
    ? await prisma.simulationTeam.update({ where: { id: teamId }, data })
    : await prisma.simulationTeam.findUnique({ where: { id: teamId } });

  if (members) {
    await pgPool.query('UPDATE "SimulationTeam" SET members = $1::jsonb, "updatedAt" = NOW() WHERE id = $2',
      [JSON.stringify(members), teamId]);
    return NextResponse.json({ team: { ...team, members } });
  }
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
