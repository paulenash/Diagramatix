/**
 * GET /api/admin/ai-plan-format
 *   Superuser-only. Returns the exact system prompt the BPMN planner
 *   sends to the model, with the current green (AI-enforceable) rules
 *   injected — so an admin can see precisely what the AI receives.
 *
 *   Also returns the green-only and layout-only (red, code-backed)
 *   rule slices separately so it's obvious which rules reach the model
 *   and which are enforced by the layout engine instead.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { prisma } from "@/app/lib/db";
import { buildSystemPrompt } from "@/app/lib/ai/planBpmn";
import { splitRulesByEnforcement } from "@/app/lib/ai/splitRules";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Same load order the AI endpoints use: general + bpmn default rules.
  let fullRules = "";
  for (const category of ["general", "bpmn"]) {
    const dr = await prisma.diagramRules.findFirst({
      where: { category, isDefault: true },
      select: { rules: true },
    });
    if (dr?.rules) fullRules += (fullRules ? "\n\n" : "") + dr.rules;
  }

  const { aiRules, layoutRules } = splitRulesByEnforcement(fullRules);
  // The prompt the model actually receives — green rules injected.
  const assembledPrompt = buildSystemPrompt(aiRules);
  // The prompt template alone (no rules) for reference.
  const promptTemplate = buildSystemPrompt("");

  return NextResponse.json({
    assembledPrompt,
    promptTemplate,
    aiRules,
    layoutRules,
    counts: {
      fullRulesChars: fullRules.length,
      aiRulesChars: aiRules.length,
      layoutRulesChars: layoutRules.length,
      assembledPromptChars: assembledPrompt.length,
    },
  });
}
