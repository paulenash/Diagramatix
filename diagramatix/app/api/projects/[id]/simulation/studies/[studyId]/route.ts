import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string; studyId: string }> };

/** Confirm the study belongs to the project (defence in depth — the URL pairs
 *  them but we never trust that). Returns null if it doesn't. */
async function studyInProject(studyId: string, projectId: string) {
  const study = await prisma.simulationStudy.findUnique({ where: { id: studyId } });
  return study && study.projectId === projectId ? study : null;
}

/** GET — the study with its roots (diagram id + name) and scenarios. */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  const { id, studyId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const study = await prisma.simulationStudy.findFirst({
    where: { id: studyId, projectId: id },
    include: {
      roots: { include: { diagram: { select: { id: true, name: true } } } },
      scenarios: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!study) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ study });
}

/** PUT { name?, rootDiagramIds? } — rename and/or replace the root set. Roots
 *  are validated to belong to this project; the set is replaced wholesale. */
export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id, studyId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (!(await studyInProject(studyId, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));

  if (typeof body.name === "string" && body.name.trim()) {
    await prisma.simulationStudy.update({ where: { id: studyId }, data: { name: body.name.trim() } });
  }

  if (Array.isArray(body.rootDiagramIds)) {
    const requested = body.rootDiagramIds.filter((x: unknown): x is string => typeof x === "string");
    // Keep only diagrams that actually live in this project.
    const valid = await prisma.diagram.findMany({
      where: { id: { in: requested }, projectId: id },
      select: { id: true },
    });
    const validIds = new Set(valid.map((d) => d.id));
    await prisma.$transaction([
      prisma.simulationStudyRoot.deleteMany({ where: { studyId } }),
      ...[...validIds].map((diagramId) =>
        prisma.simulationStudyRoot.create({ data: { studyId, diagramId } }),
      ),
    ]);
  }

  const study = await prisma.simulationStudy.findFirst({
    where: { id: studyId, projectId: id },
    include: {
      roots: { include: { diagram: { select: { id: true, name: true } } } },
      scenarios: { orderBy: { createdAt: "asc" } },
    },
  });
  return NextResponse.json({ study });
}

/** DELETE — remove a study (cascades to roots, scenarios, runs). */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id, studyId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (!(await studyInProject(studyId, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.simulationStudy.delete({ where: { id: studyId } });
  return NextResponse.json({ ok: true });
}
