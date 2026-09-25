/**
 * POST /api/ai/speak — say something, in a Deepgram Aura-2 voice.
 *
 *   Body:     { text, voice, purpose }
 *   Returns:  audio/mpeg, streamed through as Deepgram sends it.
 *
 * Refuses, in this order: 401 signed out · 403 a SuperAdmin viewing another
 * user read-only (speech spends money and writes a usage row, and view mode
 * exists so that nothing does) · 403 the org has turned voice off · 403 speech
 * not granted to this user (`speechAccess.ts` — fails CLOSED) · 400 bad body ·
 * 413 over Deepgram's per-request cap · 503 not configured.
 *
 * Every call that reaches Deepgram writes one `AiInvocation` row, failures too,
 * so a run of errors shows up in AI Usage rather than only in a log:
 *   provider "deepgram" (the same account and invoice as dictation),
 *   model = the voice (on /v1/speak the voice IS the model),
 *   invocationPoint "voice.reply",
 *   inputTokens = CHARACTERS — priced per million by the Aura-2 rows in
 *     pricing.ts, which is how the report costs speech with no special case,
 *   latencyMs = until Deepgram's first byte — the delay a listener waits through.
 */

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { gateOrgPolicy, orgPolicyAllows } from "@/app/lib/auth/orgPolicy";
import { blockReadOnlyImpersonation } from "@/app/lib/routeGuard";
import { speechGranted } from "@/app/lib/voice/speechAccess";
import { speakParams, isValidTtsVoice, isSpeechPurpose, TTS_MAX_CHARS } from "@/app/lib/voice/speakParams";
import { recordAiInvocation, enterAiContext, AI_INVOCATION_POINTS } from "@/app/lib/ai/aiTelemetry";
import { resolveAiRouteContext } from "@/app/lib/ai/aiTelemetryRoute";

/**
 * GET /api/ai/speak → `{ available }` — may this user hear Diagramatix speak?
 *
 * Asked once by a surface before it draws a speech control, so a user without
 * the grant never sees a Narrate switch that could only ever answer 403. The
 * same two checks as POST, and nothing is spent. Read-only impersonation is not
 * refused here — a SuperAdmin viewing as somebody should see what they would see.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const available =
    Boolean(process.env.DEEPGRAM_API_KEY) &&
    (await orgPolicyAllows(session, "allowVoiceAi")) &&
    (await speechGranted(session));
  return NextResponse.json({ available }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const readOnly = await blockReadOnlyImpersonation(session);
  if (readOnly) return readOnly;

  const pol = await gateOrgPolicy(session, "allowVoiceAi");
  if (pol) return pol;

  if (!(await speechGranted(session))) {
    return NextResponse.json(
      { error: "Spoken replies are not turned on for you — a SuperAdmin can turn them on." },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { text?: unknown; voice?: unknown; purpose?: unknown };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });
  if (!isValidTtsVoice(body.voice)) return NextResponse.json({ error: "voice is not one Diagramatix offers" }, { status: 400 });
  if (!isSpeechPurpose(body.purpose)) return NextResponse.json({ error: "purpose is invalid" }, { status: 400 });
  if (text.length > TTS_MAX_CHARS) {
    return NextResponse.json({ error: `text is over ${TTS_MAX_CHARS} characters — split it by sentence` }, { status: 413 });
  }
  const voice = body.voice;

  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return NextResponse.json({ error: "Speech is not configured on this server." }, { status: 503 });

  // Entered on this frame, not inside a helper — see aiTelemetryRoute.ts for the
  // bug that taught that: an enterWith inside an awaited helper does not survive.
  enterAiContext(await resolveAiRouteContext(session, AI_INVOCATION_POINTS.VoiceReply));

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(`https://api.deepgram.com/v1/speak?${speakParams(voice).toString()}`, {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    await recordAiInvocation({
      provider: "deepgram", model: voice, status: "failure",
      inputTokens: text.length, errorCode: err instanceof Error ? err.name : "network",
      latencyMs: Date.now() - started,
    });
    return NextResponse.json({ error: "The voice service could not be reached." }, { status: 503 });
  }

  const latencyMs = Date.now() - started;
  if (!res.ok || !res.body) {
    console.error("[POST /api/ai/speak] Deepgram", res.status, await res.text().catch(() => ""));
    await recordAiInvocation({
      provider: "deepgram", model: voice, status: "failure",
      inputTokens: text.length, errorCode: String(res.status), latencyMs,
    });
    return NextResponse.json({ error: "The voice service refused the request." }, { status: 503 });
  }

  await recordAiInvocation({
    provider: "deepgram", model: voice, status: "success",
    inputTokens: text.length, latencyMs,
  });

  return new NextResponse(res.body, {
    status: 200,
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
