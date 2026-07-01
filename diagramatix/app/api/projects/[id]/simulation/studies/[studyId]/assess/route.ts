/**
 * POST — a grounded, plain-English AI assessment of an As-is → To-be comparison.
 * Loads the latest run metrics of the two named scenarios, computes the deltas
 * deterministically (buildComparisonFacts), and has Claude write a short verdict
 * from ONLY those figures. Read-access is enough (it doesn't mutate anything).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import type { RunMetrics } from "@/app/lib/simulation/results";
import { buildComparisonFacts, generateSimAssessment } from "@/app/lib/simulation/assessFacts";

type Params = { params: Promise<{ id: string; studyId: string }> };

/** Latest run WITH metrics for a scenario that belongs to this study+project. */
async function latestMetrics(scenarioId: string, studyId: string, projectId: string): Promise<{ name: string; isBaseline: boolean; metrics: RunMetrics } | null> {
  const sc = await prisma.simulationScenario.findUnique({
    where: { id: scenarioId },
    include: { study: { select: { id: true, projectId: true } } },
  });
  if (!sc || sc.studyId !== studyId || sc.study.projectId !== projectId) return null;
  const run = await prisma.simulationRun.findFirst({
    where: { scenarioId, error: null },
    orderBy: { startedAt: "desc" },
    select: { metrics: true },
  });
  if (!run?.metrics) return null;
  return { name: sc.name, isBaseline: sc.isBaseline, metrics: run.metrics as unknown as RunMetrics };
}

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  const { id, studyId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI service not configured. Set ANTHROPIC_API_KEY in .env" }, { status: 501 });

  const body = await req.json().catch(() => ({}));
  const baselineScenarioId = typeof body.baselineScenarioId === "string" ? body.baselineScenarioId : "";
  const compareScenarioId = typeof body.compareScenarioId === "string" ? body.compareScenarioId : "";
  if (!baselineScenarioId || !compareScenarioId) return NextResponse.json({ error: "baselineScenarioId + compareScenarioId required" }, { status: 400 });

  const base = await latestMetrics(baselineScenarioId, studyId, id);
  const tobe = await latestMetrics(compareScenarioId, studyId, id);
  if (!base || !tobe) return NextResponse.json({ error: "Both scenarios need a completed run before they can be assessed." }, { status: 400 });

  const unit = base.metrics.clockUnit || tobe.metrics.clockUnit || "";
  const facts = buildComparisonFacts(base.metrics, tobe.metrics, base.name, tobe.name, unit);
  const result = await generateSimAssessment({ apiKey, facts });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ assessment: result.assessment, model: result.model, facts });
}
