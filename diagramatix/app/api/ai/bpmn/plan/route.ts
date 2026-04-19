/**
 * Phase 1 — Plan.
 * Sends the user prompt + ONLY the green (AI-enforceable) rules to Sonnet and
 * returns the normalised JSON plan. No layout engine work happens here.
 * The client can edit the plan and pass it to POST /api/ai/bpmn/apply-layout.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { planBpmn } from "@/app/lib/ai/planBpmn";
import { splitRulesByEnforcement } from "@/app/lib/ai/splitRules";

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

  // Load General + BPMN default rules, then keep only the AI-enforceable slice.
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

  console.log("[AI plan] rules: full", fullRules.length, "chars → ai-only", aiRules.length, "chars");

  try {
    const result = await planBpmn({ apiKey, prompt, attachment, rules: aiRules });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, raw: result.raw }, { status: result.status });
    }
    const { plan, model } = result;
    console.log("[AI plan] returned:", plan.elements.length, "elements,", plan.connections.length, "connections");
    return NextResponse.json({
      plan,
      model,
      elementCount: plan.elements.length,
      connectionCount: plan.connections.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[AI plan] error:", msg);
    return NextResponse.json({ error: `AI planning failed: ${msg}` }, { status: 500 });
  }
}
