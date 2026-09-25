/**
 * What the Replay tab compares, and how. Pure.
 *
 * One run cannot answer three questions. A run with padding AND punctuation on
 * cannot say which of them moved a clip; and on prod there is no screen that
 * reads a saved run back, so comparing two runs meant comparing screenshots.
 * So the tab MEASURES in one of four ways, and the fourth replays every clip
 * three times in one pass and reports, clip by clip, what each change recovered
 * and what it broke — against the same clip, as recorded.
 */

/** Silence added in front of a clip — the run-up question. */
export const PAD_MS = 500;

export type VariantKey = "recorded" | "padded" | "punctuated";

export interface Variant {
  key: VariantKey;
  label: string;
  padMs: number;
  /** Batch only: full stops and commas on, formatting still off. */
  punctuate: boolean;
}

export const VARIANTS: Record<VariantKey, Variant> = {
  recorded: { key: "recorded", label: "As recorded", padMs: 0, punctuate: false },
  padded: { key: "padded", label: `Start padded with ${PAD_MS} ms of silence`, padMs: PAD_MS, punctuate: false },
  punctuated: { key: "punctuated", label: "Punctuation on (batch)", padMs: 0, punctuate: true },
};

export type MeasureMode = VariantKey | "compare";

export const MEASURE_MODES: ReadonlyArray<{ mode: MeasureMode; label: string; batchOnly: boolean }> = [
  { mode: "recorded", label: "As recorded", batchOnly: false },
  { mode: "padded", label: `Padded start (${PAD_MS} ms)`, batchOnly: false },
  { mode: "punctuated", label: "Punctuation on", batchOnly: true },
  {
    mode: "compare",
    label: "Compared in one pass — batch: all three (3 requests per clip); stream: as recorded + padded (twice as long)",
    batchOnly: false,
  },
];

/**
 * The replays a run performs, in order. "As recorded" comes first in a
 * comparison because the others are judged against it. Punctuation is a batch
 * setting, so on the stream leg it falls back to "as recorded" rather than
 * quietly doing something else, and a stream comparison is recorded vs padded —
 * which matters, because the live product is the stream, and a first word the
 * batch leg hears fine may still be lost live.
 */
export function variantsFor(mode: MeasureMode, leg: "stream" | "batch"): Variant[] {
  if (mode === "compare") {
    return leg === "batch" ? [VARIANTS.recorded, VARIANTS.padded, VARIANTS.punctuated] : [VARIANTS.recorded, VARIANTS.padded];
  }
  if (mode === "punctuated" && leg !== "batch") return [VARIANTS.recorded];
  return [VARIANTS[mode]];
}

/** The first word, as a word: lower case, no punctuation. */
export function firstWordOf(s: string): string {
  return (s.trim().toLowerCase().split(/\s+/)[0] ?? "").replace(/[^a-z0-9']/g, "");
}

/**
 * Did the recogniser get the first word? The split that tests the clipping
 * theory — pass/fail does not, because a clip can pass with its first word
 * wrong and fail for reasons that have nothing to do with its start.
 */
export function firstWordHeardRight(said: string, heard: string): boolean {
  const h = firstWordOf(heard);
  return h.length > 0 && h === firstWordOf(said);
}

/**
 * Did a change get the FIRST WORD back, or lose it? Question 2 is about first
 * words, and pass/fail cannot answer it: padding can fix the first word while
 * another word is still wrong (the clip still fails, so it is not "recovered"),
 * and any change to the audio can move a word elsewhere in the sentence (a flip
 * that has nothing to do with the start). Clips missing from either side or
 * that errored are left out.
 */
export function firstWordFlips(
  said: Record<string, string>,
  baseHeard: Record<string, string>,
  otherHeard: Record<string, string>,
  excluded: ReadonlySet<string> = new Set(),
): { fixed: string[]; lost: string[] } {
  const fixed: string[] = [];
  const lost: string[] = [];
  for (const [caseId, s] of Object.entries(said)) {
    if (excluded.has(caseId) || !(caseId in baseHeard) || !(caseId in otherHeard)) continue;
    const before = firstWordHeardRight(s, baseHeard[caseId]);
    const after = firstWordHeardRight(s, otherHeard[caseId]);
    if (!before && after) fixed.push(caseId);
    if (before && !after) lost.push(caseId);
  }
  return { fixed, lost };
}

export interface Flip {
  caseId: string;
  from: string;
  to: string;
}

/**
 * Clips that went from failing to passing ("recovered") and the other way
 * ("broke") between the baseline and another replay of the same clips. Clips
 * missing from either side, or that errored in either, are left out — a clip
 * that never reached the recogniser says nothing about the setting.
 */
export function flips(
  base: Record<string, { outcome: string }>,
  other: Record<string, { outcome: string }>,
  isFailure: (outcome: string) => boolean,
  errored: ReadonlySet<string> = new Set(),
): { recovered: Flip[]; broke: Flip[] } {
  const recovered: Flip[] = [];
  const broke: Flip[] = [];
  for (const [caseId, b] of Object.entries(base)) {
    const o = other[caseId];
    if (!o || errored.has(caseId)) continue;
    const bf = isFailure(b.outcome);
    const of = isFailure(o.outcome);
    if (bf && !of) recovered.push({ caseId, from: b.outcome, to: o.outcome });
    if (!bf && of) broke.push({ caseId, from: b.outcome, to: o.outcome });
  }
  return { recovered, broke };
}

/**
 * A take is "possibly clipped" when its voice begins within this long of the
 * device's dead air ENDING — i.e. the speaker was already talking when the
 * microphone woke. Measured on the local corpus (2026-09-25): every clip starts
 * with about 51 ms of exact zeros, so a raw lead-in near zero never happens,
 * and "lead-in ≤ 20 ms" would never fire; lead-in minus dead air does.
 */
export const CLIPPED_MS = 20;
/** Under this the take has little run-up — the padding question. */
export const SHORT_MS = 300;
/**
 * Dead air this long is worth a mark on the row. Around 50 ms is every clip's
 * normal wake-up, so marking it would put a badge on every line.
 */
export const DEAD_AIR_NOTABLE_MS = 100;

export interface Onset {
  leadIn: number | null;
  deadAir: number | null;
}

/** The voice began as the microphone woke — the signature of a lost first sound. */
export function possiblyClipped(o: Onset): boolean {
  return typeof o.leadIn === "number" && o.leadIn - (o.deadAir ?? 0) <= CLIPPED_MS;
}

export interface LeadStats {
  n: number;
  /** Median lead-in, in ms. */
  median: number | null;
  /** Voice began within CLIPPED_MS of the dead air ending. */
  clipped: number;
  /** Lead-in under SHORT_MS. */
  short: number;
}

export function leadStats(onsets: readonly Onset[]): LeadStats {
  const measured = onsets.filter((o): o is { leadIn: number; deadAir: number | null } => typeof o.leadIn === "number");
  const s = measured.map((o) => o.leadIn).sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  const median = s.length === 0 ? null : s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
  return {
    n: s.length,
    median,
    clipped: measured.filter(possiblyClipped).length,
    short: s.filter((x) => x < SHORT_MS).length,
  };
}
