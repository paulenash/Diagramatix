/**
 * POST /api/ai/staff-narrative
 *
 * Takes a structured Technical Description (the same prose the
 * deterministic `buildPromptFromDiagram` walker produces) and asks
 * Sonnet to rewrite it as a Staff Narrative under the editable briefing
 * stored in DiagramRules (category="staff-narrative").
 *
 * Auth + quota mirror the BPMN plan route. Records one aiAttempts unit
 * per successful run.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { gateOrgPolicy, orgRedactionEnabled } from "@/app/lib/auth/orgPolicy";
import { makeRedactor } from "@/app/lib/ai/redaction";
import { getAiGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { aiApiKey } from "@/app/lib/ai/anthropicClient";
import { enterAiRouteContext } from "@/app/lib/ai/aiTelemetryRoute";
import { AI_INVOCATION_POINTS } from "@/app/lib/ai/aiTelemetry";
import { prisma } from "@/app/lib/db";
import {
  generateStaffNarrative,
  DEFAULT_STAFF_NARRATIVE_BRIEFING,
  buildStaffNarrativeBriefing,
} from "@/app/lib/ai/staffNarrative";
import { gateLimit, recordUsage } from "@/app/lib/subscription-route";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const _pol = await gateOrgPolicy(session, "allowAi");
  if (_pol) return _pol;
  await enterAiRouteContext(session, AI_INVOCATION_POINTS.StaffNarrative);
  const model = await getAiGenerateModel();
  const apiKey = aiApiKey(model);
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI not configured for the selected model. Set ANTHROPIC_API_KEY or MOONSHOT_API_KEY." },
      { status: 503 },
    );
  }
  const { technicalDescription, entityHints } = await req.json();
  if (typeof technicalDescription !== "string" || !technicalDescription.trim()) {
    return NextResponse.json({ error: "technicalDescription is required" }, { status: 400 });
  }

  // Subscription cap — staff narratives count against the same
  // aiAttempts bucket as Plan calls.
  const aiBlock = await gateLimit(session.user.id, "aiAttempts");
  if (aiBlock) return aiBlock;

  // Assemble the briefing: the built-in default (managed in code) PLUS any
  // additional house-style rules the admin saved in the staff-narrative row.
  // The row stores only the additions now; a legacy row that still holds the
  // whole briefing is used verbatim (buildStaffNarrativeBriefing handles both).
  // No seeding — the row is created only when an admin saves additional rules.
  let briefing = DEFAULT_STAFF_NARRATIVE_BRIEFING;
  try {
    const dr = await prisma.diagramRules.findFirst({
      where: { category: "staff-narrative", isDefault: true },
      select: { rules: true },
    });
    briefing = buildStaffNarrativeBriefing(dr?.rules);
  } catch { /* proceed with hard-coded default */ }

  // ENT-06: when the org opts in, pseudonymise the named people/teams/systems
  // (sent by the client as entityHints — the pool/lane/participant/system labels)
  // before the description egresses, and restore them in the narrative.
  const redactor = (await orgRedactionEnabled(session)) && Array.isArray(entityHints)
    ? makeRedactor(entityHints as (string | null | undefined)[])
    : undefined;

  const result = await generateStaffNarrative({
    apiKey,
    technicalDescription,
    briefing,
  }, redactor);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  await recordUsage(session.user.id, "aiAttempts");
  return NextResponse.json({ narrative: result.narrative, model: result.model });
}
