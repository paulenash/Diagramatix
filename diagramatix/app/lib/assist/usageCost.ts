/**
 * "What has this Voice Assist session cost so far?" — summed from the usage rows
 * the feature already writes: one `AiInvocation` per AI fallback call (tokens
 * recorded) and one per closed dictation session (`latencyMs` = seconds × 1000,
 * provider "deepgram" or "browser").
 *
 * Two honesties the readout keeps:
 *  - It is an ESTIMATE at list rates. AI cost uses the editable rate catalogue
 *    (cache reads at a tenth of the input rate, cache writes at 1.25×, as
 *    Anthropic prices them); voice uses one per-minute constant. What Paul is
 *    invoiced depends on the provider route (OpenRouter, a BYO key) and on
 *    Deepgram's own metering.
 *  - The OPEN mic session has no row yet — its row is sent when the mic stops —
 *    so the caller adds the seconds the microphone has been open right now.
 *
 * Pure, so the arithmetic is testable without a database.
 */
export interface UsageRow {
  invocationPoint: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  latencyMs: number;
}

export interface CostReport {
  sinceIso: string;
  aiCalls: number;
  aiInputTokens: number;
  aiOutputTokens: number;
  aiCostUsd: number;
  /** Closed voice sessions found in the rows. */
  voiceSessions: number;
  /** Seconds of microphone, closed sessions PLUS the live one the caller adds. */
  voiceSeconds: number;
  voiceCostUsd: number;
  /** Replies Diagramatix SPOKE back (text-to-speech), successful ones only. */
  spokenReplies: number;
  /** Characters spoken — what Deepgram bills speech by. */
  spokenChars: number;
  speechCostUsd: number;
  totalUsd: number;
  /** Models seen with no rate on file — their calls cost 0 here and are named so nobody trusts the zero. */
  unpricedModels: string[];
}

export const LIVE_COMMAND_POINT = "bpmn.live-command";
export const VOICE_POINT = "voice.dictation";
/**
 * One row per sentence spoken back. The row carries CHARACTERS in `inputTokens`
 * and is priced by the same rate lookup as a model — the Aura-2 rows in
 * pricing.ts are per million characters — so there is no second price to keep.
 */
export const REPLY_POINT = "voice.reply";

export function summariseCommandUsage(
  rows: readonly UsageRow[],
  rateFor: (model: string) => { inputPer1M: number; outputPer1M: number } | undefined,
  deepgramUsdPerMinute: number,
  opts: { sinceIso: string; liveVoiceSeconds?: number } ,
): CostReport {
  let aiCalls = 0, aiIn = 0, aiOut = 0, aiCost = 0, voiceSessions = 0, voiceSeconds = 0, voiceCost = 0;
  let spokenReplies = 0, spokenChars = 0, speechCost = 0;
  const unpriced = new Set<string>();
  for (const r of rows) {
    if (r.invocationPoint === LIVE_COMMAND_POINT) {
      aiCalls += 1;
      aiIn += r.inputTokens + r.cacheReadTokens + r.cacheWriteTokens;
      aiOut += r.outputTokens;
      const rate = rateFor(r.model);
      if (!rate) { unpriced.add(r.model); continue; }
      const inputEquivalent = r.inputTokens + r.cacheReadTokens * 0.1 + r.cacheWriteTokens * 1.25;
      aiCost += (inputEquivalent / 1e6) * rate.inputPer1M + (r.outputTokens / 1e6) * rate.outputPer1M;
    } else if (r.invocationPoint === VOICE_POINT) {
      voiceSessions += 1;
      const secs = Math.max(0, r.latencyMs) / 1000;
      voiceSeconds += secs;
      if (r.provider === "deepgram") voiceCost += (secs / 60) * deepgramUsdPerMinute;
    } else if (r.invocationPoint === REPLY_POINT) {
      spokenReplies += 1;
      const chars = Math.max(0, r.inputTokens);
      spokenChars += chars;
      const rate = rateFor(r.model);
      if (!rate) { unpriced.add(r.model); continue; }
      speechCost += (chars / 1e6) * rate.inputPer1M;
    }
  }
  const live = Math.max(0, opts.liveVoiceSeconds ?? 0);
  voiceSeconds += live;
  voiceCost += (live / 60) * deepgramUsdPerMinute;
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  return {
    sinceIso: opts.sinceIso,
    aiCalls, aiInputTokens: aiIn, aiOutputTokens: aiOut, aiCostUsd: round(aiCost),
    voiceSessions, voiceSeconds: Math.round(voiceSeconds), voiceCostUsd: round(voiceCost),
    spokenReplies, spokenChars, speechCostUsd: round(speechCost),
    totalUsd: round(aiCost + voiceCost + speechCost),
    unpricedModels: [...unpriced].sort(),
  };
}

/**
 * One line for the bar: "$0.0123 · 3 AI calls ($0.0111) · 4.2 min voice ($0.0012)".
 * Spoken replies join the line only when there were some — most users do not
 * have speech, and "0 spoken ($0.00)" would be noise on every one of their bars.
 */
export function formatCostReport(r: CostReport): string {
  const usd = (n: number) => `$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`;
  const mins = r.voiceSeconds >= 60 ? `${(r.voiceSeconds / 60).toFixed(1)} min` : `${r.voiceSeconds} s`;
  const parts = [`${r.aiCalls} AI call${r.aiCalls === 1 ? "" : "s"} (${usd(r.aiCostUsd)})`, `${mins} voice (${usd(r.voiceCostUsd)})`];
  if (r.spokenReplies > 0) parts.push(`${r.spokenReplies} spoken (${usd(r.speechCostUsd)})`);
  return `${usd(r.totalUsd)} so far · ${parts.join(" · ")}`;
}
