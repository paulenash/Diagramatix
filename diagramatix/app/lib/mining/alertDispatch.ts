/**
 * Turning an alert into something that reaches a person.
 *
 * `alerts.ts` decides WHAT is worth saying; this decides whether to say it
 * again. Those are different jobs and the second one is what determines whether
 * the channel is still read in a month: a cron that repeats "conformance is 71%"
 * every hour has not told anybody anything since the first time, and has taught
 * them to ignore the next genuinely new message.
 *
 * So a condition is announced ONCE. The key is the run, the kind and the
 * headline — which means a condition that WORSENS (71% → 50%) is a different key
 * and is announced again, while one that merely persists is not.
 *
 * There is no new column for this: recent notifications for the recipient are
 * read back and their keys compared. That is a query rather than state, and it
 * is right — the record of what somebody was told is the notification itself,
 * and a separate "last alerted" field would be a second source of truth that can
 * disagree with what is actually in their bell.
 */

import { prisma } from "@/app/lib/db";
import { createNotification } from "@/app/lib/notifications";
import { alertKey, type MiningAlert } from "./alerts";

/**
 * How far back to look for an identical alert. A standing condition is
 * re-announced after this, which is deliberate: something wrong for a fortnight
 * that nobody has acted on is worth raising again, and a channel that never
 * repeats itself lets a real problem age out of view.
 */
export const REANNOUNCE_AFTER_DAYS = 14;
/** Recent alerts read back per recipient. Bounded — this runs inside a cron. */
const LOOKBACK = 100;

export interface DispatchTarget {
  /** Who hears about it. */
  userId: string | null;
  runId?: string;
  sourceId?: string;
  projectId?: string | null;
}

export interface DispatchResult {
  sent: number;
  /** Suppressed because the same condition was already announced. */
  suppressed: number;
  /** Not sent because there was nobody to send to. */
  undeliverable: number;
}

/**
 * Announce the alerts that have not been announced already.
 *
 * Best-effort by design: this runs from a cron alongside the refresh that
 * produced the data, and a notification that could not be written is not worth
 * failing a poll over. It reports what it did rather than throwing.
 */
export async function dispatchAlerts(
  alerts: MiningAlert[],
  target: DispatchTarget,
  now: Date = new Date(),
): Promise<DispatchResult> {
  const out: DispatchResult = { sent: 0, suppressed: 0, undeliverable: 0 };
  if (alerts.length === 0) return out;

  if (!target.userId) {
    // A source whose creator has been deleted still generates alerts and has
    // nobody to tell. Counted rather than silently dropped, so the cron's own
    // report shows it.
    out.undeliverable = alerts.length;
    return out;
  }

  const since = new Date(now.getTime() - REANNOUNCE_AFTER_DAYS * 86_400_000);
  let seen = new Set<string>();
  try {
    const recent = await prisma.notification.findMany({
      where: { userId: target.userId, type: "mining-alert", createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: LOOKBACK,
      select: { payload: true },
    });
    seen = new Set(
      recent
        .map((r) => (r.payload as { alertKey?: string } | null)?.alertKey)
        .filter((k): k is string => typeof k === "string"),
    );
  } catch {
    // Cannot read the history: announce rather than stay silent. A duplicate
    // message is a smaller failure than a missed one.
  }

  const scope = target.runId ?? target.sourceId ?? "mining";
  for (const a of alerts) {
    const key = alertKey(scope, a);
    if (seen.has(key)) { out.suppressed++; continue; }
    try {
      await createNotification(target.userId, "mining-alert", {
        runId: target.runId,
        sourceId: target.sourceId,
        projectId: target.projectId ?? undefined,
        alertKind: a.kind,
        alertKey: key,
        title: a.title,
        detail: a.detail,
        severity: a.severity,
      });
      seen.add(key);
      out.sent++;
    } catch {
      out.undeliverable++;
    }
  }
  return out;
}
