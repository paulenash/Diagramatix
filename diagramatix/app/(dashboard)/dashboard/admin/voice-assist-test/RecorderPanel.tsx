"use client";
/**
 * The teleprompter: read a generated sentence, record it, keep or retake.
 *
 * KEYBOARD ONLY, on purpose. Reaching for a mouse between takes moves your head
 * off the microphone and changes what the recogniser hears, which is the one
 * variable this whole corpus exists to hold still. Space records, Enter keeps,
 * R retakes, S skips.
 *
 * ONE POST PER ACCEPTED TAKE. Twenty minutes of reading is the expensive input
 * in this feature; a crash at clip seventy must cost nothing.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { GeneratedCase } from "@/app/lib/assist/commandGenerator";
import { fixtureElements } from "@/app/lib/assist/commandFixture";
import { DEFAULT_CORPUS_SEED } from "@/app/lib/assist/rng";
import { CORPUS_SETS, CUSTOM_SET, corpusSet, casesForSet, resumeAt, isRecorded } from "@/app/lib/assist/corpusSets";
import { useClipRecorder } from "@/app/lib/dictation/useClipRecorder";
import { SILENT_TAKE_PEAK } from "@/app/lib/dictation/wav";
import { asrFingerprint, liveStreamParams } from "@/app/lib/dictation/asrParams";

export function RecorderPanel() {
  /** A set from the registry, or CUSTOM_SET with a seed typed below. The id is what each clip carries. */
  const [setId, setSetId] = useState<string>(DEFAULT_CORPUS_SEED);
  const [customSeed, setCustomSeed] = useState("");
  const seed = setId === CUSTOM_SET ? (customSeed.trim() || DEFAULT_CORPUS_SEED) : setId;
  const fixedSet = corpusSet(setId)?.kind === "catalog";
  /** Cases of this set already recorded (same case id AND sentence) when the session began. */
  const [alreadyRecorded, setAlreadyRecorded] = useState(0);
  const [count, setCount] = useState(100);
  const [script, setScript] = useState<GeneratedCase[] | null>(null);
  const [at, setAt] = useState(0);
  const [saved, setSaved] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rec = useClipRecorder();

  const current = script?.[at] ?? null;
  const done = script ? Object.keys(saved).length : 0;

  // The configuration these clips are being recorded under, so a later run can
  // tell whether the settings moved rather than the voice.
  const fingerprint = useMemo(
    () => asrFingerprint(liveStreamParams({ sampleRate: 48000 })),
    [],
  );

  const begin = useCallback(async () => {
    // Say what went wrong, on the screen. Generating the script is the one step
    // between pressing the button and having something to read, and a silent
    // failure here leaves a teleprompter with working buttons and no sentence —
    // which is indistinguishable, to the person sitting there, from the feature
    // being broken.
    try {
      const cases = casesForSet(seed, { count, world: fixtureElements() });
      if (cases.length === 0) {
        setErr("That set produced no sentences. Try the realistic sample.");
        return;
      }
      // RESUME, as the clips route has always promised: a crash at clip seventy
      // must cost nothing. Start at the first case in the SET'S OWN order that
      // has no clip with its id and sentence — the listing's order sorts ids as
      // strings (#1, #10, #11, #2…) and cannot be used.
      let recorded: Array<{ caseId: string; utterance: string }> = [];
      const res = await fetch(`/api/admin/voice-assist-test/clips?seed=${encodeURIComponent(seed)}`, { cache: "no-store" });
      if (res.ok) recorded = (await res.json()).clips ?? [];
      const start = resumeAt(cases, recorded);
      setAlreadyRecorded(cases.filter((c) => isRecorded(c, recorded)).length);
      setScript(cases);
      setAt(Math.min(start, cases.length - 1));
      setSaved({});
      setErr(start >= cases.length ? "Every sentence in this set has been recorded — replay it on the Replay tab." : null);
    } catch (e) {
      setErr(`Could not build the script: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }, [seed, count]);

  const save = useCallback(async () => {
    if (!current || !rec.clip) return;
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("audio", new Blob([rec.clip.wav], { type: "audio/wav" }), `${current.id}.wav`);
      fd.append("corpusSeed", seed);
      fd.append("caseId", current.id);
      fd.append("family", current.family);
      fd.append("utterance", current.utterance);
      fd.append("expectedOps", JSON.stringify(current.ops));
      fd.append("sampleRate", String(rec.clip.sampleRate));
      fd.append("durationMs", String(rec.clip.durationMs));
      fd.append("peakLevel", String(rec.clip.peak));
      fd.append("asrFingerprint", fingerprint);
      const res = await fetch("/api/admin/voice-assist-test/clips", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `save failed (${res.status})`);
      const j = await res.json();
      setSaved((s) => ({ ...s, [current.id]: j.takeNumber }));
      rec.discard();
      setAt((i) => Math.min((script?.length ?? 1) - 1, i + 1));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "could not save that take");
    } finally {
      setBusy(false);
    }
  }, [current, rec, seed, fingerprint, script]);

  const skip = useCallback(() => {
    rec.discard();
    setAt((i) => Math.min((script?.length ?? 1) - 1, i + 1));
  }, [rec, script]);

  useEffect(() => {
    if (!script) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key === " ") {
        e.preventDefault();
        if (rec.recording) rec.stop(); else void rec.start();
      } else if (e.key === "Enter" && rec.clip && !rec.clip.silent) {
        e.preventDefault(); void save();
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault(); rec.discard(); void rec.start();
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault(); skip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [script, rec, save, skip]);

  if (!script) {
    return (
      <div className="border border-gray-200 rounded p-4">
        <p className="text-xs text-gray-600 mb-3 max-w-2xl">
          Read each sentence aloud once. The clips are stored as <strong>raw 16-bit PCM</strong> — the same bytes the live
          microphone sends — so a replay measures the pipeline you actually ship, not a compressed copy of it.
          About <strong>20 minutes</strong> for a hundred. <strong>Space</strong> to record and stop, <strong>Enter</strong> to keep,
          <strong> R</strong> to retake, <strong>S</strong> to skip — keyboard only, so your head never leaves the microphone.
        </p>
        <div className="flex items-end gap-3">
          <label className="text-xs text-gray-700">
            <div className="mb-0.5">Set</div>
            <select value={setId} onChange={(e) => setSetId(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-xs"
              title={corpusSet(setId)?.explain ?? "The realistic generator, reshuffled by a seed of your own"}>
              {CORPUS_SETS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              <option value={CUSTOM_SET}>Custom seed…</option>
            </select>
          </label>
          {setId === CUSTOM_SET && (
            <label className="text-xs text-gray-700">
              <div className="mb-0.5">Seed</div>
              <input value={customSeed} onChange={(e) => setCustomSeed(e.target.value)} placeholder={DEFAULT_CORPUS_SEED}
                className="border border-gray-300 rounded px-2 py-1 text-xs w-56" />
            </label>
          )}
          <label className="text-xs text-gray-700">
            <div className="mb-0.5">Sentences</div>
            <input type="number" min={1} max={500} value={count} disabled={fixedSet}
              title={fixedSet ? "This set is a fixed list — every line, once" : undefined}
              onChange={(e) => setCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
              className="border border-gray-300 rounded px-2 py-1 text-xs w-24 disabled:opacity-50" />
          </label>
          <button onClick={() => { void begin(); }} className="text-xs text-white bg-purple-600 hover:bg-purple-700 rounded px-3 py-1.5">Start recording session</button>
        </div>
        {corpusSet(setId) && <p className="mt-2 text-[11px] text-gray-500 max-w-2xl">{corpusSet(setId)!.explain}</p>}
        {err && <p className="mt-2 text-xs text-red-700">{err}</p>}
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded p-4">
      <div className="flex items-center gap-3 mb-4 text-xs text-gray-600">
        <span><strong>{at + 1}</strong> / {script.length}</span>
        <span className="text-green-700">{done} kept</span>
        {alreadyRecorded > 0 && <span className="text-gray-500" title="Clips of this set recorded in earlier sessions — the session resumed after them">{alreadyRecorded} already recorded</span>}
        <span className="flex-1" />
        {err && <span className="text-red-600">{err}</span>}
        <button onClick={() => setScript(null)} className="px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-50">End session</button>
      </div>

      <div className="min-h-[7rem] flex items-center justify-center text-center px-4 mb-4">
        {current
          ? <p className="text-2xl text-gray-800 leading-snug">{current.utterance}</p>
          : <p className="text-sm text-red-700">No sentence at position {at + 1} of {script.length}. End the session and start it again.</p>}
      </div>

      {/* The level meter. A take that never moves it is the session-losing failure. */}
      <div className="h-2 bg-gray-100 rounded overflow-hidden mb-3">
        <div className={`h-full transition-[width] duration-75 ${rec.level > SILENT_TAKE_PEAK ? "bg-green-500" : "bg-gray-300"}`}
          style={{ width: `${Math.min(100, rec.level)}%` }} />
      </div>

      <div className="flex items-center gap-2 text-xs">
        <button onClick={() => { if (rec.recording) rec.stop(); else void rec.start(); }}
          className={`px-3 py-1.5 rounded text-white ${rec.recording ? "bg-red-500 hover:bg-red-600" : "bg-purple-600 hover:bg-purple-700"}`}>
          {rec.recording ? "■ Stop (space)" : "● Record (space)"}
        </button>
        {rec.clip && (
          <>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio src={rec.clip.url} controls className="h-8" />
            <span className="text-gray-500">{(rec.clip.durationMs / 1000).toFixed(1)}s · peak {rec.clip.peak}</span>
            <button onClick={() => { void save(); }} disabled={busy || rec.clip.silent}
              className="px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-40">
              {busy ? "Saving…" : "Keep (enter)"}
            </button>
            <button onClick={() => { rec.discard(); void rec.start(); }} className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-50">Retake (R)</button>
          </>
        )}
        <button onClick={skip} className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 text-gray-500">Skip (S)</button>
        {saved[current?.id ?? ""] && <span className="text-green-700">kept as take {saved[current!.id]}</span>}
      </div>

      {/* THE REFUSAL. A silent take is the likeliest way to lose an hour, and it
          looks exactly like a good one until the replay. */}
      {rec.clip?.silent && (
        <p className="mt-2 text-xs text-red-700">
          Nothing was heard on that take (peak {rec.clip.peak}). The microphone may be muted or the wrong device selected —
          this one cannot be kept. Press <strong>R</strong> to try again.
        </p>
      )}
      {rec.error && <p className="mt-2 text-xs text-red-700">{rec.error}</p>}
    </div>
  );
}
