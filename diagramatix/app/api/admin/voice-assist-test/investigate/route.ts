/**
 * POST /api/admin/voice-assist-test/investigate
 *
 * Explain ONE failed case from the Voice Assist corpus.
 *
 * Per-row and on demand, deliberately (Paul, 2026-09-24 chose "classify, then
 * offer one-click investigate"). A 600-case run with forty failures would be
 * forty AI calls every time it ran; the classification is free and
 * deterministic, and the tokens are spent only on the row somebody is actually
 * looking at.
 *
 * Runs on the COMMAND model, not the generate model: this is the same kind of
 * small, cheap reasoning task the AI fallback does, and it should cost the same.
 */
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { blockReadOnlyImpersonation } from "@/app/lib/routeGuard";
import { makeAiClient, aiApiKey } from "@/app/lib/ai/anthropicClient";
import { getAiCommandModel } from "@/app/lib/ai/aiModelSetting";
import { resolveAiRouteContext } from "@/app/lib/ai/aiTelemetryRoute";
import { AI_INVOCATION_POINTS, enterAiContext } from "@/app/lib/ai/aiTelemetry";

export const dynamic = "force-dynamic";

const SYSTEM = `You are debugging a deterministic voice-command grammar for a BPMN editor.

You are given ONE test case: the sentence, the ops it was expected to produce, the ops the grammar actually produced (or null if it refused), and a four-way classification of which layer failed — misheard (speech recognition), unparsed / misparsed (the grammar), wrong-element (reference resolution).

Say, in at most six short sentences:
1. WHICH SIDE IS WRONG — the grammar, or the test's expectation. A generated sentence is sometimes one no person would say; say so plainly if that is the case.
2. The precise cause, naming the words in the sentence that did it.
3. The smallest fix, and where it belongs (the grammar, the reference resolver, or the generator's phrasing).

Be concrete and brief. No preamble, no restating the input, no markdown headings.`;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await blockReadOnlyImpersonation(session);
  if (blocked) return blocked;

  const body = await req.json().catch(() => null) as {
    utterance?: string; heard?: string; outcome?: string;
    expected?: unknown; actual?: unknown; detail?: string;
  } | null;
  if (!body?.utterance || !body.outcome) {
    return NextResponse.json({ error: "utterance and outcome are required" }, { status: 400 });
  }

  enterAiContext(await resolveAiRouteContext(session, AI_INVOCATION_POINTS.LiveCommand));
  const model = await getAiCommandModel();
  const apiKey = aiApiKey(model);
  // No key configured is a state, not an error: the classification is still on
  // screen and still useful, so say what is missing rather than failing.
  if (!apiKey) {
    return NextResponse.json({ explanation: "No AI key is configured, so this failure cannot be investigated automatically. The classification above still stands." });
  }

  try {
    const client = makeAiClient(model, apiKey);
    const resp = await client.messages.create({
      model,
      max_tokens: 700,
      system: SYSTEM,
      messages: [{
        role: "user",
        content: [
          `SENTENCE: ${body.utterance}`,
          body.heard && body.heard !== body.utterance ? `RECOGNISER HEARD: ${body.heard}` : null,
          `CLASSIFIED AS: ${body.outcome}`,
          body.detail ? `DETAIL: ${body.detail}` : null,
          `EXPECTED OPS: ${JSON.stringify(body.expected ?? null)}`,
          `ACTUAL OPS: ${JSON.stringify(body.actual ?? null)}`,
        ].filter(Boolean).join("\n"),
      }],
    });
    const explanation = resp.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text).join("").trim();
    return NextResponse.json({ explanation: explanation || "The model returned nothing." });
  } catch (err) {
    return NextResponse.json(
      { explanation: `Could not investigate: ${err instanceof Error ? err.message : "unknown error"}` },
    );
  }
}
