/**
 * Which recorded set the Replay tab works on.
 *
 * ONE SET PER RUN. Replay once listed every clip in the database and saved the
 * run under whichever seed sorted first, so a second recorded set was silently
 * mixed into the first set's numbers — and labelled as it. A run now covers the
 * clips of one chosen set, and is saved under that set's id.
 */
import { CORPUS_SETS, corpusSet } from "../assist/corpusSets";

/** One recorded set, as the clips route counts it (`?sets=1`). */
export interface RecordedSet {
  seed: string;
  clips: number;
  lastRecordedAt: string | null;
}

/**
 * What the drop-down says. A set in the registry by its name; a seed recorded
 * under an older generator, or by hand, as what it is — it can still be
 * replayed, but nothing new is recorded into it.
 */
export function replaySetLabel(s: RecordedSet): string {
  const known = corpusSet(s.seed);
  const n = `${s.clips} clip${s.clips === 1 ? "" : "s"}`;
  return known ? `${known.label} — ${n}` : `Older recording: ${s.seed} (replay only) — ${n}`;
}

/** Registry sets first, in the registry's order; then older recordings, newest first. */
export function orderReplaySets(sets: readonly RecordedSet[]): RecordedSet[] {
  const rank = (s: RecordedSet) => {
    const i = CORPUS_SETS.findIndex((c) => c.id === s.seed);
    return i < 0 ? CORPUS_SETS.length : i;
  };
  const at = (s: RecordedSet) => (s.lastRecordedAt ? Date.parse(s.lastRecordedAt) || 0 : 0);
  return [...sets].sort((a, b) => rank(a) - rank(b) || at(b) - at(a));
}

/**
 * The set to show: the one already chosen while it still exists, else the
 * preferred one (the current corpus) if it has clips, else the most recently
 * recorded. Null only when nothing has been recorded.
 */
export function chooseReplaySet(
  sets: readonly RecordedSet[],
  current: string | null,
  preferred: string,
): string | null {
  if (current && sets.some((s) => s.seed === current)) return current;
  if (sets.some((s) => s.seed === preferred)) return preferred;
  const at = (s: RecordedSet) => (s.lastRecordedAt ? Date.parse(s.lastRecordedAt) || 0 : 0);
  const latest = [...sets].sort((a, b) => at(b) - at(a))[0];
  return latest?.seed ?? null;
}
