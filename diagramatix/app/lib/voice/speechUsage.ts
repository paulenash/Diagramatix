/**
 * What speech has cost — the figures on the Text to Speech tile. Pure.
 *
 * Built from the `AiInvocation` rows the speak route writes (characters in
 * `inputTokens`, the voice as the model) and priced by the SAME rate lookup the
 * AI Usage report uses, so the tile and the report cannot disagree about a cent.
 *
 * What this cannot count: a reply the browser replayed from its own cache never
 * reaches the server, costs nothing, and leaves no row. The tile says so rather
 * than inventing a "saved by the cache" figure it has no way to measure.
 */

export interface SpeechRow {
  userId: string | null;
  invocationPoint: string;
  model: string;
  status: string;
  chars: number;
  at: Date;
}

export interface SpeechWindow {
  /** Sentences spoken. */
  calls: number;
  chars: number;
  costUsd: number;
  /** Requests Deepgram refused or that never arrived — nothing was heard, nothing billed. */
  failures: number;
}

export interface SpeechBreakdown {
  key: string;
  calls: number;
  chars: number;
  costUsd: number;
}

export interface SpeechUsage {
  monthStartIso: string;
  month: SpeechWindow;
  last30: SpeechWindow;
  /** Last 30 days, by user id (null = no user recorded), dearest first. */
  byUser: SpeechBreakdown[];
  /** Last 30 days, by invocation point, dearest first. */
  byUse: SpeechBreakdown[];
  /** Voices seen with no rate on file — their cost shows as 0 and is named here so nobody trusts it. */
  unpricedModels: string[];
}

const DAY_MS = 86_400_000;

/** The first moment of `now`'s month, in UTC — the server's clock, stated on the tile. */
export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function summariseSpeechUsage(
  rows: readonly SpeechRow[],
  rateFor: (model: string) => { inputPer1M: number } | undefined,
  now: Date,
): SpeechUsage {
  const monthStart = monthStartUtc(now);
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const empty = (): SpeechWindow => ({ calls: 0, chars: 0, costUsd: 0, failures: 0 });
  const month = empty();
  const last30 = empty();
  const byUser = new Map<string, SpeechBreakdown>();
  const byUse = new Map<string, SpeechBreakdown>();
  const unpriced = new Set<string>();

  const bump = (m: Map<string, SpeechBreakdown>, key: string, chars: number, cost: number) => {
    const b = m.get(key) ?? { key, calls: 0, chars: 0, costUsd: 0 };
    b.calls += 1;
    b.chars += chars;
    b.costUsd += cost;
    m.set(key, b);
  };

  for (const r of rows) {
    const inMonth = r.at >= monthStart;
    const in30 = r.at >= since30;
    if (!inMonth && !in30) continue;

    if (r.status !== "success") {
      if (inMonth) month.failures += 1;
      if (in30) last30.failures += 1;
      continue;
    }

    const chars = Math.max(0, r.chars);
    const rate = rateFor(r.model);
    if (!rate) unpriced.add(r.model);
    const cost = rate ? (chars / 1e6) * rate.inputPer1M : 0;

    for (const [inWindow, w] of [[inMonth, month], [in30, last30]] as const) {
      if (!inWindow) continue;
      w.calls += 1;
      w.chars += chars;
      w.costUsd += cost;
    }
    if (in30) {
      bump(byUser, r.userId ?? "", chars, cost);
      bump(byUse, r.invocationPoint, chars, cost);
    }
  }

  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  const tidy = (w: SpeechWindow): SpeechWindow => ({ ...w, costUsd: round(w.costUsd) });
  const sorted = (m: Map<string, SpeechBreakdown>) =>
    [...m.values()]
      .map((b) => ({ ...b, costUsd: round(b.costUsd) }))
      .sort((a, b) => b.costUsd - a.costUsd || b.chars - a.chars || a.key.localeCompare(b.key));

  return {
    monthStartIso: monthStart.toISOString(),
    month: tidy(month),
    last30: tidy(last30),
    byUser: sorted(byUser),
    byUse: sorted(byUse),
    unpricedModels: [...unpriced].sort(),
  };
}
