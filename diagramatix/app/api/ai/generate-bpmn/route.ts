import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { gateOrgPolicy } from "@/app/lib/auth/orgPolicy";
import { prisma } from "@/app/lib/db";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { planBpmn } from "@/app/lib/ai/planBpmn";
import { resolveGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { aiApiKey } from "@/app/lib/ai/anthropicClient";
import { splitRulesByEnforcement } from "@/app/lib/ai/splitRules";
import { groundRulesWithPcf } from "@/app/lib/pcf/promptGrounding";
import { gateLimit, gateElementCount, recordUsage } from "@/app/lib/subscription-route";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const _pol = await gateOrgPolicy(session, "allowAi");
  if (_pol) return _pol;

  const { prompt, attachment, pcfNodeId } = await req.json();
  if (!prompt?.trim()) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  // Image input uses the Vision-model override when set; else the main model.
  const model = await resolveGenerateModel(attachment?.type === "image");
  const apiKey = aiApiKey(model);
  if (!apiKey) {
    return NextResponse.json({ error: "AI not configured for the selected model. Set ANTHROPIC_API_KEY or MOONSHOT_API_KEY." }, { status: 503 });
  }

  // Subscription cap: AI attempts. Check before the model call so a
  // doomed request doesn't cost real API tokens.
  const aiBlock = await gateLimit(session.user.id, "aiAttempts");
  if (aiBlock) return aiBlock;

  // Load General + BPMN-specific default rules, then filter to GREEN
  // (AI-enforceable) only. See plan/route.ts for the full reasoning.
  let rules = "";
  try {
    for (const category of ["general", "bpmn"]) {
      const dr = await prisma.diagramRules.findFirst({
        where: { category, isDefault: true },
        select: { rules: true },
      });
      if (dr?.rules) rules += (rules ? "\n\n" : "") + dr.rules;
    }
  } catch { /* proceed without rules */ }

  const { aiRules } = splitRulesByEnforcement(rules);
  const grounded = await groundRulesWithPcf(prisma, aiRules, pcfNodeId);
  console.log("[AI generate-bpmn] full:", rules.length, "chars → green-only:", aiRules.length, "chars", pcfNodeId ? "+ PCF grounding" : "");

  try {
    const result = await planBpmn({ apiKey, prompt, attachment, rules: grounded, model });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, raw: result.raw }, { status: result.status });
    }
    const { plan } = result;
    console.log("[AI] Normalized:", plan.elements.length, "elements,", plan.connections.length, "connections");
    console.log("[AI] Types:", [...new Set(plan.elements.map(e => e.type))].join(", "));

    // Element-count gate on the AI's element list BEFORE layout +
    // counter bump. If we generated too many for the user's tier,
    // return 403 without burning the AI quota.
    const elementBlock = await gateElementCount(
      session.user.id,
      "bpmn",
      { elements: plan.elements },
    );
    if (elementBlock) return elementBlock;

    const diagramData = layoutBpmnDiagram(plan.elements, plan.connections);

    // Record AFTER success so model errors don't burn the user's quota.
    await recordUsage(session.user.id, "aiAttempts");
    return NextResponse.json({
      diagramData,
      elementCount: plan.elements.length,
      connectionCount: plan.connections.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[AI generate-bpmn] error:", msg);
    return NextResponse.json({ error: `AI generation failed: ${msg}` }, { status: 500 });
  }
}
