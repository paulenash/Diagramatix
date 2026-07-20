/**
 * POST /api/ai/dictation/token
 *   Mints a short-lived Deepgram API key so the browser can open a streaming
 *   WebSocket directly to Deepgram WITHOUT ever seeing the master key. The
 *   temp key carries only usage:write and expires in 10 minutes.
 *
 *   Requires DEEPGRAM_API_KEY in the server env. If it isn't configured the
 *   route returns 503 and the client falls back to the browser speech engine.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { gateOrgPolicy } from "@/app/lib/auth/orgPolicy";

const DG = "https://api.deepgram.com/v1";
const TTL_SECONDS = 600;

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const _pol = await gateOrgPolicy(session, "allowVoiceAi");
  if (_pol) return _pol;

  const masterKey = process.env.DEEPGRAM_API_KEY;
  if (!masterKey) {
    return NextResponse.json({ error: "Dictation service not configured" }, { status: 503 });
  }

  try {
    // Preferred: a short-lived "grant" token. Works with ANY valid key — no
    // key-creation permission needed. The client authenticates the WebSocket
    // with the bearer scheme.
    const gr = await fetch(`${DG}/auth/grant`, {
      method: "POST",
      headers: { Authorization: `Token ${masterKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl_seconds: TTL_SECONDS }),
    });
    if (gr.ok) {
      const j = await gr.json();
      const token = (j?.access_token ?? j?.token) as string | undefined;
      if (token) {
        return NextResponse.json({ token, scheme: "bearer", expiresIn: j?.expires_in ?? TTL_SECONDS });
      }
    }

    // Fallback: mint a temporary sub-key (needs an Owner/Admin master key).
    const pr = await fetch(`${DG}/projects`, { headers: { Authorization: `Token ${masterKey}` } });
    if (!pr.ok) {
      return NextResponse.json({ error: `Deepgram projects ${pr.status}` }, { status: 502 });
    }
    const projectId = (await pr.json())?.projects?.[0]?.project_id as string | undefined;
    if (!projectId) {
      return NextResponse.json({ error: "No Deepgram project found" }, { status: 502 });
    }
    const kr = await fetch(`${DG}/projects/${projectId}/keys`, {
      method: "POST",
      headers: { Authorization: `Token ${masterKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        comment: "diagramatix-dictation",
        scopes: ["usage:write"],
        time_to_live_in_seconds: TTL_SECONDS,
      }),
    });
    if (kr.ok) {
      const token = (await kr.json())?.key as string | undefined;
      if (token) return NextResponse.json({ token, scheme: "token", expiresIn: TTL_SECONDS });
    }

    // SEC-19: the key can't mint short-lived tokens (transcription-only key —
    // grant ${gr.status}, key-create ${kr.status}). We must NOT hand the
    // long-lived master key to the browser (non-expiring, reusable against our
    // Deepgram billing). Fail closed with 503 — the client falls back to the
    // browser speech engine, exactly as it does when the service is unconfigured.
    // To enable cloud dictation, use a Deepgram Owner key (supports /auth/grant).
    console.error(`[dictation] cannot mint a short-lived token (grant ${gr.status}, key-create ${kr.status}); refusing to expose the master key`);
    return NextResponse.json({ error: "Dictation service unavailable" }, { status: 503 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Token mint failed" },
      { status: 500 },
    );
  }
}
