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
import { gateOrgPolicy } from "@/app/lib/auth/orgPolicy";
import { gateLimit, recordUsage } from "@/app/lib/subscription-route";
import { getAiGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { explainMiningResults } from "@/app/lib/mining/explainResults";
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
  const _pol = await gateOrgPolicy(session, "allowAi");
  if (_pol) return _pol;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI not configured. Set ANTHROPIC_API_KEY." }, { status: 503 });

  const run = await prisma.processMiningRun.findFirst({ where: { id: runId, projectId: id } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const variants = (run.variants ?? []) as unknown as Variant[];
  if (!Array.isArray(variants) || variants.length === 0) {
    return NextResponse.json({ error: "This run has nothing to explain yet." }, { status: 400 });
  }

  const userId = session?.user?.id;
  if (userId) { const block = await gateLimit(userId, "aiAttempts"); if (block) return block; }

  let referenceName: string | undefined;
  if (run.referenceSmId) {
    const ref = await prisma.diagram.findFirst({ where: { id: run.referenceSmId, projectId: id }, select: { name: true } });
    referenceName = ref?.name ?? undefined;
  }

  try {
    const explanation = await explainMiningResults({
      apiKey,
      model: await getAiGenerateModel(),
      runName: run.name,
      stats: (run.stats ?? {}) as unknown as MiningStats,
      variants,
      conformance: (run.conformance ?? null) as unknown as ConformanceResult | null,
      performance: (run.performance ?? null) as unknown as Performance | null,
      hasBpmn: !!run.discoveredBpmnId,
      hasStateMachine: !!run.discoveredSmId,
      hasTwin: !!run.studyId,
      referenceName,
    });
    if (userId) await recordUsage(userId, "aiAttempts");
    return NextResponse.json({ explanation });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Explain failed: ${msg}` }, { status: 502 });
  }
}
