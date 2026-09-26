/**
 * The voice test SETS — what the Set drop-down on the Test, Record and Replay
 * tabs lists. One registry, in the pattern of the keyword-boost profiles.
 *
 * Paul, 2026-09-26: "Currently the Seed value is "dgx-voice-2026-09-realistic"
 * but there does not appear to be a way to create other sets of commands?"
 * There was not. A seed only shuffles ONE generator's question bank: another
 * seed is another random draw of the same kinds of sentence, and no seed can
 * ask about a command the generator does not know. A set is a different
 * exam; a custom seed is the same exam, reshuffled — and is kept for that.
 *
 * The id of a set is what recorded clips carry in `VoiceClip.corpusSeed`, so
 * Replay can run one set at a time and file the run under it.
 *
 * Pure.
 */
import { generateCases, type GeneratedCase } from "./commandGenerator";
import { DEFAULT_CORPUS_SEED } from "./rng";
import { CATALOG_SET_ID, catalogCases } from "./catalogCorpus";
import type { DiagramElement } from "../diagram/types";

export interface CorpusSet {
  id: string;
  label: string;
  /** What it is for, in a sentence the drop-down shows under it. */
  explain: string;
  /** `generated`: sampled from the generator, `count` of them. `catalog`: a fixed list. */
  kind: "generated" | "catalog";
}

export const CORPUS_SETS: readonly CorpusSet[] = [
  {
    id: DEFAULT_CORPUS_SEED,
    label: "Realistic sample",
    kind: "generated",
    explain:
      "A random draw from the sentence generator, in realistic BPMN names. The same seed always gives the same "
      + "sentences, so a red case can be reached again. Measures the commands people say most, in the way they say them.",
  },
  {
    id: CATALOG_SET_ID,
    label: "Commands popup: every line",
    kind: "catalog",
    explain:
      "Every example on the Commands card, word for word, in the card's order — one case each. Measures how well "
      + "the commands we TELL people to say are heard and understood. A line added to the card joins this set by itself.",
  },
];

/** The drop-down entry that reveals a free seed box: the realistic generator, reshuffled. */
export const CUSTOM_SET = "__custom__";

export function corpusSet(id: string): CorpusSet | undefined {
  return CORPUS_SETS.find((s) => s.id === id);
}

/**
 * The cases of a set. A generated set (or a custom seed, which is the
 * generator with another seed) takes `count` and optional families; the
 * popup set is always all of its lines.
 */
export function casesForSet(
  setOrSeed: string,
  opts: { count: number; world: readonly DiagramElement[]; families?: readonly string[] },
): GeneratedCase[] {
  if (setOrSeed === CATALOG_SET_ID) {
    const all = catalogCases();
    return opts.families?.length ? all.filter((c) => opts.families!.includes(c.family)) : all;
  }
  return generateCases({ seed: setOrSeed, count: opts.count, world: opts.world, ...(opts.families ? { families: opts.families } : {}) });
}

/** A clip already recorded for this case — the same id AND the same sentence (a reworded line is a new case). */
export function isRecorded(c: GeneratedCase, recorded: ReadonlyArray<{ caseId: string; utterance: string }>): boolean {
  return recorded.some((r) => r.caseId === c.id && r.utterance === c.utterance);
}

/**
 * Where a recording session resumes: the first case, in the set's own order,
 * with no clip yet. `cases.length` when every case has one.
 */
export function resumeAt(cases: readonly GeneratedCase[], recorded: ReadonlyArray<{ caseId: string; utterance: string }>): number {
  const i = cases.findIndex((c) => !isRecorded(c, recorded));
  return i < 0 ? cases.length : i;
}

/** The family names a set's results table can have. */
export function familiesForSet(setOrSeed: string, generatorFamilies: readonly string[]): string[] {
  if (setOrSeed === CATALOG_SET_ID) return [...new Set(catalogCases().map((c) => c.family))];
  return [...generatorFamilies];
}
