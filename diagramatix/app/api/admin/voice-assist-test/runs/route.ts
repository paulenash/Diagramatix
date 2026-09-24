/**
 * Scoring runs — list, and record one.
 *
 * The client scores; this only keeps the answer. That is not laziness: the
 * text leg is pure and the stream leg has to run in the browser where the
 * recogniser token lives, so the server has nothing useful to add except
 * memory. What it keeps is what makes a later run comparable — the leg, the
 * seed, and the recogniser fingerprint.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { blockReadOnlyImpersonation } from "@/app/lib/routeGuard";

export const dynamic = "force-dynamic";

const LEGS = new Set(["text", "stream", "batch"]);

/** A listing shows the shape of a run, never every row of it. */
const LIST_SELECT = {
  id: true, leg: true, corpusSeed: true, asrFingerprint: true,
  total: true, passed: true, failed: true, fallbackRate: true,
  outcomes: true, families: true,
  notes: true, runById: true, startedAt: true, finishedAt: true, durationMs: true,
} as const;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const leg = new URL(req.url).searchParams.get("leg");
  const runs = await prisma.voiceTestRun.findMany({
    where: leg && LEGS.has(leg) ? { leg } : undefined,
    select: LIST_SELECT,
    orderBy: { startedAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ runs });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await blockReadOnlyImpersonation(session);
  if (blocked) return blocked;

  const body = await req.json().catch(() => null) as {
    leg?: string; corpusSeed?: string; asrFingerprint?: string; boostProfile?: string;
    total?: number; passed?: number; failed?: number; fallbackRate?: number;
    outcomes?: unknown; families?: unknown; results?: unknown;
    durationMs?: number; notes?: string;
  } | null;

  if (!body?.leg || !LEGS.has(body.leg) || !body.corpusSeed) {
    return NextResponse.json({ error: "leg (text|stream|batch) and corpusSeed are required" }, { status: 400 });
  }

  const created = await prisma.voiceTestRun.create({
    data: {
      leg: body.leg,
      corpusSeed: body.corpusSeed,
      boostProfile: body.boostProfile ?? null,
      // The text leg has no recogniser, so it has no fingerprint — and a null
      // here is the honest record of that rather than a placeholder that would
      // later look like a configuration.
      asrFingerprint: body.leg === "text" ? null : (body.asrFingerprint ?? null),
      total: Math.max(0, Math.round(body.total ?? 0)),
      passed: Math.max(0, Math.round(body.passed ?? 0)),
      failed: Math.max(0, Math.round(body.failed ?? 0)),
      fallbackRate: Number.isFinite(body.fallbackRate) ? Number(body.fallbackRate) : 0,
      outcomes: JSON.stringify(body.outcomes ?? {}),
      families: JSON.stringify(body.families ?? {}),
      results: JSON.stringify(body.results ?? []),
      durationMs: Math.max(0, Math.round(body.durationMs ?? 0)),
      notes: body.notes ?? null,
      runById: session.user.id,
      finishedAt: new Date(),
    },
    select: { id: true },
  });
  return NextResponse.json(created);
}
