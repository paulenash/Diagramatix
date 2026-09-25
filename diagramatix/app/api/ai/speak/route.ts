/**
 * Text-to-speech via Deepgram Aura-2.
 *
 * POST /api/ai/speak
 * Body: { text: string, voice: TtsVoice, purpose: "question" | "refusal" | "success" }
 * Response: audio/mpeg stream
 *
 * Gated by:
 * - Org policy allowVoiceAi (like STT dictation)
 * - User feature overrides (voice-feedback off at all levels, SuperAdmin grants per user)
 * - 2,000 character limit per request (enforced)
 *
 * Usage recorded via aiInvocation (provider: "deepgram-tts", characters).
 */

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";
import { cookies } from "next/headers";
import { orgPolicyAllows } from "@/app/lib/auth/orgPolicy";
import { getFeatureStates, isAvailable } from "@/app/lib/features/availability";
import { speakParams, isValidTtsVoice } from "@/app/lib/voice/speakParams";
import { recordAiInvocation, enterAiContext, AI_INVOCATION_POINTS } from "@/app/lib/ai/aiTelemetry";

const MAX_CHARS = 2000;

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cookieStore = await cookies();
    const orgId = await tryGetCurrentOrgId(session, cookieStore);
    if (!orgId) {
      return NextResponse.json({ error: "No active org" }, { status: 400 });
    }

    // Check org policy.
    const policyOk = await orgPolicyAllows(session, "allowVoiceAi");
    if (!policyOk) {
      return NextResponse.json(
        { error: "Voice transcription is turned off by your organisation's policy." },
        { status: 403 }
      );
    }

    // Check user feature access (voice-feedback, off at all levels, SuperAdmin grants per user).
    const states = await getFeatureStates(session.user.id);
    if (!isAvailable(states, "voice-feedback")) {
      return NextResponse.json({ error: "Voice replies are not available to you." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { text, voice, purpose } = body as { text?: unknown; voice?: unknown; purpose?: string };

    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    if (!isValidTtsVoice(voice)) {
      return NextResponse.json({ error: "voice is invalid" }, { status: 400 });
    }

    if (text.length > MAX_CHARS) {
      return NextResponse.json(
        { error: `Text exceeds ${MAX_CHARS} characters` },
        { status: 413 }
      );
    }

    if (!["question", "refusal", "success"].includes(purpose ?? "")) {
      return NextResponse.json({ error: "purpose is invalid" }, { status: 400 });
    }

    // Deepgram request.
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) {
      return NextResponse.json({ error: "TTS not configured" }, { status: 503 });
    }

    const params = speakParams(voice);
    const res = await fetch(`https://api.deepgram.com/v1/speak?${params.toString()}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      console.error("Deepgram error:", res.status, await res.text().catch(() => ""));
      return NextResponse.json({ error: "TTS service error" }, { status: 503 });
    }

    // Record usage via the standard invocation path.
    const chars = text.length;
    enterAiContext({
      userId: session.user.id,
      orgId,
      invocationPoint: AI_INVOCATION_POINTS.VoiceReply,
    });
    await recordAiInvocation({
      provider: "deepgram-tts",
      model: voice,
      status: "success",
      inputTokens: chars, // Use inputTokens to store character count for billing
    });

    const audio = await res.arrayBuffer();
    return new NextResponse(audio, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (err) {
    console.error("POST /api/ai/speak error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
