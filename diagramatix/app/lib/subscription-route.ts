/**
 * Thin Next.js wrapper around `app/lib/subscription.ts`.
 *
 * Lives separately so the pure enforcement library has no Next.js
 * dependency (importable from non-route code and from tests). Routes
 * use `gateLimit()` before doing work and `recordUsage()` after the
 * work succeeds. A blocked check returns 403 with a JSON body the UI
 * can inspect — the `metric` field lets the client tell "you hit a
 * project cap" from "your trial expired".
 */

import { NextResponse } from "next/server";
import {
  checkLimit,
  recordUsage as recordUsageLib,
  type CheckContext,
  type EventMetric,
  type LimitMetric,
} from "./subscription";

/**
 * Returns null when the user is permitted to proceed. Returns a
 * NextResponse with HTTP 403 when blocked. Body shape:
 *
 *   { error: string, metric: LimitMetric|"trial", current: number, limit: number }
 *
 * The UI layer uses `metric` to choose between "upgrade for more …" and
 * "your trial expired" prompts. Status is uniformly 403 to keep client-
 * side handling simple — the body's `metric` differentiates.
 */
export async function gateLimit(
  userId: string,
  metric: LimitMetric,
  ctx?: CheckContext,
): Promise<NextResponse | null> {
  const result = await checkLimit(userId, metric, ctx);
  if (result.ok) return null;
  return NextResponse.json(
    {
      error: result.reason,
      metric: result.metric,
      current: result.current,
      limit: result.limit,
    },
    { status: 403 },
  );
}

/** Re-exported for symmetry — keeps route code importing one module. */
export async function recordUsage(
  userId: string,
  metric: EventMetric,
  delta: number = 1,
): Promise<void> {
  return recordUsageLib(userId, metric, delta);
}
