/**
 * GET  — ArchiMate diagrams in this project that could supply a skills matrix,
 *        with a preview of what each would fill.
 * POST — fill the matrix from one of them: team members get their skills, tasks
 *        get their required skills.
 *
 * READ-ONCE, NOT A LIVE LINK. The diagram id and the date are recorded so a
 * re-pull is deliberate, but a run's results must never change because someone
 * edited an architecture diagram last Tuesday — reproducibility is what the whole
 * Simulator rests on.
 *
 * The response leads with what did NOT match. A fill that quietly matched nothing
 * looks exactly like a fill that worked, which is this feature's failure mode.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { skillsFromArchimate, matchSkills } from "@/app/lib/simulation/skillsFromArchimate";
import { getSimParams, simPatch } from "@/app/lib/diagram/simParams";
import type { DiagramData } from "@/app/lib/diagram/types";

type Params = { params: Promise<{ id: string }> };

/** Task labels across the project's BPMN diagrams, with where each one lives. */
async function projectTasks(projectId: string) {
  const diagrams = await prisma.diagram.findMany({
    where: { projectId, type: "bpmn" },
    select: { id: true, name: true, data: true },
  });
  const tasks: { diagramId: string; elementId: string; label: string }[] = [];
  for (const d of diagrams) {
    const data = (d.data ?? {}) as unknown as DiagramData;
    for (const el of data.elements ?? []) {
      if (el.type !== "task" && el.type !== "subprocess" && el.type !== "subprocess-expanded") continue;
      const label = (el.label ?? "").replace(/\s+/g, " ").trim();
      if (label) tasks.push({ diagramId: d.id, elementId: el.id, label });
    }
  }
  return { diagrams, tasks };
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const archi = await prisma.diagram.findMany({
    where: { projectId: id, type: "archimate" },
    select: { id: true, name: true, data: true },
    orderBy: { updatedAt: "desc" },
  });
  const teams = await prisma.simulationTeam.findMany({ where: { projectId: id }, select: { name: true, members: true } });
  const memberNames = teams.flatMap((t) =>
    (Array.isArray(t.members) ? (t.members as unknown as { name?: string }[]) : [])
      .map((m) => m?.name).filter((n): n is string => !!n),
  );
  const { tasks } = await projectTasks(id);
  const taskLabels = [...new Set(tasks.map((t) => t.label))];

  // A preview, so nobody has to run a fill to find out it would match nothing.
  const options = archi.map((d) => {
    const model = skillsFromArchimate((d.data ?? {}) as unknown as DiagramData);
    const match = matchSkills(model, memberNames, taskLabels);
    return {
      id: d.id, name: d.name,
      actors: model.people.length,
      skills: model.skills.length,
      wouldFillMembers: match.units.length,
      wouldFillTasks: Object.keys(match.taskSkills).length,
      // WHICH READING answered. A diagram drawn half in each pattern yields
      // whichever half the code preferred, and the counts alone cannot tell
      // you that happened — so the pattern is reported alongside them.
      pattern: model.pattern,
      teams: model.teams.length,
      // Bundles flatten to their leaves and the bundle NAME is then held by
      // nobody. Silent flattening is the trap: require the bundle on a task and
      // the work can never start. Named here so the concept is visible.
      bundles: model.bundles,
    };
  });
  return NextResponse.json({ options, memberNames, taskCount: taskLabels.length });
}

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

  const body = await req.json().catch(() => ({}));
  const diagramId = typeof body.diagramId === "string" ? body.diagramId : "";
  if (!diagramId) return NextResponse.json({ error: "Pick an ArchiMate diagram to fill from." }, { status: 400 });

  const source = await prisma.diagram.findFirst({
    where: { id: diagramId, projectId: id, type: "archimate" },
    select: { id: true, name: true, data: true },
  });
  if (!source) return NextResponse.json({ error: "That ArchiMate diagram is not in this project." }, { status: 404 });

  const model = skillsFromArchimate((source.data ?? {}) as unknown as DiagramData);

  const teams = await prisma.simulationTeam.findMany({ where: { projectId: id }, select: { id: true, name: true, members: true } });
  const memberNames = teams.flatMap((t) =>
    (Array.isArray(t.members) ? (t.members as unknown as { name?: string }[]) : [])
      .map((m) => m?.name).filter((n): n is string => !!n),
  );
  const { tasks } = await projectTasks(id);
  const match = matchSkills(model, memberNames, [...new Set(tasks.map((t) => t.label))]);

  const skillsSource = { diagramId: source.id, diagramName: source.name, at: new Date().toISOString() };
  const bySkilledName = new Map(match.units.map((u) => [u.name, u.skills]));

  // ── Write the members' skills ──
  let membersUpdated = 0;
  for (const t of teams) {
    const members = Array.isArray(t.members) ? (t.members as unknown as { name?: string; skills?: string[] }[]) : [];
    if (members.length === 0) continue;
    let touched = false;
    const next = members.map((m) => {
      const skills = m?.name ? bySkilledName.get(m.name) : undefined;
      if (!skills) return m;
      touched = true;
      return { ...m, skills };
    });
    if (!touched) continue;
    membersUpdated += next.filter((m) => m?.name && bySkilledName.has(m.name)).length;
    // Prisma 7 omits JSON fields from model update inputs — raw SQL for both.
    await pgPool.query(
      'UPDATE "SimulationTeam" SET members = $1::jsonb, "skillsSource" = $2::jsonb, "updatedAt" = NOW() WHERE id = $3',
      [JSON.stringify(next), JSON.stringify(skillsSource), t.id],
    );
  }

  // ── Write the tasks' required skills ──
  const byDiagram = new Map<string, { elementId: string; label: string }[]>();
  for (const t of tasks) {
    if (!match.taskSkills[t.label]) continue;
    (byDiagram.get(t.diagramId) ?? byDiagram.set(t.diagramId, []).get(t.diagramId)!).push(t);
  }
  let tasksUpdated = 0;
  for (const [dId, hits] of byDiagram) {
    const d = await prisma.diagram.findFirst({ where: { id: dId, projectId: id }, select: { data: true } });
    if (!d?.data) continue;
    const data = d.data as unknown as DiagramData;
    const wanted = new Map(hits.map((h) => [h.elementId, match.taskSkills[h.label]]));
    const elements = (data.elements ?? []).map((el) => {
      const skills = wanted.get(el.id);
      if (!skills) return el;
      tasksUpdated++;
      return { ...el, ...simPatch(el, { ...getSimParams(el), requiredSkills: skills }) };
    });
    await pgPool.query('UPDATE "Diagram" SET data = $1::jsonb, "updatedAt" = NOW() WHERE id = $2',
      [JSON.stringify({ ...data, elements }), dId]);
  }

  return NextResponse.json({
    filledFrom: skillsSource,
    membersUpdated,
    tasksUpdated,
    // The unmatched report is the headline, not a footnote.
    unmatchedActors: match.unmatchedActors,
    unmatchedMembers: match.unmatchedMembers,
    unmatchedWork: match.unmatchedWork,
    warnings: match.warnings,
    skills: model.skills,
  });
}
