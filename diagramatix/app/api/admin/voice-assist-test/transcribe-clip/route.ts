/**
 * POST /api/admin/voice-assist-test/transcribe-clip
 *   Body: raw WAV bytes.
 *
 * The BATCH leg of the replay — a cheap fallback to the streaming one.
 *
 * Deliberately separate from `/api/ai/audio/transcribe`, which serves meeting
 * recordings: that one wants speaker diarisation and no command bias, and this
 * one wants the opposite. Both build their parameters from `asrParams`, so they
 * cannot drift on the model or the language while differing on the things they
 * are meant to differ on.
 *
 * What this leg cannot see is printed next to its result in the UI —
 * segmentation, streaming-vs-prerecorded differences, and the command queue.
 * A green number here is not a green live number.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { blockReadOnlyImpersonation } from "@/app/lib/routeGuard";
import { batchParams } from "@/app/lib/dictation/asrParams";
import { boostProfile } from "@/app/lib/dictation/boostProfiles";

export const dynamic = "force-dynamic";

const DG = "https://api.deepgram.com/v1/listen";
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // This writes nothing to our database — it proxies to Deepgram and hands back
  // text. It is guarded anyway, because it SPENDS MONEY at a per-minute rate,
  // and somebody viewing as another user should not be able to run up a bill on
  // a hundred clips. The route ratchet asked the question; this is the answer,
  // and it is cheaper than an exemption with an excuse attached.
  const blocked = await blockReadOnlyImpersonation(session);
  if (blocked) return blocked;

  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return NextResponse.json({ error: "No recogniser is configured." }, { status: 503 });

  const audio = await req.arrayBuffer();
  if (audio.byteLength === 0) return NextResponse.json({ error: "No audio received" }, { status: 400 });
  if (audio.byteLength > MAX_BYTES) return NextResponse.json({ error: "Clip too large." }, { status: 413 });

  // One person, one sentence: command bias ON, diarisation OFF.
  //
  // `?profile=` lets the harness measure an ALTERNATIVE boost list over the
  // recorded corpus. Absent, it is the shipped list — so a plain replay always
  // measures what production runs.
  const profile = boostProfile(new URL(req.url).searchParams.get("profile"));
  const params = batchParams({ commandBias: true, commandWords: profile.keywords });
  try {
    const dg = await fetch(`${DG}?${params.toString()}`, {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": "audio/wav" },
      body: audio,
    });
    if (!dg.ok) {
      const t = await dg.text().catch(() => "");
      return NextResponse.json({ error: `Deepgram ${dg.status}. ${t.slice(0, 160)}` }, { status: 502 });
    }
    const data = await dg.json() as {
      results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
    };
    const transcript = (data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "").trim();
    // No speech is a RESULT, not an error: a silent clip that scores as
    // "misheard" is exactly the finding somebody needs.
    return NextResponse.json({ transcript });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Transcription error" }, { status: 500 });
  }
}
