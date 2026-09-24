/**
 * GET /api/admin/voice-assist-test/recogniser
 *
 * What the recogniser key in THIS environment can actually do.
 *
 * Written on 2026-09-24 after an hour was lost to a question nobody could
 * answer from the outside: local had a restricted key and production had an
 * Owner key, and the only visible symptom was that live dictation quietly used
 * the browser engine instead of Deepgram. Nothing anywhere said so. A hundred
 * replayed clips all failed with "Dictation service unavailable", which was
 * true and useless.
 *
 * THE KEY VALUE IS NEVER RETURNED, LOGGED, OR PUT IN AN ERROR. What comes back
 * is what it can do, plus a one-way fingerprint — the first 8 hex of its
 * SHA-256 — which is enough to tell "local and prod hold the same key" from
 * "they hold different ones" without either being disclosed.
 */
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { asrFingerprint, liveStreamParams, ASR_MODEL, ASR_LANGUAGE } from "@/app/lib/dictation/asrParams";

export const dynamic = "force-dynamic";

const DG = "https://api.deepgram.com/v1";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const key = process.env.DEEPGRAM_API_KEY;
  const settings = {
    model: ASR_MODEL,
    language: ASR_LANGUAGE,
    asrFingerprint: asrFingerprint(liveStreamParams({ sampleRate: 48000 })),
  };

  if (!key) {
    return NextResponse.json({
      configured: false,
      kind: "none" as const,
      summary: "No DEEPGRAM_API_KEY is set. Live voice falls back to the browser engine, and neither replay leg can run.",
      ...settings,
    });
  }

  const head = { Authorization: `Token ${key}` };
  const probe = async (url: string, init?: RequestInit) => {
    try {
      const r = await fetch(url, { ...init, headers: { ...head, ...(init?.headers ?? {}) } });
      return r.status;
    } catch {
      return 0; // unreachable — a network answer, not a permission one
    }
  };

  // Two probes are enough. /projects says the key is valid at all; /auth/grant
  // says whether it can mint the short-lived token a BROWSER needs, which is
  // the thing that separates an Owner/Admin key from a restricted one.
  const valid = await probe(`${DG}/projects`);
  const grant = await probe(`${DG}/auth/grant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ttl_seconds: 60 }),
  });

  const canMintBrowserToken = grant === 200;
  const kind = valid !== 200 ? "invalid" : canMintBrowserToken ? "owner" : "restricted";

  return NextResponse.json({
    configured: true,
    kind,
    canMintBrowserToken,
    valid: valid === 200,
    // A one-way fingerprint: enough to compare environments, useless to an
    // attacker, and it must never become the key itself.
    fingerprint: createHash("sha256").update(key).digest("hex").slice(0, 8),
    summary:
      kind === "invalid"
        ? `The key is set but Deepgram rejected it (projects ${valid}). Live voice falls back to the browser engine.`
        : kind === "owner"
          ? "Owner/Admin key — live cloud dictation works and the streaming replay can run."
          : "Restricted key — it can transcribe, but cannot mint the short-lived token a browser needs. "
            + "Live voice silently falls back to the browser engine (no en-AU, no keyword boosts) and the stream leg cannot run. "
            + "The batch leg still works. Fix: install a Deepgram Owner/Admin key.",
    ...settings,
  });
}
