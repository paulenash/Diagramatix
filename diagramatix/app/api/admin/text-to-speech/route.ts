/**
 * The Text to Speech tile's data — SuperAdmin only.
 *
 *   GET                → { settings, superAdmins, granted, tiersOn, usage, users }
 *   GET ?search=<text> → { results } — users to switch on, by name or email
 *   PUT { enabled?, defaultVoice? } → the master switch and the default voice
 *
 * Per-user switches are `users/[id]/route.ts`. Who may hear speech is decided
 * in ONE place, `app/lib/voice/speechAccess.ts`; this route only shows it.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { isSuperuser, SUPERUSER_EMAILS } from "@/app/lib/superuser";
import { blockReadOnlyImpersonation } from "@/app/lib/routeGuard";
import { ratesByModel } from "@/app/lib/ai/aiRates";
import { AI_INVOCATION_POINTS, labelForInvocationPoint } from "@/app/lib/ai/aiTelemetry";
import { readTtsSettings, writeTtsSettings } from "@/app/lib/voice/ttsSettings";
import { SPEECH_FEATURE_KEY } from "@/app/lib/voice/speechAccess";
import { isValidTtsVoice, type TtsVoice } from "@/app/lib/voice/speakParams";
import { summariseSpeechUsage, monthStartUtc } from "@/app/lib/voice/speechUsage";

const SPEECH_POINTS = [
  AI_INVOCATION_POINTS.VoiceReply,
  AI_INVOCATION_POINTS.VoiceNarration,
  AI_INVOCATION_POINTS.VoiceCompare,
];

type UserRow = { id: string; email: string; name: string | null };

const forbidden = () => NextResponse.json({ error: "SuperAdmin only" }, { status: 403 });

/** A search term matched literally — `%` and `_` typed by a person mean themselves. */
function likeTerm(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperuser(session)) return forbidden();

  const superEmails = [...SUPERUSER_EMAILS].map((e) => e.toLowerCase());
  const search = new URL(req.url).searchParams.get("search")?.trim() ?? "";

  if (search) {
    if (search.length < 2) return NextResponse.json({ results: [] });
    const { rows } = await pgPool.query<UserRow & { granted: boolean }>(
      `SELECT id, email, name, ("featureOverrides"->>$2) = 'available' AS granted
         FROM "User"
        WHERE email ILIKE $1 OR name ILIKE $1
        ORDER BY lower(email)
        LIMIT 10`,
      [likeTerm(search), SPEECH_FEATURE_KEY],
    );
    return NextResponse.json({
      results: rows.map((r) => ({ ...r, superAdmin: superEmails.includes(r.email.toLowerCase()) })),
    });
  }

  const now = new Date();
  const since = new Date(Math.min(monthStartUtc(now).getTime(), now.getTime() - 30 * 86_400_000));

  const [settings, superRows, granted, tierRows, speechRows, rates] = await Promise.all([
    readTtsSettings(),
    pgPool.query<UserRow>(
      `SELECT id, email, name FROM "User" WHERE lower(email) = ANY($1::text[]) ORDER BY lower(email)`,
      [superEmails],
    ),
    pgPool.query<UserRow>(
      `SELECT id, email, name FROM "User" WHERE ("featureOverrides"->>$1) = 'available' ORDER BY lower(email)`,
      [SPEECH_FEATURE_KEY],
    ),
    prisma.featureAvailability.findMany({
      where: { featureKey: SPEECH_FEATURE_KEY, state: "available" },
      select: { levelId: true },
    }),
    prisma.aiInvocation.findMany({
      where: { invocationPoint: { in: SPEECH_POINTS }, createdAt: { gte: since } },
      select: { userId: true, invocationPoint: true, model: true, status: true, inputTokens: true, createdAt: true },
    }),
    ratesByModel(),
  ]);

  const usage = summariseSpeechUsage(
    speechRows.map((r) => ({
      userId: r.userId, invocationPoint: r.invocationPoint, model: r.model,
      status: r.status, chars: r.inputTokens ?? 0, at: r.createdAt,
    })),
    (m) => rates.get(m),
    now,
  );

  // Name the people in the usage table without a second trip per row.
  const ids = usage.byUser.map((b) => b.key).filter(Boolean);
  const named = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, name: true } })
    : [];

  // A SuperAdmin email with no account yet is still listed — they will have speech the moment they sign up.
  const found = new Set(superRows.rows.map((r) => r.email.toLowerCase()));
  const superAdmins = [
    ...superRows.rows,
    ...superEmails.filter((e) => !found.has(e)).map((email) => ({ id: null, email, name: null })),
  ];

  return NextResponse.json(
    {
      settings,
      /** Without the key nothing can be spoken, whatever the switches say. */
      configured: Boolean(process.env.DEEPGRAM_API_KEY),
      superAdmins,
      granted: granted.rows,
      tiersOn: tierRows.map((t) => t.levelId),
      usage,
      users: Object.fromEntries(named.map((u) => [u.id, { email: u.email, name: u.name }])),
      /** Sent rather than copied into the page — the labels live with the points. */
      useLabels: Object.fromEntries(SPEECH_POINTS.map((p) => [p, labelForInvocationPoint(p)])),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const readOnly = await blockReadOnlyImpersonation(session);
  if (readOnly) return readOnly;
  if (!isSuperuser(session)) return forbidden();

  const body = (await req.json().catch(() => null)) as { enabled?: unknown; defaultVoice?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const patch: { enabled?: boolean; defaultVoice?: TtsVoice } = {};
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "enabled must be true or false" }, { status: 400 });
    patch.enabled = body.enabled;
  }
  if (body.defaultVoice !== undefined) {
    if (!isValidTtsVoice(body.defaultVoice)) return NextResponse.json({ error: "defaultVoice is not one Diagramatix offers" }, { status: 400 });
    patch.defaultVoice = body.defaultVoice;
  }
  if (patch.enabled === undefined && patch.defaultVoice === undefined) {
    return NextResponse.json({ error: "nothing to change" }, { status: 400 });
  }

  await writeTtsSettings(patch);
  return NextResponse.json({ settings: await readTtsSettings() });
}
