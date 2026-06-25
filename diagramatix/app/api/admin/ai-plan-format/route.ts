/**
 * GET /api/admin/ai-plan-format?type=<diagram-type>
 *   Superuser-only. Returns the exact system prompt that AI Generate
 *   sends to the model for the given diagram type, with the current
 *   green (AI-enforceable) rules injected — so an admin can see
 *   precisely what the AI receives.
 *
 *   `type` defaults to `bpmn` for backward compatibility. BPMN uses the
 *   dedicated two-phase planner in `planBpmn.ts`; every other type
 *   uses the shared generic prompt builder in `generateDiagramPrompt.ts`.
 *
 *   Also returns the green-only and layout-only (red, code-backed)
 *   rule slices separately so it's obvious which rules reach the model
 *   and which are enforced by the layout engine instead.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { prisma } from "@/app/lib/db";
import { buildSystemPrompt as buildBpmnSystemPrompt } from "@/app/lib/ai/planBpmn";
import { buildFlowchartSystemPrompt } from "@/app/lib/ai/planFlowchart";
import {
  buildGenericSystemPrompt,
  DIAGRAM_PROMPTS,
} from "@/app/lib/ai/generateDiagramPrompt";
import { splitRulesByEnforcement } from "@/app/lib/ai/splitRules";

// BPMN and Flowchart use their own dedicated two-phase planners (planBpmn /
// planFlowchart); every other type uses the shared generic prompt builder.
const SUPPORTED_TYPES = ["bpmn", "flowchart", ...Object.keys(DIAGRAM_PROMPTS)] as const;
type SupportedType = (typeof SUPPORTED_TYPES)[number];

function isSupported(t: string | null): t is SupportedType {
  return !!t && (SUPPORTED_TYPES as readonly string[]).includes(t);
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const requested = url.searchParams.get("type");
  const diagramType: SupportedType = isSupported(requested) ? requested : "bpmn";

  // Same load order the AI endpoints use: general + diagram-specific.
  let fullRules = "";
  for (const category of ["general", diagramType]) {
    const dr = await prisma.diagramRules.findFirst({
      where: { category, isDefault: true },
      select: { rules: true },
    });
    if (dr?.rules) fullRules += (fullRules ? "\n\n" : "") + dr.rules;
  }

  const { aiRules, layoutRules } = splitRulesByEnforcement(fullRules);
  const buildFor = (rulesArg: string) =>
    diagramType === "bpmn" ? buildBpmnSystemPrompt(rulesArg)
    : diagramType === "flowchart" ? buildFlowchartSystemPrompt(rulesArg)
    : buildGenericSystemPrompt(diagramType, rulesArg);
  const assembledPrompt = buildFor(aiRules);
  const promptTemplate = buildFor("");

  return NextResponse.json({
    diagramType,
    supportedTypes: SUPPORTED_TYPES,
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
