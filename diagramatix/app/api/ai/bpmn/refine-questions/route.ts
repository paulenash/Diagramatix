/**
 * "Refine" — generate clarifying questions for a BPMN prompt.
 *
 * Reads the current prompt (which may already carry a CLARIFICATIONS block) and
 * returns the highest-impact multiple-choice questions about missing BPMN
 * information. Metered like generation (counts against the user's AI attempts)
 * and uses the SuperAdmin-set model. Returns questions only — no diagram work.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { gateOrgPolicy } from "@/app/lib/auth/orgPolicy";
import { prisma } from "@/app/lib/db";
import { refineQuestions } from "@/app/lib/ai/refineQuestions";
import { getAiGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { aiApiKey } from "@/app/lib/ai/anthropicClient";
import { enterAiRouteContext } from "@/app/lib/ai/aiTelemetryRoute";
import { AI_INVOCATION_POINTS } from "@/app/lib/ai/aiTelemetry";
import { splitRulesByEnforcement } from "@/app/lib/ai/splitRules";
import { groundRulesWithPcf } from "@/app/lib/pcf/promptGrounding";
import { gateLimit, recordUsage } from "@/app/lib/subscription-route";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const _pol = await gateOrgPolicy(session, "allowAi");
  if (_pol) return _pol;
  await enterAiRouteContext(session, AI_INVOCATION_POINTS.BpmnRefine);

  const model = await getAiGenerateModel();
  const apiKey = aiApiKey(model);
  if (!apiKey) {
    return NextResponse.json({ error: "AI not configured for the selected model. Set ANTHROPIC_API_KEY or MOONSHOT_API_KEY." }, { status: 503 });
  }

  const { prompt, pcfNodeId } = await req.json();
  if (!prompt?.trim()) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  // Metered like generation: check the AI-attempts cap BEFORE the model call.
  const aiBlock = await gateLimit(session.user.id, "aiAttempts");
  if (aiBlock) return aiBlock;

  // Same GREEN (AI-enforceable) rules + PCF grounding the Plan step uses, so
  // Refine's questions stay coherent with how Plan will interpret the prompt.
  let fullRules = "";
  try {
    for (const category of ["general", "bpmn"]) {
      const dr = await prisma.diagramRules.findFirst({
        where: { category, isDefault: true },
        select: { rules: true },
      });
      if (dr?.rules) fullRules += (fullRules ? "\n\n" : "") + dr.rules;
    }
  } catch { /* proceed without rules */ }
  const { aiRules } = splitRulesByEnforcement(fullRules);
  const grounded = await groundRulesWithPcf(prisma, aiRules, pcfNodeId);

  try {
    const result = await refineQuestions({ apiKey, prompt, rules: grounded, model });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, raw: result.raw }, { status: result.status });
    }
    // Record the attempt only on success so failures don't burn quota.
    await recordUsage(session.user.id, "aiAttempts");
    console.log("[AI refine] returned", result.questions.length, "questions");
    return NextResponse.json({ questions: result.questions, model: result.model });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[AI refine] error:", msg);
    return NextResponse.json({ error: `AI refine failed: ${msg}` }, { status: 500 });
  }
}
