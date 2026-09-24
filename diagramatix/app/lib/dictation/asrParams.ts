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
 * Bias recognition toward the command vocabulary so "lane" ≠ "line", "pool" ≠
 * "poll"/"pull", and so on.
 *
 * NUMBER WORDS ARE DELIBERATELY NOT BOOSTED (Paul, 2026-09-18: "Turn is often
 * heard as Ten"). They were, for exactly one day: `lane:3` was beating "one" on
 * a numbered pick, so the numbers went in to compete with it. That fixed the
 * pick and broke ordinary speech everywhere else — boosting "ten" makes the
 * recogniser reach for it, and "turn on gold flashing" came back as "ten on
 * gold flashing".
 *
 * Numbers matter in exactly one place: while numbered badges are on screen.
 * Deepgram's keyword list is fixed when the socket opens and a pick flow starts
 * long after that, so the elevation cannot live here — it lives in the pick
 * handler instead (`assist/spokenNumber.ts`), which is only consulted while a
 * pick is open and is therefore scoped to precisely when the numbers are being
 * shown. That is also why `lane:3` can stay: the pick handler undoes it, and
 * nothing else in the language needs protecting from it.
 */
export const COMMAND_KEYWORDS: readonly string[] = [
  "lane:3", "sublane:3", "pool:3", "gateway:2", "task:2", "subprocess:2",
  "selected:3", "selection:2",
  "boundary", "connect", "rename", "delete", "compact", "Voice Assist",
];

/**
 * The diagram's own names go in AFTER the command words and **without a boost
 * suffix** — the caller has already filtered them (`diagramKeyterms`), and the
 * cap is applied again here so a careless caller cannot drown the command words.
 */
function appendKeyterms(p: URLSearchParams, keyterms: readonly string[] | undefined): void {
  for (const kw of COMMAND_KEYWORDS) p.append("keywords", kw);
  for (const term of (keyterms ?? []).slice(0, MAX_DIAGRAM_KEYTERMS)) {
    if (term.trim()) p.append("keywords", term.trim());
  }
}

/** The live streaming socket: `wss://api.deepgram.com/v1/listen?…` */
export function liveStreamParams(o: {
  sampleRate: number;
  keyterms?: readonly string[];
}): URLSearchParams {
  const p = new URLSearchParams({
    model: ASR_MODEL,
    encoding: "linear16",
    sample_rate: String(Math.round(o.sampleRate)),
    channels: "1",
    interim_results: "true",
    smart_format: "true",
    punctuate: "true",
    language: ASR_LANGUAGE,
    endpointing: String(ASR_ENDPOINTING_MS),
  });
  appendKeyterms(p, o.keyterms);
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
  /** Command bias — on for a replayed clip, off for a meeting. */
  commandBias?: boolean;
  diarize?: boolean;
  utterances?: boolean;
} = {}): URLSearchParams {
  const p = new URLSearchParams({
    model: ASR_MODEL,
    language: ASR_LANGUAGE,
    smart_format: "true",
    punctuate: "true",
  });
  if (o.diarize) p.append("diarize", "true");
  if (o.utterances) p.append("utterances", "true");
  if (o.commandBias) appendKeyterms(p, o.keyterms);
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
