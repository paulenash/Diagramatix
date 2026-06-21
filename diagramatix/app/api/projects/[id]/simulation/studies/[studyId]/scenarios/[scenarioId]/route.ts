import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string; studyId: string; scenarioId: string }> };

/** Verify the scenario → study → project chain. Returns false if any hop
 *  doesn't match (so a guessed id can't reach another project's scenario). */
async function scenarioInProject(scenarioId: string, studyId: string, projectId: string) {
  const sc = await prisma.simulationScenario.findUnique({
    where: { id: scenarioId },
    select: { studyId: true, study: { select: { projectId: true } } },
  });
  return !!sc && sc.studyId === studyId && sc.study.projectId === projectId;
}

/** PUT { name?, runConfig?, overrides?, isBaseline?, status? } — patch a
 *  scenario. runConfig/overrides are stored as-is (JSON); only one baseline
 *  per study is allowed. */
export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id, studyId, scenarioId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (!(await scenarioInProject(scenarioId, studyId, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (body.runConfig !== undefined) data.runConfig = body.runConfig;
  if (body.overrides !== undefined) data.overrides = body.overrides;
  if (typeof body.status === "string") data.status = body.status;

  // Process variant (As-is vs To-be): the diagram ids this scenario runs
  // instead of the study's roots. Validate each is a BPMN diagram in this
  // project; [] = inherit the study roots.
  if (Array.isArray(body.variantRootIds)) {
    const requested = body.variantRootIds.filter((x: unknown): x is string => typeof x === "string");
    const valid = await prisma.diagram.findMany({
      where: { id: { in: requested }, projectId: id, type: "bpmn" },
      select: { id: true },
    });
    const validSet = new Set(valid.map((d) => d.id));
    data.variantRootIds = requested.filter((x: string) => validSet.has(x));
  }

  if (body.isBaseline === true) {
    await prisma.simulationScenario.updateMany({ where: { studyId, isBaseline: true }, data: { isBaseline: false } });
    data.isBaseline = true;
  } else if (body.isBaseline === false) {
    data.isBaseline = false;
  }

  const scenario = await prisma.simulationScenario.update({ where: { id: scenarioId }, data });
  return NextResponse.json({ scenario });
}

/** DELETE — remove a scenario (cascades to its runs). */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id, studyId, scenarioId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (!(await scenarioInProject(scenarioId, studyId, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.simulationScenario.delete({ where: { id: scenarioId } });
  return NextResponse.json({ ok: true });
}
