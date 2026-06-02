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
import { prisma } from "@/app/lib/db";
import {
  generateStaffNarrative,
  DEFAULT_STAFF_NARRATIVE_BRIEFING,
} from "@/app/lib/ai/staffNarrative";
import { gateLimit, recordUsage } from "@/app/lib/subscription-route";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI service not configured. Set ANTHROPIC_API_KEY in .env" },
      { status: 503 },
    );
  }
  const { technicalDescription } = await req.json();
  if (typeof technicalDescription !== "string" || !technicalDescription.trim()) {
    return NextResponse.json({ error: "technicalDescription is required" }, { status: 400 });
  }

  // Subscription cap — staff narratives count against the same
  // aiAttempts bucket as Plan calls.
  const aiBlock = await gateLimit(session.user.id, "aiAttempts");
  if (aiBlock) return aiBlock;

  // Load + idempotently seed the briefing. If the row doesn't yet
  // exist (first install), insert the default so admins see editable
  // text the first time they open /dashboard/rules → Staff Narrative.
  let briefing = DEFAULT_STAFF_NARRATIVE_BRIEFING;
  try {
    const dr = await prisma.diagramRules.findFirst({
      where: { category: "staff-narrative", isDefault: true },
      select: { rules: true },
    });
    if (dr?.rules?.trim()) {
      briefing = dr.rules;
    } else {
      await prisma.diagramRules
        .create({
          data: {
            category: "staff-narrative",
            rules: DEFAULT_STAFF_NARRATIVE_BRIEFING,
            isDefault: true,
          },
        })
        .catch(() => { /* race-safe: another request may have seeded first */ });
    }
  } catch { /* proceed with hard-coded default */ }

  const result = await generateStaffNarrative({
    apiKey,
    technicalDescription,
    briefing,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  await recordUsage(session.user.id, "aiAttempts");
  return NextResponse.json({ narrative: result.narrative, model: result.model });
}
