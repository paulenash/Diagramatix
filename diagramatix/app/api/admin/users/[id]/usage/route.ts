/**
 * Admin: usage snapshot for a single user.
 *
 *   GET /api/admin/users/[id]/usage
 *     Returns the full UsageSnapshot for the named user.
 *     isSuperuser-gated.
 *
 * The UsagePopover component hits this on every open (no client cache)
 * so admins see fresh counts after a Change Tier action.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { EVENT_METRICS, getUsageSnapshot, resetUsageCounters, setTrialDaysLeft, setUsageCounter } from "@/app/lib/subscription";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const snapshot = await getUsageSnapshot(id);
  if (!snapshot) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  return NextResponse.json(snapshot);
}

/**
 * SuperAdmin test tools (plan 2026-09-30): put a user where a limit can be hit in seconds.
 *
 *   POST /api/admin/users/[id]/usage
 *     { "action": "set-counter", "metric": "aiAttempts", "count": 49 }  — this period's counter, exactly
 *     { "action": "reset-counters" }                                    — every counter, every period
 *     { "action": "set-trial-days-left", "days": 1 }                    — moves subscriptionAssignedAt
 *   Returns the fresh snapshot. isSuperuser-gated (the real identity, not the acting view).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { action?: string; metric?: string; count?: unknown; days?: unknown } | null;
  switch (body?.action) {
    case "set-counter": {
      const metric = (EVENT_METRICS as readonly string[]).includes(body.metric ?? "") ? (body.metric as (typeof EVENT_METRICS)[number]) : null;
      const count = Number(body.count);
      if (!metric || !Number.isFinite(count) || count < 0) return NextResponse.json({ error: "metric and a count of 0 or more are required" }, { status: 400 });
      if (!(await setUsageCounter(id, metric, count))) return NextResponse.json({ error: "User has no subscription tier" }, { status: 409 });
      break;
    }
    case "reset-counters":
      await resetUsageCounters(id);
      break;
    case "set-trial-days-left": {
      const days = Number(body.days);
      if (!Number.isFinite(days) || days < 0) return NextResponse.json({ error: "days of 0 or more is required" }, { status: 400 });
      if (!(await setTrialDaysLeft(id, days))) return NextResponse.json({ error: "This user's tier has no trial" }, { status: 409 });
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  const snapshot = await getUsageSnapshot(id);
  return snapshot ? NextResponse.json(snapshot) : NextResponse.json({ error: "User not found" }, { status: 404 });
}
