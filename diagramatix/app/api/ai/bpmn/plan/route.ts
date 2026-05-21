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
import { gateLimit, recordUsage } from "@/app/lib/subscription-route";

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

  // Subscription cap: AI attempts. Free is lifetime (5 total); paid
  // tiers are monthly. Check BEFORE the model call so we don't burn an
  // API request that's about to be rejected anyway.
  const aiBlock = await gateLimit(session.user.id, "aiAttempts");
  if (aiBlock) return aiBlock;

  // Load General + BPMN default rules, then filter to GREEN (AI-enforceable)
  // only. Code-backed layout rules, proposed (orange) and modified (amber)
  // rules are dropped — the model can't enforce them and they bloat the
  // system prompt, which has been provoking JSON-preamble regressions on
  // Sonnet 4.6. Any semantic rule that you still want sent must live in a
  // non-code-backed group (i.e. NOT under headings matching layout /
  // positioning / placement / spacing / sizing / arrangement / connector
  // routing — see CODE_REQUIRED_GROUPS in splitRules.ts).
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
  console.log("[AI plan] full:", fullRules.length, "chars → green-only:", aiRules.length, "chars");

  try {
    const result = await planBpmn({ apiKey, prompt, attachment, rules: aiRules });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, raw: result.raw }, { status: result.status });
    }
    const { plan, model } = result;
    console.log("[AI plan] returned:", plan.elements.length, "elements,", plan.connections.length, "connections");
    // Record AFTER success so failed attempts don't burn the user's quota.
    await recordUsage(session.user.id, "aiAttempts");
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
