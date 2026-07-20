/**
 * POST /api/ai/audio/transcribe
 *   Body: raw audio bytes (Content-Type = the audio mime, e.g. audio/webm).
 *   Transcribes a recording via Deepgram's pre-recorded API with speaker
 *   diarization, returning speaker-labelled plain text the user can feed into
 *   AI Generate. Requires DEEPGRAM_API_KEY (server-side only).
 *
 *   (Microsoft Teams .vtt transcripts are parsed client-side instead — they
 *   already contain the text + speaker names, so they never hit this route.)
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { gateOrgPolicy } from "@/app/lib/auth/orgPolicy";

const DG = "https://api.deepgram.com/v1/listen";
const MAX_BYTES = 40 * 1024 * 1024; // 40 MB

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const _pol = await gateOrgPolicy(session, "allowVoiceAi");
  if (_pol) return _pol;
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Audio transcription not configured" }, { status: 503 });
  }

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_BYTES) {
    return NextResponse.json({ error: "Audio too large (max 40 MB). Trim the clip or upload a Teams .vtt instead." }, { status: 413 });
  }
  const contentType = req.headers.get("content-type") || "audio/webm";

  const audio = await req.arrayBuffer();
  if (audio.byteLength === 0) {
    return NextResponse.json({ error: "No audio received" }, { status: 400 });
  }
  if (audio.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Audio too large (max 40 MB)." }, { status: 413 });
  }

  const params = new URLSearchParams({
    model: "nova-2",
    smart_format: "true",
    punctuate: "true",
    diarize: "true",
    utterances: "true",
  });
  try {
    const dg = await fetch(`${DG}?${params.toString()}`, {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": contentType },
      body: audio,
    });
    if (!dg.ok) {
      const t = await dg.text().catch(() => "");
      return NextResponse.json({ error: `Transcription failed (Deepgram ${dg.status}). ${t.slice(0, 160)}` }, { status: 502 });
    }
    const data = await dg.json();
    const transcript = formatTranscript(data);
    if (!transcript) {
      return NextResponse.json({ error: "No speech detected in the recording." }, { status: 422 });
    }
    return NextResponse.json({ transcript });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Transcription error" }, { status: 500 });
  }
}

/** Build speaker-labelled text, merging consecutive utterances from one speaker. */
function formatTranscript(data: unknown): string {
  const d = data as { results?: { utterances?: { speaker?: number; transcript?: string }[]; channels?: { alternatives?: { transcript?: string; paragraphs?: { transcript?: string } }[] }[] } };
  const utterances = d?.results?.utterances;
  if (Array.isArray(utterances) && utterances.length) {
    const lines: string[] = [];
    let cur = -1;
    let buf: string[] = [];
    const flush = () => { if (buf.length) lines.push(`Speaker ${cur}: ${buf.join(" ")}`); buf = []; };
    for (const u of utterances) {
      const sp = typeof u.speaker === "number" ? u.speaker : 0;
      if (sp !== cur) { flush(); cur = sp; }
      const t = u.transcript?.trim();
      if (t) buf.push(t);
    }
    flush();
    return lines.join("\n");
  }
  const alt = d?.results?.channels?.[0]?.alternatives?.[0];
  return (alt?.paragraphs?.transcript || alt?.transcript || "").trim();
}
