/**
 * The recogniser's settings, in ONE place.
 *
 * Until this existed the live microphone and the batch transcribe route asked
 * Deepgram for different things — the live socket sent `language=en-AU`, an
 * 800 ms endpoint and a list of keyword boosts; the batch route sent none of
 * them and added `diarize`. That is fine while they do unrelated jobs, and
 * fatal the moment a recorded clip is replayed to measure the live path: the
 * harness would faithfully report the accuracy of a configuration nobody ships.
 *
 * "A rule in two places goes stale in one." This is that rule, extracted.
 *
 * The two long comments below are the most expensive thing in this file. They
 * are the reasoning behind decisions that cost a session each, and they move
 * with the code rather than being orphaned where the code used to be.
 */

export const ASR_MODEL = "nova-2";

/**
 * Australian English. The default "en" leans US and mis-hears AU vowels.
 */
export const ASR_LANGUAGE = "en-AU";

/**
 * Wait this long in silence before finalising a segment, so one paused sentence
 * arrives as fewer, larger finals instead of many fragments to re-stitch.
 */
export const ASR_ENDPOINTING_MS = 800;

// The cap on the diagram's own names belongs to the module that chooses them,
// not here. Re-exported so a caller needs one import, but there is still only
// one number — writing a second `= 60` in this file would have been the exact
// duplication this module exists to remove.
export { MAX_DIAGRAM_KEYTERMS } from "./diagramKeyterms";
import { MAX_DIAGRAM_KEYTERMS } from "./diagramKeyterms";

/**
 * No keyword bias. **This list is empty because it was measured, and every
 * version of it made recognition worse.**
 *
 * ─── The measurement (2026-09-25) ──────────────────────────────────────────
 *
 * 100 recorded commands in Paul's own voice, replayed through Deepgram, scored
 * four ways. Batch leg, same corpus, same everything else:
 *
 *     shipped list (lane:3, selected:3, …)   80%
 *     containers unweighted, with plurals    88%
 *     containers + "safe" verbs, unweighted  89%
 *     NO KEYWORDS AT ALL                     92%
 *
 * ─── Why, mechanically ─────────────────────────────────────────────────────
 *
 * `keywords=lane:3` does not mean "recognise 'lane' when it is spoken". It
 * means "be more willing to OUTPUT 'lane'" — so the model reaches for it, and
 * words that sound nothing like it lose:
 *
 *     "make Sales a script task"   → "LANE sales a script task"   (×3)
 *     "swap Lane 1 with Lane 2"    → "SUBLANE one with lane two"
 *     "delete Review"              → "SELECTED review"
 *     "…labelled Quality Check"    → "…LANE quantity check"
 *     "add two sublanes"           → "add two LANE"  (the singular eats its plural)
 *
 * Dropping the weights did NOT fix it: at weight 1 the container nouns still
 * ate "make", "swap" and "labelled". It is not the weighting, it is the
 * presence of the words.
 *
 * ─── And it never did the job it was added for ─────────────────────────────
 *
 * `lane:3` existed to stop "lane" being heard as "line". With it, "rename
 * lanes" STILL came back "rename lines" — twice. The corpus holds two takes of
 * that sentence, one heard correctly and one not, which says the lane/line
 * confusion is a coin-flip on the Australian FACE vowel rather than something a
 * boost can settle. `language=en-AU`, `en-US`, `en-GB` and `en` all return
 * identical transcripts, so the locale is not the lever either.
 *
 * THE FIX LIVES IN THE PARSER INSTEAD, where it costs nothing and can drag no
 * other word with it (Paul, 2026-09-25: "the word 'line' is never actually
 * likely in a business process context — perhaps all 'lines' should just be
 * interpreted as 'lanes'"). `assist/containerWords.ts` folds line→lane,
 * poll/pull→pool and the rest AFTER recognition. That is the right layer.
 *
 * ─── Before adding anything here again ─────────────────────────────────────
 *
 * Measure it. `/dashboard/admin/voice-assist-test` → Replay → the boost-profile
 * selector runs a candidate list over the recorded corpus in about three
 * minutes. Every entry that was ever in this list was added in good faith to
 * fix a real mis-hear, and every one of them was added while local voice was
 * silently falling back to the BROWSER recogniser — so none had ever met the
 * recogniser it was configuring.
 *
 * (Historical note, kept because it is the same lesson twice: number words were
 * briefly boosted so "one" could win a numbered pick against `lane:3`. It fixed
 * the pick and broke ordinary speech — "turn on gold flashing" came back as
 * "ten on gold flashing". The number elevation lives in `assist/spokenNumber.ts`,
 * consulted only while a pick is on screen.)
 */
export const COMMAND_KEYWORDS: readonly string[] = [
  // DELIBERATELY EMPTY — measured, not assumed. See below.
];

/**
 * The diagram's own names go in AFTER the command words and **without a boost
 * suffix** — the caller has already filtered them (`diagramKeyterms`), and the
 * cap is applied again here so a careless caller cannot drown the command words.
 */
function appendKeyterms(
  p: URLSearchParams,
  keyterms: readonly string[] | undefined,
  /**
   * The command vocabulary to bias toward. Defaults to the shipped list; the
   * harness passes an alternative so a profile can be MEASURED over a recorded
   * corpus rather than argued about (`boostProfiles.ts`). Live voice never
   * passes this — production always gets the shipped list.
   */
  commandWords: readonly string[] = COMMAND_KEYWORDS,
): void {
  for (const kw of commandWords) p.append("keywords", kw);
  for (const term of (keyterms ?? []).slice(0, MAX_DIAGRAM_KEYTERMS)) {
    if (term.trim()) p.append("keywords", term.trim());
  }
}

/** The live streaming socket: `wss://api.deepgram.com/v1/listen?…` */
export function liveStreamParams(o: {
  sampleRate: number;
  keyterms?: readonly string[];
  /** Harness only — an alternative command vocabulary to measure. */
  commandWords?: readonly string[];
}): URLSearchParams {
  const p = new URLSearchParams({
    model: ASR_MODEL,
    encoding: "linear16",
    sample_rate: String(Math.round(o.sampleRate)),
    channels: "1",
    interim_results: "true",
    // NO PROSE FORMATTING ON THE COMMAND PATH (2026-09-25). `smart_format` and
    // `punctuate` exist to make a transcript READABLE — capitals, full stops,
    // tidied numbers. A command parser wants none of that, and the corpus
    // showed the punctuation actively breaking commands: a full stop dropped
    // mid-sentence ("Move pool three. Top boundary down." — the reference then
    // resolved to nothing), a comma LOST from a list of lane names, and commas
    // inserted that made a reference ambiguous. Three of the eight remaining
    // failures were punctuation rather than words.
    //
    // It changes no WORDS: an A/B on the same clip returned the same tokens
    // with and without, differing only in case and stops. Names are capitalised
    // by `capitaliseFirstWord` at apply time, which is where that belongs.
    smart_format: "false",
    punctuate: "false",
    language: ASR_LANGUAGE,
    endpointing: String(ASR_ENDPOINTING_MS),
  });
  appendKeyterms(p, o.keyterms, o.commandWords);
  return p;
}

/**
 * The pre-recorded endpoint: `POST https://api.deepgram.com/v1/listen?…`
 *
 * TWO CALLERS WITH DIFFERENT NEEDS, and the difference is explicit rather than
 * accidental:
 *
 *  • **A meeting recording** (AI Generate) wants `diarize` and `utterances` so
 *    the transcript is speaker-labelled, and wants no command-word bias at all
 *    — biasing a discussion about invoicing toward the word "lane" would be
 *    actively harmful.
 *  • **A replayed command clip** wants the command bias and no diarisation,
 *    because it is one person saying one sentence and the point is to measure
 *    the live configuration.
 *
 * `language=en-AU` now applies to BOTH. That is a deliberate change to the
 * meeting path, which previously sent no language at all: this is an Australian
 * product and the default leans US. It ships named, with its own test, rather
 * than riding along unnoticed inside a refactor.
 */
export function batchParams(o: {
  keyterms?: readonly string[];
  /**
   * PROSE formatting — capitals, full stops, tidied numbers. On for a meeting
   * recording, which a person reads; OFF for a command clip, where a stray full
   * stop splits the sentence and a lost comma breaks a list of names.
   */
  prose?: boolean;
  /** Command bias — on for a replayed clip, off for a meeting. */
  commandBias?: boolean;
  /** Harness only — an alternative command vocabulary to measure. */
  commandWords?: readonly string[];
  diarize?: boolean;
  utterances?: boolean;
} = {}): URLSearchParams {
  const p = new URLSearchParams({
    model: ASR_MODEL,
    language: ASR_LANGUAGE,
    smart_format: o.prose ? "true" : "false",
    punctuate: o.prose ? "true" : "false",
  });
  if (o.diarize) p.append("diarize", "true");
  if (o.utterances) p.append("utterances", "true");
  if (o.commandBias) appendKeyterms(p, o.keyterms, o.commandWords);
  return p;
}

/**
 * A short, stable description of one configuration.
 *
 * **This is the point of the module.** Stamped on every debug session, every
 * recorded clip and every harness run, it makes "this got worse" answerable by
 * looking rather than remembering: a run scored against a different fingerprint
 * is not comparable, and without one nobody would notice the config had moved
 * underneath them.
 *
 * `sample_rate` is excluded — it is a property of the machine's sound card, not
 * of the configuration, and including it would make two runs on two laptops
 * look like a settings change.
 */
export function asrFingerprint(p: URLSearchParams): string {
  const parts: string[] = [];
  const keys = [...new Set([...p.keys()])].sort();
  for (const k of keys) {
    if (k === "sample_rate") continue;
    const all = p.getAll(k);
    parts.push(`${k}=${all.length > 1 ? [...all].sort().join(",") : all[0]}`);
  }
  return parts.join(";");
}
