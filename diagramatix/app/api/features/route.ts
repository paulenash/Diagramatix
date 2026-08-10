/**
 * GET /api/features — the signed-in user's resolved feature-availability map
 * `{ [featureKey]: "available"|"disabled"|"hidden" }` (SuperAdmin → all available,
 * else the effective subscription-level matrix overlaid with per-user overrides).
 * Powers the client `useFeatureStates()` hook + `<FeatureGate>`. UX-only — the
 * server independently enforces via gateFeature.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getFeatureStates } from "@/app/lib/features/availability";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ states: {} }, { status: 200 });
  const states = await getFeatureStates(session.user.id);
  return NextResponse.json({ states });
}
