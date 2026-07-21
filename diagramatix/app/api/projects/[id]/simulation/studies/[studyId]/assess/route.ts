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
import { orgPolicyAllows, orgRedactionEnabled } from "@/app/lib/auth/orgPolicy";
import { makeRedactor } from "@/app/lib/ai/redaction";
import { getAiGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { aiApiKey } from "@/app/lib/ai/anthropicClient";
import type { RunMetrics } from "@/app/lib/simulation/results";
import { buildComparisonFacts, generateSimAssessment, summariseComparison } from "@/app/lib/simulation/assessFacts";

type Params = { params: Promise<{ id: string; studyId: string }> };

type Loaded = { name: string; metrics: RunMetrics };

/** Latest run WITH metrics for a scenario that belongs to this study+project. */
async function latestMetrics(scenarioId: string, studyId: string, projectId: string): Promise<Loaded | null> {
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
  return { name: sc.name, metrics: run.metrics as unknown as RunMetrics };
}

/** A specific saved run (for comparing two Run History entries directly). Its
 *  label is the run's own name, falling back to the scenario name. */
async function runMetrics(runId: string, studyId: string, projectId: string): Promise<Loaded | null> {
  const run = await prisma.simulationRun.findUnique({
    where: { id: runId },
    include: { scenario: { include: { study: { select: { id: true, projectId: true } } } } },
  });
  if (!run || run.error || !run.metrics) return null;
  if (run.scenario.studyId !== studyId || run.scenario.study.projectId !== projectId) return null;
  return { name: run.name || run.scenario.name, metrics: run.metrics as unknown as RunMetrics };
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
  const body = await req.json().catch(() => ({}));
  // Two modes: compare two SAVED runs (baselineRunId/compareRunId), or two
  // scenarios' latest runs (baselineScenarioId/compareScenarioId).
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const baselineRunId = str(body.baselineRunId), compareRunId = str(body.compareRunId);
  let base: Loaded | null, tobe: Loaded | null;
  if (baselineRunId && compareRunId) {
    base = await runMetrics(baselineRunId, studyId, id);
    tobe = await runMetrics(compareRunId, studyId, id);
  } else {
    const baselineScenarioId = str(body.baselineScenarioId), compareScenarioId = str(body.compareScenarioId);
    if (!baselineScenarioId || !compareScenarioId) return NextResponse.json({ error: "Provide two run ids or two scenario ids" }, { status: 400 });
    base = await latestMetrics(baselineScenarioId, studyId, id);
    tobe = await latestMetrics(compareScenarioId, studyId, id);
  }
  if (!base || !tobe) return NextResponse.json({ error: "Both sides need a completed run before they can be assessed." }, { status: 400 });

  const unit = base.metrics.clockUnit || tobe.metrics.clockUnit || "";
  const facts = buildComparisonFacts(base.metrics, tobe.metrics, base.name, tobe.name, unit);

  // Branch: AI narrates only when the org allows AI AND a key is configured.
  // Otherwise fall back to the deterministic templated comparison (ENT-05) — a 200,
  // not a 403 — so strict/AI-off tenants still get a Comparison summary.
  const model = await getAiGenerateModel();
  const apiKey = aiApiKey(model);
  const aiOn = (await orgPolicyAllows(session, "allowAi")) && !!apiKey;
  if (!aiOn) {
    return NextResponse.json({ assessment: summariseComparison(facts), facts, deterministic: true });
  }

  // ENT-06: when the org opts in, pseudonymise the scenario + team names in the
  // facts before egress; the numbers are untouched and restored names come back.
  const redactor = (await orgRedactionEnabled(session))
    ? makeRedactor([facts.baseName, facts.tobeName, facts.bottleneck?.team])
    : undefined;

  const result = await generateSimAssessment({ apiKey: apiKey!, facts }, redactor);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ assessment: result.assessment, model: result.model, facts });
}
