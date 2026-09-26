/**
 * Which recorded set the Replay tab works on.
 *
 * ONE SET PER RUN. Replay once listed every clip in the database and saved the
 * run under whichever seed sorted first, so a second recorded set was silently
 * mixed into the first set's numbers — and labelled as it. A run now covers the
 * clips of one chosen set, and is saved under that set's id.
 */

/** One recorded set, as the clips route counts it (`?sets=1`). */
export interface RecordedSet {
  seed: string;
  clips: number;
  lastRecordedAt: string | null;
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
