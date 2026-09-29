/**
 * POST — "what should I try next?" for a study.
 *
 * Reads the study's run history, computes the ranked suggestions deterministically
 * (`suggestNextSteps`), and — only when the org allows AI — has the model narrate
 * those findings from the facts alone. The suggestions themselves are returned
 * either way: the narration is a nicety, the arithmetic is the feature.
 *
 * Read access is enough; nothing is mutated. Creating a suggested scenario is a
 * separate, explicit POST to the scenarios route.
 */
import { NextResponse } from "next/server";
import { gateFeature, gateLimit, recordUsage } from "@/app/lib/subscription-route";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { orgPolicyAllows, orgRedactionEnabled } from "@/app/lib/auth/orgPolicy";
import { makeRedactor } from "@/app/lib/ai/redaction";
import { getAiGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { aiApiKey } from "@/app/lib/ai/anthropicClient";
import { enterAiContext, AI_INVOCATION_POINTS } from "@/app/lib/ai/aiTelemetry";
import { loadStudyRuns } from "@/app/lib/simulation/loadStudyRuns";
import { suggestNextSteps } from "@/app/lib/simulation/nextSteps";
import { buildNextStepsFacts, generateNextStepsNarrative, summariseNextSteps } from "@/app/lib/simulation/facts/nextStepsFacts";

type Params = { params: Promise<{ id: string; studyId: string }> };

export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  const { id, studyId } = await params;
  let orgId: string | null = null;
  try {
    const ctx = await requireProjectAccess(session, await cookies(), id, "view");
    orgId = ctx.projectOrgId ?? null;
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const fg = await gateFeature(session?.user?.id ?? "", "simulator-analysis");
  if (fg) return fg;

  const study = await prisma.simulationStudy.findFirst({ where: { id: studyId, projectId: id }, select: { id: true, name: true } });
  if (!study) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const runs = await loadStudyRuns(studyId, id);
  const report = suggestNextSteps(runs);

  // Not enough history is a real answer, not an error — and saying so is the
  // point. Never narrate an empty report; the model would fill the silence.
  if (!report.enough) return NextResponse.json({ report, narrative: null, deterministic: true });

  const facts = buildNextStepsFacts(report, study.name);

  const model = await getAiGenerateModel();
  const apiKey = aiApiKey(model);
  // The narration is an AI call, so it counts against the AI attempts limit. At the limit it falls back to
  // the deterministic summary (a 200, like AI-off) rather than failing the whole request.
  const aiOn = (await orgPolicyAllows(session, "allowAi")) && !!apiKey
    && (await gateLimit(session?.user?.id ?? "", "aiAttempts")) === null;
  if (!aiOn) {
    return NextResponse.json({ report, facts, narrative: summariseNextSteps(facts), deterministic: true });
  }

  // ENT-06: pseudonymise the study, team and node names before egress when the
  // org opts in; the numbers are untouched and real names come back.
  const redactor = (await orgRedactionEnabled(session))
    ? makeRedactor([facts.studyName, ...facts.leversTried.map((l) => l.name), ...facts.leversUntouched])
    : undefined;

  enterAiContext({ userId: session?.user?.id ?? null, orgId, invocationPoint: AI_INVOCATION_POINTS.SimulationNextSteps });
  const result = await generateNextStepsNarrative({ apiKey: apiKey!, facts }, redactor);
  if (result.ok && session?.user?.id) await recordUsage(session.user.id, "aiAttempts");
  if (!result.ok) {
    // A failed narration must not lose the findings — fall back rather than 500.
    return NextResponse.json({ report, facts, narrative: summariseNextSteps(facts), deterministic: true, aiError: result.error });
  }
  return NextResponse.json({ report, facts, narrative: result.narrative, model: result.model });
}
