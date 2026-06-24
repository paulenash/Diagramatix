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
import { auth } from "@/auth";

const MODEL = "claude-sonnet-4-6";

const SYSTEM = `You clean up a transcript of a SPOKEN discussion about a business process so it can be turned into a diagram. Rewrite it as a clear, concise, ORDERED description of the process: who does what, in what sequence, the decisions and their branches, and any systems / data involved. Use the speaker labels to attribute steps to roles. Remove filler, repetition, tangents and small talk. Do NOT invent steps, roles or branches that were not discussed. Output ONLY JSON: {"description": string, "openQuestions": string[]} — openQuestions lists anything ambiguous, contradictory or missing that a modeller should clarify (empty array if none). No markdown, no commentary.`;

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
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: MODEL,
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
