/**
 * The recorded voice corpus — list, and add one clip.
 *
 * ONE POST PER ACCEPTED TAKE, deliberately. Twenty minutes of reading is the
 * expensive input in this whole feature, and a crash at clip seventy must cost
 * nothing: the tab resumes from the first unrecorded case. Batching the upload
 * at the end would risk the entire sitting on one request.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { blockReadOnlyImpersonation } from "@/app/lib/routeGuard";
import { WAV_MIME } from "@/app/lib/dictation/wav";

export const dynamic = "force-dynamic";

/** ~30 s of 48 kHz mono 16-bit, with room to spare. A command is five seconds. */
const MAX_CLIP_BYTES = 8 * 1024 * 1024;

/** Never the audio in a listing: a hundred clips is sixteen megabytes. */
const LIST_SELECT = {
  id: true, corpusSeed: true, caseId: true, family: true, utterance: true,
  // The expected ops travel with the listing: they are a short text field, and
  // the replay needs them to score without a second round trip per clip.
  expectedOps: true,
  mimeType: true, sampleRate: true, durationMs: true, byteSize: true,
  peakLevel: true, takeNumber: true, starred: true,
  recordedById: true, recordedAt: true, asrFingerprint: true,
  lastTranscript: true, lastOutcome: true, lastRunAt: true, runCount: true,
} as const;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const seed = new URL(req.url).searchParams.get("seed");
  const clips = await prisma.voiceClip.findMany({
    where: seed ? { corpusSeed: seed } : undefined,
    select: LIST_SELECT,
    orderBy: [{ corpusSeed: "asc" }, { caseId: "asc" }, { takeNumber: "asc" }],
    take: 2000,
  });
  return NextResponse.json({ clips });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await blockReadOnlyImpersonation(session);
  if (blocked) return blocked;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "multipart/form-data required" }, { status: 400 });

  const file = form.get("audio");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "audio required" }, { status: 400 });
  if (file.size > MAX_CLIP_BYTES) {
    return NextResponse.json({ error: "Clip too large (max 8 MB)." }, { status: 413 });
  }
  // WAV only. The whole point of the capture format is that these bytes are
  // what the live socket would have received; accepting a MediaRecorder blob
  // here would quietly poison the corpus with a lossy generation.
  const mime = (file.type || WAV_MIME).toLowerCase();
  if (!mime.startsWith("audio/wav") && !mime.startsWith("audio/x-wav")) {
    return NextResponse.json(
      { error: `Only ${WAV_MIME} is accepted — a compressed clip would not measure the live path.` },
      { status: 415 },
    );
  }

  const str = (k: string) => { const v = form.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };
  const num = (k: string) => { const v = form.get(k); const n = v ? Number(v) : NaN; return Number.isFinite(n) ? n : null; };

  const corpusSeed = str("corpusSeed");
  const caseId = str("caseId");
  const utterance = str("utterance");
  const expectedOps = str("expectedOps");
  const sampleRate = num("sampleRate");
  if (!corpusSeed || !caseId || !utterance || !expectedOps || !sampleRate) {
    return NextResponse.json(
      { error: "corpusSeed, caseId, utterance, expectedOps and sampleRate are required" },
      { status: 400 },
    );
  }

  // A RETAKE BECOMES TAKE 2. Never an upsert: a good take must not be destroyed
  // to store a worse one, and which is which is only knowable later.
  const prior = await prisma.voiceClip.count({ where: { corpusSeed, caseId } });

  const created = await prisma.voiceClip.create({
    data: {
      corpusSeed, caseId, utterance, expectedOps,
      family: str("family") ?? "",
      audioBytes: Buffer.from(await file.arrayBuffer()),
      mimeType: WAV_MIME,
      sampleRate: Math.round(sampleRate),
      durationMs: Math.round(num("durationMs") ?? 0),
      byteSize: file.size,
      peakLevel: Math.round(num("peakLevel") ?? 0),
      takeNumber: prior + 1,
      recordedById: session.user.id,
      asrFingerprint: str("asrFingerprint"),
    },
    select: { id: true, takeNumber: true },
  });
  return NextResponse.json(created);
}
