/**
 * POST — an AI plain-language explanation of what a mining run revealed (process
 * shape, conformance findings, timing, and the twin). Text output; uses the
 * configured model. Metered against the AI-attempts quota; needs ANTHROPIC_API_KEY.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { orgPolicyAllows, orgRedactionEnabled } from "@/app/lib/auth/orgPolicy";
import { gateLimit, recordUsage } from "@/app/lib/subscription-route";
import { getAiGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { aiApiKey } from "@/app/lib/ai/anthropicClient";
import { makeRedactor } from "@/app/lib/ai/redaction";
import { explainMiningResults, summariseMiningResults } from "@/app/lib/mining/explainResults";
import type { Variant, MiningStats, Performance } from "@/app/lib/mining/types";
import type { ConformanceResult } from "@/app/lib/mining/transitionConformance";

type Params = { params: Promise<{ id: string; runId: string }> };

export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id, runId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const run = await prisma.processMiningRun.findFirst({ where: { id: runId, projectId: id } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const variants = (run.variants ?? []) as unknown as Variant[];
  if (!Array.isArray(variants) || variants.length === 0) {
    return NextResponse.json({ error: "This run has nothing to explain yet." }, { status: 400 });
  }

  let referenceName: string | undefined;
  if (run.referenceSmId) {
    const ref = await prisma.diagram.findFirst({ where: { id: run.referenceSmId, projectId: id }, select: { name: true } });
    referenceName = ref?.name ?? undefined;
  }

  const base = {
    runName: run.name,
    stats: (run.stats ?? {}) as unknown as MiningStats,
    variants,
    conformance: (run.conformance ?? null) as unknown as ConformanceResult | null,
    performance: (run.performance ?? null) as unknown as Performance | null,
    hasBpmn: !!run.discoveredBpmnId,
    hasStateMachine: !!run.discoveredSmId,
    hasTwin: !!run.studyId,
    referenceName,
  };

  // Branch: AI narrates only when the org allows AI AND a key is configured.
  // Otherwise fall back to the deterministic templated summary (ENT-05) — a 200,
  // not a 403 — so strict/AI-off tenants still get a Results summary.
  const model = await getAiGenerateModel();
  const apiKey = aiApiKey(model);
  const aiOn = (await orgPolicyAllows(session, "allowAi")) && !!apiKey;
  if (!aiOn) {
    return NextResponse.json({ explanation: summariseMiningResults(base), deterministic: true });
  }

  const userId = session?.user?.id;
  if (userId) { const block = await gateLimit(userId, "aiAttempts"); if (block) return block; }

  // ENT-06: when the org opts in, pseudonymise identifiable names (resource names +
  // the run/reference names) before the prompt egresses. Activity/state labels are
  // process vocabulary and left intact so the explanation stays meaningful.
  const perf = base.performance;
  const resourceNames = perf
    ? [...Object.keys(perf.resourceConcurrency ?? {}), ...Object.values(perf.activityResource ?? {})]
    : [];
  const redactor = (await orgRedactionEnabled(session))
    ? makeRedactor([base.runName, base.referenceName, ...resourceNames])
    : undefined;

  try {
    const explanation = await explainMiningResults({ apiKey: apiKey!, model, ...base }, redactor);
    if (userId) await recordUsage(userId, "aiAttempts");
    return NextResponse.json({ explanation });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Explain failed: ${msg}` }, { status: 502 });
  }
}
