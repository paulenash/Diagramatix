import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { getEffectiveUserId } from "@/app/lib/superuser";
import { ratesByModel } from "@/app/lib/ai/aiRates";
import { DEEPGRAM_USD_PER_MINUTE } from "@/app/lib/ai/pricing";
import { summariseCommandUsage, LIVE_COMMAND_POINT, VOICE_POINT, REPLY_POINT } from "@/app/lib/assist/usageCost";

/**
 * GET /api/ai/command/usage?since=<ISO>&live=<seconds>
 *
 * The cost of the current Voice Assist session for the signed-in user (and the
 * user they are viewing as, whose key would pay): AI fallback calls plus closed
 * dictation sessions since `since`, with `live` — the seconds the microphone
 * has been open on a session that has not closed yet — added by the caller.
 * See app/lib/assist/usageCost.ts for what is and is not counted.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const sinceRaw = url.searchParams.get("since") ?? "";
  const since = new Date(sinceRaw);
  if (Number.isNaN(since.getTime())) return NextResponse.json({ error: "since must be an ISO date" }, { status: 400 });
  const live = Math.max(0, Number(url.searchParams.get("live") ?? 0) || 0);

  const cookieStore = await cookies();
  const effective = getEffectiveUserId(session, cookieStore) ?? session.user.id;
  const userIds = [...new Set([session.user.id, effective])];

  const rows = await prisma.aiInvocation.findMany({
    where: {
      userId: { in: userIds }, createdAt: { gte: since },
      // A spoken reply that failed was never heard and never billed, so only
      // successes count; the failures stay visible in the AI Usage report.
      OR: [
        { invocationPoint: { in: [LIVE_COMMAND_POINT, VOICE_POINT] } },
        { invocationPoint: REPLY_POINT, status: "success" },
      ],
    },
    select: { invocationPoint: true, provider: true, model: true, inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheWriteTokens: true, latencyMs: true },
  });
  const rates = await ratesByModel();
  const report = summariseCommandUsage(
    rows.map((r) => ({ ...r, inputTokens: r.inputTokens ?? 0, outputTokens: r.outputTokens ?? 0, cacheReadTokens: r.cacheReadTokens ?? 0, cacheWriteTokens: r.cacheWriteTokens ?? 0, latencyMs: r.latencyMs ?? 0 })),
    (model) => rates.get(model),
    DEEPGRAM_USD_PER_MINUTE,
    { sinceIso: since.toISOString(), liveVoiceSeconds: live },
  );
  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
