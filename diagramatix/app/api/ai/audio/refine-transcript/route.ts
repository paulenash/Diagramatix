/**
 * POST /api/ai/audio/refine-transcript
 *   Body: { transcript: string, diagramType?: string }
 *   Cleans a raw spoken-discussion transcript into a clear, ordered process
 *   description suitable for AI Generate, and lists any open questions the
 *   recording left ambiguous. On any failure it returns the transcript as-is so
 *   the flow never breaks.
 */
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { makeAnthropic } from "@/app/lib/ai/anthropicClient";
import { getAiGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { auth } from "@/auth";

// Model resolved centrally via the admin AI-model setting (was claude-sonnet-4-6).

const SYSTEM = `You clean up a transcript of a SPOKEN discussion about a business process so it can be turned into a diagram. Rewrite it as a clear, concise, ORDERED description of the process: who does what, in what sequence, the decisions and their branches, and any systems / data involved. Remove filler, repetition, tangents and small talk. Do NOT invent steps, roles or branches that were not discussed.

IMPORTANT — anonymise people: replace every individual person's name with their ROLE or job function (e.g. "Kerry" → "Accounts Officer", "Greg said he approves it" → "the Approver approves it"). Speakers and any people mentioned become roles, never personal names. If a person's role is genuinely unknown, infer a sensible functional role from what they do, or use a generic role such as "Officer" / "Reviewer" / "Manager". Personal/given names must NOT appear in role names, pool or lane names, activity / task names, or annotations. Keep organisation, team, system and product names as-is — only individual people's names are anonymised.

Output ONLY JSON: {"description": string, "openQuestions": string[]} — openQuestions lists anything ambiguous, contradictory or missing that a modeller should clarify (empty array if none). No markdown, no commentary.`;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const { transcript, diagramType } = await req.json().catch(() => ({ transcript: "" }));
  if (typeof transcript !== "string" || !transcript.trim()) {
    return NextResponse.json({ error: "transcript is required" }, { status: 400 });
  }
  // No AI configured → hand the transcript straight back (graceful).
  if (!apiKey) {
    return NextResponse.json({ description: transcript, openQuestions: [] });
  }

  try {
    const client = makeAnthropic(apiKey);
    const model = await getAiGenerateModel();
    const resp = await client.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM,
      messages: [{
        role: "user",
        content: `Target notation: ${typeof diagramType === "string" ? diagramType : "BPMN"}.\n\nTRANSCRIPT:\n${transcript}`,
      }],
    });
    const text = resp.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");
    const parsed = extractJson(text);
    const description = typeof parsed?.description === "string" && parsed.description.trim()
      ? parsed.description.trim()
      : transcript;
    const openQuestions = Array.isArray(parsed?.openQuestions)
      ? parsed.openQuestions.filter((q): q is string => typeof q === "string" && q.trim().length > 0)
      : [];
    return NextResponse.json({ description, openQuestions });
  } catch {
    // Never block the flow — fall back to the raw transcript.
    return NextResponse.json({ description: transcript, openQuestions: [] });
  }
}

function extractJson(text: string): { description?: unknown; openQuestions?: unknown } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
