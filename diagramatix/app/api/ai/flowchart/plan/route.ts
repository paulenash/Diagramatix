/**
 * Phase 1 — Plan (Standard Flowchart).
 * Sends the user prompt + ONLY the green (AI-enforceable) rules to Sonnet and
 * returns the normalised JSON plan. No layout work happens here — the client
 * can edit the plan and pass it to POST /api/ai/flowchart/apply-layout.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { planFlowchart } from "@/app/lib/ai/planFlowchart";
import { getAiGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { splitRulesByEnforcement } from "@/app/lib/ai/splitRules";
import { gateLimit, gateElementCount, recordUsage } from "@/app/lib/subscription-route";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI service not configured. Set ANTHROPIC_API_KEY in .env" }, { status: 503 });
  }

  const { prompt, attachment } = await req.json();
  if (!prompt?.trim()) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const aiBlock = await gateLimit(session.user.id, "aiAttempts");
  if (aiBlock) return aiBlock;

  // General + Flowchart default rules, filtered to GREEN (AI-enforceable) only.
  let fullRules = "";
  try {
    for (const category of ["general", "flowchart"]) {
      const dr = await prisma.diagramRules.findFirst({
        where: { category, isDefault: true },
        select: { rules: true },
      });
      if (dr?.rules) fullRules += (fullRules ? "\n\n" : "") + dr.rules;
    }
  } catch { /* proceed without rules */ }

  const { aiRules } = splitRulesByEnforcement(fullRules);
  console.log("[AI flowchart plan] full:", fullRules.length, "chars → green-only:", aiRules.length, "chars");

  try {
    const result = await planFlowchart({ apiKey, prompt, attachment, rules: aiRules, model: await getAiGenerateModel() });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, raw: result.raw }, { status: result.status });
    }
    const { plan, model } = result;
    console.log("[AI flowchart plan] returned:", plan.elements.length, "elements,", plan.connections.length, "connections");
    const elementBlock = await gateElementCount(session.user.id, "flowchart", { elements: plan.elements });
    if (elementBlock) return elementBlock;
    await recordUsage(session.user.id, "aiAttempts");
    return NextResponse.json({
      plan,
      model,
      elementCount: plan.elements.length,
      connectionCount: plan.connections.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[AI flowchart plan] error:", msg);
    return NextResponse.json({ error: `AI planning failed: ${msg}` }, { status: 500 });
  }
}
