import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { DEFAULT_RUN_CONFIG } from "@/app/lib/simulation/types";

type Params = { params: Promise<{ id: string; studyId: string }> };

/** POST { name, duplicateOf?, isBaseline? } — create a scenario in the study,
 *  optionally cloning another scenario's runConfig + overrides. */
export async function POST(req: Request, { params }: Params) {
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
  // Study must belong to this project.
  const study = await prisma.simulationStudy.findFirst({ where: { id: studyId, projectId: id }, select: { id: true } });
  if (!study) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  // Clone source config/overrides when duplicating, else start from defaults.
  let runConfig: unknown = { ...DEFAULT_RUN_CONFIG };
  let overrides: unknown = {};
  let variantRootIds: unknown = [];
  if (typeof body.duplicateOf === "string") {
    const src = await prisma.simulationScenario.findFirst({
      where: { id: body.duplicateOf, studyId },
      select: { runConfig: true, overrides: true, variantRootIds: true },
    });
    if (src) { runConfig = src.runConfig; overrides = src.overrides; variantRootIds = src.variantRootIds; }
  }

  const isBaseline = body.isBaseline === true;
  // Only one baseline per study.
  if (isBaseline) {
    await prisma.simulationScenario.updateMany({ where: { studyId, isBaseline: true }, data: { isBaseline: false } });
  }

  const scenario = await prisma.simulationScenario.create({
    data: {
      name, studyId, isBaseline,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      runConfig: runConfig as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      overrides: overrides as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      variantRootIds: variantRootIds as any,
    },
  });
  return NextResponse.json({ scenario }, { status: 201 });
}
