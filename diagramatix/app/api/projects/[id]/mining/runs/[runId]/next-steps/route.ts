/**
 * POST — narrate the computed recommendations for a mining run.
 *
 * THE POINT OF THIS ROUTE IS WHAT IT DOES NOT SEND. `findActions` runs first,
 * deterministically, on the server; the model is handed ONLY the ranked findings
 * as text — no analytics, no variants, no case index. It cannot reorder them,
 * cannot add one, and cannot reach past them to invent a different reading of
 * the data, because it never sees the data.
 *
 * That is not caution for its own sake. The Miner is algorithmic by design, and
 * that is exactly what makes a conformance number safe to put in front of an
 * auditor. A recommendation whose ranking came from a language model would put
 * the whole tool back in the category of things you have to check.
 *
 * The findings are returned alongside the prose, so the caller shows the
 * computed list whether or not the narration succeeds — and so a reader can
 * always see what the prose was written from.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { gateFeature, gateLimit, recordUsage } from "@/app/lib/subscription-route";
import { orgPolicyAllows } from "@/app/lib/auth/orgPolicy";
import { getAiGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { aiApiKey, makeAiClient, cappedMaxTokens } from "@/app/lib/ai/anthropicClient";
import { enterAiContext, AI_INVOCATION_POINTS } from "@/app/lib/ai/aiTelemetry";
import { findActions, narrationFacts } from "@/app/lib/mining/nextSteps";
import type { RunAnalytics } from "@/app/lib/mining/analytics";
import type { ConformanceResult } from "@/app/lib/mining/transitionConformance";
import type { Variant } from "@/app/lib/mining/types";
import type { KpiConfig } from "@/app/lib/mining/outcomes";

type Params = { params: Promise<{ id: string; runId: string }> };

const SYSTEM =
  "You are a process analyst briefing a business owner on what to do next. You are given a RANKED list of findings that were computed from an event log. "
  + "Rewrite them as short, plain English — one short paragraph, then one '- ' bullet per finding IN THE ORDER GIVEN. "
  + "Do not reorder them. Do not add findings, numbers, causes or recommendations that are not in the list. Do not drop the numbers that are there. "
  + "If a 'Not assessed' section is present, close with one sentence naming what could not be assessed. Plain text only — no headings, no bold, no markdown tables.";

export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id, runId } = await params;
  let orgId: string | null = null;
  try {
    const ctx = await requireProjectAccess(session, await cookies(), id, "view");
    orgId = ctx.projectOrgId ?? null;
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const fg = await gateFeature(session?.user?.id ?? "", "processMining");
  if (fg) return fg;

  const run = await prisma.processMiningRun.findFirst({ where: { id: runId, projectId: id } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Computed first, always — the same pure function the console runs.
  const result = findActions({
    analytics: (run.analytics ?? null) as unknown as RunAnalytics | null,
    variants: (run.variants ?? []) as unknown as Variant[],
    conformance: (run.conformance ?? null) as unknown as ConformanceResult | null,
    kpiConfig: (run.kpiConfig ?? null) as unknown as KpiConfig | null,
    hasTwin: !!run.studyId,
  });

  if (result.nothingStandsOut) {
    // Nothing to narrate, and nothing worth spending a model call to say.
    return NextResponse.json({ ...result, narration: null, deterministic: true });
  }

  const model = await getAiGenerateModel();
  const apiKey = aiApiKey(model);
  const aiOn = (await orgPolicyAllows(session, "allowAi")) && !!apiKey;
  if (!aiOn) return NextResponse.json({ ...result, narration: null, deterministic: true });

  const userId = session?.user?.id;
  if (userId) { const block = await gateLimit(userId, "aiAttempts"); if (block) return block; }
  enterAiContext({ userId, orgId, invocationPoint: AI_INVOCATION_POINTS.MiningExplain });

  try {
    const client = makeAiClient(model, apiKey);
    const message = await client.messages.create({
      model,
      max_tokens: cappedMaxTokens(model, 700),
      system: SYSTEM,
      // The ONLY thing that egresses: the findings, already ranked.
      messages: [{ role: "user", content: narrationFacts(result) }],
    });
    const block = message.content.find((b) => b.type === "text");
    const narration = block && block.type === "text" ? block.text.trim() : null;
    if (userId) await recordUsage(userId, "aiAttempts");
    return NextResponse.json({ ...result, narration });
  } catch (err) {
    // The computed findings are the product; the prose is a garnish. Never leave
    // the caller with nothing because a model was unreachable.
    return NextResponse.json({ ...result, narration: null, deterministic: true, aiError: err instanceof Error ? err.message : String(err) });
  }
}
