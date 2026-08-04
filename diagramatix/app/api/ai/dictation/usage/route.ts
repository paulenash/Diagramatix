/**
 * POST /api/ai/dictation/usage — record one voice-dictation session.
 *   Body: { engine: "deepgram" | "browser", seconds: number }
 * Called (best-effort, via sendBeacon) when a dictation session ends. Gives
 * app-side visibility of voice minutes per user/org in the AI Usage report;
 * Deepgram itself is billed separately on the Deepgram dashboard.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { getCurrentOrgId } from "@/app/lib/auth/orgContext";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { engine?: string; seconds?: unknown };
  try { body = await req.json(); } catch { body = {}; }
  const engine = body.engine === "browser" ? "browser" : "deepgram";
  const seconds = Math.max(0, Math.min(24 * 3600, Math.round(Number(body.seconds) || 0)));
  if (seconds <= 0) return NextResponse.json({ ok: true });

  let orgId: string | null = null;
  try { orgId = await getCurrentOrgId(session, await cookies()); } catch { /* no active org */ }

  try {
    await prisma.dictationSession.create({ data: { userId: session.user.id, orgId, engine, seconds } });
    // Also record a unified usage row so Deepgram shows up as a provider/model
    // in the AI Usage "By model / By provider" breakdowns + dropdowns. No tokens;
    // the session duration rides in latencyMs. Not a metered "User Attempt".
    await prisma.aiInvocation.create({
      data: {
        provider: engine === "browser" ? "browser" : "deepgram",
        model: engine === "browser" ? "browser" : "deepgram",
        userId: session.user.id, orgId,
        invocationPoint: "voice.dictation", status: "success",
        inputTokens: 0, outputTokens: 0, latencyMs: seconds * 1000,
      },
    });
  } catch (err) {
    console.error("[POST /api/ai/dictation/usage]", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false }, { status: 200 });
  }
  return NextResponse.json({ ok: true });
}
