/**
 * SuperAdmin Feature Availability matrix API.
 *   GET  → { levels, features, matrix }  (matrix[levelId][featureKey] = state)
 *   PUT  { matrix } → upsert every provided cell (state ∈ available|disabled|hidden)
 * SuperAdmin only. Backs the dashboard/admin/feature-availability grid.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { prisma } from "@/app/lib/db";
import { FEATURES, FEATURE_KEYS } from "@/app/lib/features/registry";
import { coerceState, type FeatureState } from "@/app/lib/features/availability";

export const runtime = "nodejs";

const STATES = new Set<FeatureState>(["available", "disabled", "hidden"]);

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "SuperAdmin only" }, { status: 403 });
  }
  const [levels, rows] = await Promise.all([
    prisma.subscriptionLevel.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, sortOrder: true } }),
    prisma.featureAvailability.findMany({ select: { levelId: true, featureKey: true, state: true } }),
  ]);
  const matrix: Record<string, Record<string, FeatureState>> = {};
  for (const l of levels) {
    matrix[l.id] = {};
    for (const k of FEATURE_KEYS) matrix[l.id][k] = "hidden"; // default until a row exists
  }
  for (const r of rows) if (matrix[r.levelId] && FEATURE_KEYS.includes(r.featureKey)) matrix[r.levelId][r.featureKey] = coerceState(r.state);
  return NextResponse.json({ levels, features: FEATURES, matrix });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "SuperAdmin only" }, { status: 403 });
  }
  let body: { matrix?: Record<string, Record<string, string>> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const matrix = body.matrix ?? {};

  const validLevels = new Set((await prisma.subscriptionLevel.findMany({ select: { id: true } })).map((l) => l.id));

  const ops: Promise<unknown>[] = [];
  for (const [levelId, feats] of Object.entries(matrix)) {
    if (!validLevels.has(levelId)) continue;
    for (const [featureKey, rawState] of Object.entries(feats)) {
      if (!FEATURE_KEYS.includes(featureKey)) continue;
      const state = STATES.has(rawState as FeatureState) ? rawState : "hidden";
      ops.push(prisma.featureAvailability.upsert({
        where: { levelId_featureKey: { levelId, featureKey } },
        create: { levelId, featureKey, state },
        update: { state },
      }));
    }
  }
  await prisma.$transaction(ops as never);
  return NextResponse.json({ ok: true, count: ops.length });
}
