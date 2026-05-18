import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { planBpmn } from "@/app/lib/ai/planBpmn";
import { splitRulesByEnforcement } from "@/app/lib/ai/splitRules";

// Interim gate (2026-05-18): see /api/ai/bpmn/plan/route.ts for context.
const AI_GENERATE_ALLOWED_EMAIL = "paul@nashcc.com.au";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.email !== AI_GENERATE_ALLOWED_EMAIL) {
    return NextResponse.json(
      { error: "AI Generate is temporarily disabled. Please try again later." },
      { status: 403 }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI service not configured. Set ANTHROPIC_API_KEY in .env" }, { status: 503 });
  }

  const { prompt, attachment } = await req.json();
  if (!prompt?.trim()) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

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
  console.log("[AI generate-bpmn] full:", rules.length, "chars → green-only:", aiRules.length, "chars");

  try {
    const result = await planBpmn({ apiKey, prompt, attachment, rules: aiRules });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, raw: result.raw }, { status: result.status });
    }
    const { plan } = result;
    console.log("[AI] Normalized:", plan.elements.length, "elements,", plan.connections.length, "connections");
    console.log("[AI] Types:", [...new Set(plan.elements.map(e => e.type))].join(", "));

    const diagramData = layoutBpmnDiagram(plan.elements, plan.connections);

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
