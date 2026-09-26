"use client";
/**
 * Replay the recorded corpus through the real recogniser, and score it.
 *
 * THE STREAM LEG IS THE REAL TEST. It pushes each clip back through the same
 * WebSocket, with the same settings, stitched by the same policy — so what it
 * measures is the pipeline that ships. It is as slow as the recording, because
 * Deepgram's endpointing is wall-clock and rushing the audio would hide the
 * fragment behaviour entirely.
 *
 * The batch leg is a cheap fallback, and the panel prints what it cannot see
 * next to its number. A green batch result must never be read as a green live
 * result, and the only reliable way to prevent that is to say so on the screen
 * rather than in a document nobody opens.
 *
 * WHAT IS MEASURED (2026-09-25). A prod replay failed 12 of 100, seven of them
 * on the FIRST word, four of those on sentences that passed on another take.
 * So a run can replay each clip as recorded, with its start padded, with
 * punctuation on — or all three in one pass, reporting per clip what each
 * change recovered and broke (`replayCompare.ts`). Every row carries how much
 * silence came before the voice (`wavTools.ts`).
 */
import { useCallback, useEffect, useState } from "react";
import { scoreCase, summarise, isFailure, isJudged, type CaseResult } from "@/app/lib/assist/commandScore";
import { fixtureElements } from "@/app/lib/assist/commandFixture";
import { replayClip } from "@/app/lib/dictation/replayClip";
import { BOOST_PROFILES, boostProfile, DEFAULT_BOOST_PROFILE, type BoostProfileId } from "@/app/lib/dictation/boostProfiles";
import { leadInMs, deadAirMs, padWavStart } from "@/app/lib/dictation/wavTools";
import {
  MEASURE_MODES, VARIANTS, variantsFor, firstWordHeardRight, firstWordFlips, flips, leadStats, possiblyClipped,
  CLIPPED_MS, SHORT_MS, DEAD_AIR_NOTABLE_MS,
  type MeasureMode, type Variant, type VariantKey, type Onset,
} from "@/app/lib/dictation/replayCompare";
import type { GeneratedCase } from "@/app/lib/assist/commandGenerator";
import { DEFAULT_CORPUS_SEED } from "@/app/lib/assist/rng";
import { OUTCOME_MEANS } from "./outcomeStyle";
import { chooseReplaySet, orderReplaySets, replaySetLabel, type RecordedSet } from "@/app/lib/dictation/replaySets";
import { CATALOG_SET_ID, catalogCases } from "@/app/lib/assist/catalogCorpus";
import { parseCommand } from "@/app/lib/assist/commandGrammar";

interface ClipRow {
  id: string;
  corpusSeed: string;
  caseId: string;
  family: string;
  utterance: string;
  /** The ops this clip was recorded against — carried ON the clip, not looked up. */
  expectedOps: string;
  takeNumber: number;
  durationMs: number;
  peakLevel: number;
}

type Leg = "stream" | "batch";

const BATCH_CAVEATS = [
  "segmentation — live, a command split across two finals arrives as TWO utterances; batch sees the whole clip at once and cannot show it",
  "streaming vs pre-recorded — Deepgram does not promise identical text from the two endpoints at the same model",
  "the command queue — live commands apply against the state the previous one left; batch scores each in isolation",
];

/** What a run was, fixed when it starts — so the screen never labels old numbers with new settings. */
interface RunLabel {
  /** The one recorded set this run replays, and is saved under. */
  seed: string;
  leg: Leg;
  profileId: BoostProfileId;
  mode: MeasureMode;
  variants: Variant[];
}

type ByVariant<T> = Partial<Record<VariantKey, Record<string, T>>>;

export function ReplayPanel() {
  const [sets, setSets] = useState<RecordedSet[] | null>(null);
  const [seed, setSeed] = useState<string | null>(null);
  const [clips, setClips] = useState<ClipRow[] | null>(null);
  const [leg, setLeg] = useState<Leg>("stream");
  const [profileId, setProfileId] = useState<BoostProfileId>(DEFAULT_BOOST_PROFILE);
  const [mode, setMode] = useState<MeasureMode>("recorded");
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<ByVariant<CaseResult>>({});
  const [heard, setHeard] = useState<ByVariant<string>>({});
  /** Clips whose replay never reached the recogniser, per variant — excluded from every comparison. */
  const [errored, setErrored] = useState<Partial<Record<VariantKey, string[]>>>({});
  /** What the script asked for, so a failure row can show both lines. */
  const [said, setSaid] = useState<Record<string, string>>({});
  const [onset, setOnset] = useState<Record<string, Onset>>({});
  const [label, setLabel] = useState<RunLabel | null>(null);
  /** Clips whose AUDIO could not be fetched — they are in no variant, so the totals shrink; this says by how many. */
  const [skipped, setSkipped] = useState<string[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  /** Popup-set clips whose sentence parses differently today from when it was recorded. */
  const [moved, setMoved] = useState<string[]>([]);

  /** The recorded sets, then the clips of the chosen one — never every clip at once. */
  const load = useCallback(async (want: string | null) => {
    try {
      const setsRes = await fetch("/api/admin/voice-assist-test/clips?sets=1", { cache: "no-store" });
      if (!setsRes.ok) throw new Error(`could not list the recorded sets (${setsRes.status})`);
      const found = orderReplaySets((await setsRes.json()).sets as RecordedSet[]);
      setSets(found);
      const chosen = chooseReplaySet(found, want, DEFAULT_CORPUS_SEED);
      setSeed(chosen);
      if (!chosen) { setClips([]); return; }
      const res = await fetch(`/api/admin/voice-assist-test/clips?seed=${encodeURIComponent(chosen)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`could not list clips (${res.status})`);
      setClips((await res.json()).clips as ClipRow[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "could not list clips");
      setClips([]);
    }
  }, []);
  useEffect(() => { void load(null); }, [load]);

  /** Latest take per case — a retake exists because the earlier one was worse. */
  const latest = (all: ClipRow[]): ClipRow[] => {
    const best = new Map<string, ClipRow>();
    for (const c of all) {
      const k = `${c.corpusSeed}|${c.caseId}`;
      const prev = best.get(k);
      if (!prev || c.takeNumber > prev.takeNumber) best.set(k, c);
    }
    return [...best.values()];
  };

  const run = useCallback(async () => {
    if (!clips?.length || !seed) return;
    // Everything the run depends on is fixed here, so a control touched
    // afterwards can neither change the run nor relabel its results.
    const runLabel: RunLabel = { seed, leg, profileId, mode, variants: variantsFor(mode, leg) };
    setLabel(runLabel);
    setRunning(true);
    setErr(null);
    setSaved(null);
    setRows({});
    setHeard({});
    setErrored({});
    setSaid({});
    setOnset({});
    setSkipped([]);
    setMoved([]);
    // A popup line's context (the selection it needs, or why only its parse
    // can be judged) comes from the set itself, keyed by case id.
    const popupContext = new Map(catalogCases().map((c) => [c.id, c] as const));
    const els = fixtureElements();
    // The listing was asked for this set only; the filter is the belt to that
    // braces, so a stale listing can never put another set's clip in the run.
    const todo = latest(clips.filter((c) => c.corpusSeed === runLabel.seed));
    setProgress({ done: 0, total: todo.length });
    const started = Date.now();
    const collected: Partial<Record<VariantKey, Array<CaseResult & Onset>>> = {};
    /** Per variant, clips whose replay never reached the recogniser — left out of the run, named in its notes. */
    const failedReplays: Partial<Record<VariantKey, string[]>> = {};
    const fingerprints: Partial<Record<VariantKey, string>> = {};

    /** One clip, one way: the transcript, any transport error, and the fingerprint actually used. */
    const replayOnce = async (wav: ArrayBuffer, v: Variant) => {
      const sent = v.padMs ? padWavStart(wav, v.padMs) : wav;
      let transcript = "";
      let replayError: string | undefined;
      let fingerprint: string | undefined;
      if (runLabel.leg === "stream") {
        const r = await replayClip(sent, { commandWords: boostProfile(runLabel.profileId).keywords });
        // The stitched utterances ARE the answer: if the buffer would have
        // produced two commands, the first one is what the user's sentence
        // actually became, and scoring the concatenation would hide it.
        transcript = r.utterances[0] ?? "";
        replayError = r.error;
        fingerprint = r.fingerprint;
      } else {
        const res = await fetch(
          `/api/admin/voice-assist-test/transcribe-clip?profile=${runLabel.profileId}${v.punctuate ? "&punctuate=1" : ""}`,
          { method: "POST", headers: { "Content-Type": "audio/wav" }, body: sent },
        );
        const j = await res.json().catch(() => ({}));
        transcript = typeof j.transcript === "string" ? j.transcript : "";
        fingerprint = typeof j.fingerprint === "string" ? j.fingerprint : undefined;
        if (!res.ok) replayError = j.error ?? `transcribe failed (${res.status})`;
      }
      return { transcript, replayError, fingerprint };
    };

    for (const clip of todo) {
      try {
        const audioRes = await fetch(`/api/admin/voice-assist-test/clips/${clip.id}`, { cache: "no-store" });
        if (!audioRes.ok) throw new Error(`clip ${clip.caseId}: ${audioRes.status}`);
        const wav = await audioRes.arrayBuffer();
        const clipOnset: Onset = { leadIn: leadInMs(wav), deadAir: deadAirMs(wav) };
        setOnset((p) => ({ ...p, [clip.caseId]: clipOnset }));
        setSaid((p) => ({ ...p, [clip.caseId]: clip.utterance }));

        // The clip carries its own sentence and its own expected ops — that is
        // exactly why they are denormalised onto it, and why a generator change
        // cannot orphan a corpus that took twenty minutes to record.
        //
        // THE POPUP SET IS A HEARING TEST. Its answer is what the SENTENCE
        // parses to today, so a clip measures the ear — did "heard" parse like
        // "said"? — however the grammar has moved since it was recorded. A
        // move is noted, never hidden.
        const recordedOps = JSON.parse(clip.expectedOps || "[]");
        const ctx = runLabel.seed === CATALOG_SET_ID ? popupContext.get(clip.caseId) : undefined;
        const nowOps = runLabel.seed === CATALOG_SET_ID ? (parseCommand(clip.utterance) ?? []) : recordedOps;
        if (runLabel.seed === CATALOG_SET_ID && JSON.stringify(nowOps) !== JSON.stringify(recordedOps)) {
          setMoved((p) => (p.includes(clip.caseId) ? p : [...p, clip.caseId]));
        }
        const asCase: GeneratedCase = {
          id: clip.caseId,
          family: clip.family || "recorded",
          utterance: clip.utterance,
          ops: nowOps,
          refs: {},
          ...(ctx?.needsSelection ? { needsSelection: ctx.needsSelection } : {}),
          ...(ctx?.parseOnly ? { parseOnly: ctx.parseOnly } : {}),
        };

        for (const v of runLabel.variants) {
          // Each replay stands alone: a network error on the padded pass must
          // not throw away the punctuated one, and must not make the variants'
          // totals disagree.
          const { transcript, replayError, fingerprint } = await replayOnce(wav, v).catch((e: unknown) => ({
            transcript: "",
            replayError: e instanceof Error ? `${e.message} (the request never completed)` : "the request never completed",
            fingerprint: undefined as string | undefined,
          }));
          if (fingerprint && !fingerprints[v.key]) fingerprints[v.key] = fingerprint;
          const result = scoreCase(asCase, replayError ? "" : transcript, els);
          // A replay that never reached the recogniser is not a mishear: it is
          // kept off the pass rate and out of the saved run, and named instead.
          if (replayError) (failedReplays[v.key] ??= []).push(clip.caseId);
          else (collected[v.key] ??= []).push({ ...result, ...clipOnset });
          // MERGE BY caseId, never by index: clips can fail or be skipped, and an
          // index-keyed table would land every later result on the wrong row —
          // the bug MdDiagramsClient documents.
          setRows((p) => ({ ...p, [v.key]: { ...p[v.key], [clip.caseId]: result } }));
          setHeard((p) => ({ ...p, [v.key]: { ...p[v.key], [clip.caseId]: replayError ? `⚠ ${replayError}` : transcript } }));
          if (replayError) setErrored((p) => ({ ...p, [v.key]: [...(p[v.key] ?? []), clip.caseId] }));
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "a clip failed");
        setSkipped((p) => [...p, clip.caseId]);
      } finally {
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    }

    setRunning(false);

    // Keep each replay as its own run, so each can be compared with the next —
    // with the fingerprint the recogniser was ACTUALLY given, and what the
    // fingerprint cannot hold (padding, the comparison) written in the notes.
    let kept = 0;
    for (const v of runLabel.variants) {
      const results = collected[v.key] ?? [];
      if (!results.length) continue;
      try {
        const s = summarise(results);
        const lostReplays = failedReplays[v.key] ?? [];
        const notes = [
          v.label,
          runLabel.variants.length > 1 ? `one part of a comparison (${runLabel.variants.map((x) => x.label).join(" / ")})` : "",
          lostReplays.length ? `${lostReplays.length} replay${lostReplays.length === 1 ? "" : "s"} never reached the recogniser and ${lostReplays.length === 1 ? "is" : "are"} left out: ${lostReplays.join(", ")}` : "",
        ].filter(Boolean).join("; ");
        const res = await fetch("/api/admin/voice-assist-test/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leg: runLabel.leg, corpusSeed: runLabel.seed, boostProfile: runLabel.profileId,
            asrFingerprint: fingerprints[v.key] ?? null,
            notes,
            total: s.total, passed: s.passed, failed: s.failed,
            fallbackRate: s.fallbackRate, outcomes: s.byOutcome, families: s.byFamily,
            results, durationMs: Date.now() - started,
          }),
        });
        if (res.ok) kept += 1;
      } catch { /* the numbers are on screen either way */ }
    }
    setSaved(kept ? `${kept === 1 ? "run" : `${kept} runs`} saved` : null);
  }, [clips, seed, leg, profileId, mode]);

  // ── What the screen shows ──────────────────────────────────────────────────
  const shown: RunLabel = label ?? { seed: seed ?? "", leg, profileId, mode, variants: variantsFor(mode, leg) };
  const baseKey: VariantKey = shown.variants[0]?.key ?? "recorded";
  const base = rows[baseKey] ?? {};
  const baseHeard = heard[baseKey] ?? {};
  const baseErrored = new Set(errored[baseKey] ?? []);
  /** Scored clips only — a replay that never reached the recogniser is not a mishear. */
  const scored = (key: VariantKey) => Object.values(rows[key] ?? {}).filter((r) => !(errored[key] ?? []).includes(r.caseId));
  const results = scored(baseKey);
  const summary = results.length ? summarise(results) : null;
  const erroredBase = Object.values(base).filter((r) => baseErrored.has(r.caseId));
  /** The notes and caveats describe the RESULTS on screen, not the controls set up for the next run. */
  const captionLeg: Leg = summary ? shown.leg : leg;

  // The onset split that tests the clipping theory: first word heard WRONG vs
  // RIGHT (not fail vs pass), leaving out clips that never reached the recogniser.
  const leadsWhere = (right: boolean) =>
    results
      .filter((r) => firstWordHeardRight(said[r.caseId] ?? "", baseHeard[r.caseId] ?? "") === right)
      .map((r) => onset[r.caseId])
      .filter((x): x is Onset => !!x);
  const wrongFirst = leadStats(leadsWhere(false));
  const rightFirst = leadStats(leadsWhere(true));
  const deadAirs = results.map((r) => onset[r.caseId]?.deadAir).filter((x): x is number => typeof x === "number");
  const typicalDeadAir = leadStats(deadAirs.map((d) => ({ leadIn: d, deadAir: 0 }))).median;
  const longDeadAir = deadAirs.filter((d) => d > DEAD_AIR_NOTABLE_MS);

  const lines = shown.variants.flatMap((v) => {
    const r = rows[v.key];
    const ok = scored(v.key);
    if (!r || !ok.length) return [];
    const s = summarise(ok);
    const excluded = new Set([...(errored[v.key] ?? []), ...baseErrored]);
    const f = v.key === baseKey ? null : flips(base, r, (o) => isFailure(o as CaseResult["outcome"]), excluded);
    const fw = v.key === baseKey ? null : firstWordFlips(said, baseHeard, heard[v.key] ?? {}, excluded);
    return [{ v, passed: s.passed, total: s.total, stale: s.stale, errored: (errored[v.key] ?? []).length, flips: f, firstWord: fw }];
  });
  const staleBase = results.filter((r) => !isJudged(r.outcome));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        {/* ONE SET PER RUN — a second recorded set used to be mixed into the
            first set's numbers, and the run filed under whichever sorted first. */}
        <label className="flex items-center gap-1 text-xs">
          <span className="font-medium text-gray-700">Set:</span>
          <select value={seed ?? ""} disabled={running || !sets?.length}
            onChange={(e) => { setRows({}); setHeard({}); setLabel(null); void load(e.target.value); }}
            className="border border-gray-300 rounded px-2 py-1 text-xs bg-white disabled:opacity-50">
            {!sets?.length && <option value="">nothing recorded</option>}
            {sets?.map((s) => (
              <option key={s.seed} value={s.seed} title={s.seed}>{replaySetLabel(s)}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1 text-xs">
          {(["stream", "batch"] as const).map((l) => (
            <button key={l} onClick={() => setLeg(l)} disabled={running}
              className={`px-2 py-1 rounded border ${leg === l ? "bg-purple-600 text-white border-purple-600" : "border-gray-300 hover:bg-gray-50"} disabled:opacity-50`}>
              {l === "stream" ? "Stream (the real test)" : "Batch (cheap fallback)"}
            </button>
          ))}
        </div>
        <button onClick={() => { void run(); }} disabled={running || !clips?.length}
          className="text-xs text-white bg-purple-600 hover:bg-purple-700 rounded px-3 py-1.5 disabled:opacity-50">
          {running ? `Replaying ${progress.done}/${progress.total}…` : "Replay corpus"}
        </button>
        <button onClick={() => { void load(seed); }} disabled={running} className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50">Refresh clips</button>
        {clips && <span className="text-xs text-gray-500">{latest(clips).length} clips</span>}
        {saved && <span className="text-xs text-green-700">{saved}</span>}
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>

      {/* THE BOOST PROFILE, with its reasoning attached.
          The shipped list had never been tested against real audio until this
          corpus existed, and the first replay found it helping one clip and
          hurting eight. Rather than pick a replacement by argument, each
          profile can be run over the same hundred clips and compared. */}
      <div className="mb-3 p-2 border border-gray-200 rounded bg-gray-50">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="text-xs font-medium text-gray-700">Keyword boosts:</span>
          <select value={profileId} disabled={running}
            onChange={(e) => setProfileId(e.target.value as BoostProfileId)}
            className="border border-gray-300 rounded px-2 py-1 text-xs bg-white disabled:opacity-50">
            {BOOST_PROFILES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <span className="text-[11px] text-gray-500">
            {boostProfile(profileId).keywords.length === 0
              ? "no keywords sent"
              : `${boostProfile(profileId).keywords.length} keywords`}
          </span>
        </div>
        <p className="text-[11px] text-gray-600 leading-relaxed">{boostProfile(profileId).explain}</p>
        <p className="text-[11px] text-purple-700 mt-1 leading-relaxed">
          <strong>Watch for:</strong> {boostProfile(profileId).watch}
        </p>
        {boostProfile(profileId).keywords.length > 0 && (
          <p className="text-[10px] text-gray-400 mt-1 font-mono break-words">
            {boostProfile(profileId).keywords.join("  ")}
          </p>
        )}
      </div>

      {/* WHAT TO MEASURE. One choice, not three switches: a run with padding
          AND punctuation cannot say which of them moved a clip. */}
      <div className="mb-3 p-2 border border-gray-200 rounded bg-gray-50 text-xs max-w-3xl">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="font-medium text-gray-700">Measure:</span>
          <select value={mode} disabled={running} onChange={(e) => setMode(e.target.value as MeasureMode)}
            className="border border-gray-300 rounded px-2 py-1 bg-white disabled:opacity-50">
            {MEASURE_MODES.map((m) => (
              <option key={m.mode} value={m.mode} disabled={m.batchOnly && leg !== "batch"}>
                {m.label}{m.batchOnly && leg !== "batch" ? " — batch only" : ""}
              </option>
            ))}
          </select>
        </div>
        <ul className="list-disc ml-5 space-y-0.5 text-[11px] text-gray-600">
          <li><strong>Padded start</strong> adds {VARIANTS.padded.padMs} ms of silence before each clip. If first words come back,
            the recordings were complete and the recogniser wanted a run-up. If not, the first word was lost or recorded too
            quietly — listen to the failing clips.</li>
          <li><strong>Punctuation on</strong> (batch) turns full stops and commas back on, formatting still off. They have been
            off since 25 September, which is why “Billing Team, Quality Assurance and Support Desk” arrives with no commas.
            Live voice is not changed.</li>
          <li><strong>All three</strong> replays each clip three ways and lists what each change recovered and broke.</li>
        </ul>
        {mode !== "recorded" && variantsFor(mode, leg)[0].key === "recorded" && variantsFor(mode, leg).length === 1 && (
          <p className="mt-1 text-amber-800">That needs the batch leg; on this leg the run is “as recorded”.</p>
        )}
      </div>

      {captionLeg === "stream" ? (
        <p className="text-xs text-gray-600 mb-3 max-w-3xl">
          Each clip goes back through the <strong>same socket with the same settings</strong>, paced in real time and stitched
          by the same silence policy — so this measures the pipeline you ship. It takes about as long as the recording did.
        </p>
      ) : (
        <div className="mb-3 p-2 border border-amber-200 bg-amber-50 rounded text-xs text-amber-900 max-w-3xl">
          <strong>A green number here is not a green live number.</strong> Batch replay cannot see:
          <ul className="list-disc ml-5 mt-1 space-y-0.5">
            {BATCH_CAVEATS.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      )}

      {!clips?.length && clips !== null && (
        <p className="text-sm text-gray-500">
          No clips recorded yet. Use the <strong>Record clips</strong> tab first — there is nothing to replay until somebody reads the script.
        </p>
      )}

      {summary && (
        <>
          <p className="text-[11px] text-gray-500 mb-1">
            These results: set “{shown.seed}” · {shown.leg} leg · boosts “{boostProfile(shown.profileId).label}” · {shown.variants.map((v) => v.label).join(" + ")}
          </p>
          <div className="mb-2 space-y-0.5">
            {lines.map((l) => (
              <div key={l.v.key} className="text-sm">
                <span className={l.v.key === baseKey ? "font-semibold text-gray-800" : "text-gray-800"}>
                  {l.v.label}: {l.passed}/{l.total} passed
                  {l.total > 0 && <span className="text-gray-400 font-normal"> ({Math.round((l.passed / l.total) * 100)}%)</span>}
                </span>
                {l.errored > 0 && <span className="text-xs text-amber-700 ml-2">{l.errored} errored, left out</span>}
                {l.stale > 0 && <span className="text-xs text-gray-500 ml-2" title={OUTCOME_MEANS["stale-clip"]}>{l.stale} stale, not counted</span>}
                {l.flips && l.firstWord && (
                  <span className="text-xs ml-2">
                    <span className="text-green-700">first word fixed {l.firstWord.fixed.length}</span>
                    {" · "}
                    <span className={l.firstWord.lost.length ? "text-red-700 font-semibold" : "text-gray-500"}>first word lost {l.firstWord.lost.length}</span>
                    {" · "}
                    <span className="text-green-700">sentence recovered {l.flips.recovered.length}</span>
                    {" · "}
                    <span className={l.flips.broke.length ? "text-red-700 font-semibold" : "text-gray-500"}>sentence broke {l.flips.broke.length}</span>
                    <span className="text-gray-400"> — against the same clips, {VARIANTS[baseKey].label.toLowerCase()}</span>
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="mb-3 p-2 border border-gray-200 rounded text-xs text-gray-700 max-w-3xl">
            <div className="font-medium mb-0.5">
              Silence before the voice, measured on the clips as recorded
              {baseKey !== "recorded" && ` — first word right/wrong is from the “${VARIANTS[baseKey].label}” replay`}
            </div>
            <div>
              First word heard <strong>wrong</strong>: {wrongFirst.n} clip{wrongFirst.n === 1 ? "" : "s"}, median{" "}
              <strong>{wrongFirst.median ?? "—"} ms</strong> ({wrongFirst.clipped} possibly clipped,{" "}
              {wrongFirst.short} under {SHORT_MS} ms)
            </div>
            <div>
              First word heard <strong>right</strong>: {rightFirst.n} clip{rightFirst.n === 1 ? "" : "s"}, median{" "}
              <strong>{rightFirst.median ?? "—"} ms</strong> ({rightFirst.clipped} possibly clipped,{" "}
              {rightFirst.short} under {SHORT_MS} ms)
            </div>
            <div className="text-gray-500 mt-0.5">
              {`“Possibly clipped” means the voice began within ${CLIPPED_MS} ms of the microphone waking up. `}
              {typicalDeadAir !== null && `Clips start with about ${typicalDeadAir} ms of exact silence while it wakes`}
              {longDeadAir.length > 0 ? `; ${longDeadAir.length} start with more than ${DEAD_AIR_NOTABLE_MS} ms (longest ${Math.max(...longDeadAir)} ms).` : "."}
              {erroredBase.length > 0 && ` ${erroredBase.length} clip${erroredBase.length === 1 ? "" : "s"} never reached the recogniser and ${erroredBase.length === 1 ? "is" : "are"} left out.`}
              {skipped.length > 0 && ` ${skipped.length} clip${skipped.length === 1 ? "" : "s"} could not be fetched and ${skipped.length === 1 ? "is" : "are"} in no count.`}
            </div>
          </div>

          {erroredBase.length > 0 && (
            <div className="mb-3 text-xs text-amber-800 max-w-3xl">
              Never reached the recogniser: {erroredBase.map((r) => `“${said[r.caseId] ?? r.caseId}” (${baseHeard[r.caseId] ?? ""})`).join("; ")}
            </div>
          )}

          {staleBase.length > 0 && (
            <div className="mb-3 text-xs text-gray-600 max-w-3xl">
              Stale — recorded against an older test diagram, so they cannot be judged and are in no count
              (re-record them): {staleBase.map((r) => `“${said[r.caseId] ?? r.caseId}” (${r.detail})`).join("; ")}
            </div>
          )}

          {moved.length > 0 && (
            <div className="mb-3 text-xs text-amber-800 max-w-3xl">
              The grammar has moved since {moved.length === 1 ? "this line was" : "these lines were"} recorded — scored against
              what the sentence parses to <strong>today</strong>, so the number still measures hearing:{" "}
              {moved.map((id) => `“${said[id] ?? id}”`).join("; ")}
            </div>
          )}

          {lines.filter((l) => l.flips && (l.flips.recovered.length || l.flips.broke.length)).map((l) => (
            <div key={`flips-${l.v.key}`} className="mb-3 text-xs max-w-3xl">
              <div className="font-medium text-gray-700 mb-0.5">{l.v.label}</div>
              {[
                ...l.flips!.recovered.map((f) => ({ ...f, kind: "recovered" as const })),
                ...l.flips!.broke.map((f) => ({ ...f, kind: "broke" as const })),
              ].map((f) => (
                <div key={`${l.v.key}-${f.caseId}`} className={`ml-2 ${f.kind === "recovered" ? "text-green-800" : "text-red-800"}`}>
                  {f.kind}: “{said[f.caseId] ?? f.caseId}” — heard “{heard[l.v.key]?.[f.caseId] ?? ""}” ({f.from} → {f.to})
                </div>
              ))}
            </div>
          ))}

          <div className="space-y-1">
            {results.filter((r) => isFailure(r.outcome)).map((r) => {
              const o = onset[r.caseId];
              return (
                <div key={r.caseId} className="border border-red-100 bg-red-50 rounded p-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="px-1 rounded bg-red-100 text-red-800 text-[10px] shrink-0">{r.outcome}</span>
                    <span className="text-gray-400 text-[10px] shrink-0">{r.family}</span>
                    {typeof o?.leadIn === "number" && (
                      <span className={`text-[10px] shrink-0 ${possiblyClipped(o) ? "text-red-700 font-semibold" : o.leadIn < SHORT_MS ? "text-amber-700" : "text-gray-400"}`}
                        title="Silence before the voice starts, in the clip as recorded">
                        lead-in {o.leadIn} ms{possiblyClipped(o) ? " — possibly clipped" : ""}
                      </span>
                    )}
                    {typeof o?.deadAir === "number" && o.deadAir > DEAD_AIR_NOTABLE_MS && (
                      <span className="text-[10px] shrink-0 text-amber-700" title="Exact digital silence at the start — the microphone waking up">
                        dead air {o.deadAir} ms
                      </span>
                    )}
                    {shown.variants.filter((v) => v.key !== baseKey).map((v) => {
                      const other = rows[v.key]?.[r.caseId]?.outcome;
                      if (!other) return null;
                      return (
                        <span key={v.key} className={`text-[10px] shrink-0 px-1 rounded ${isFailure(other) ? "bg-gray-100 text-gray-600" : "bg-green-100 text-green-800"}`}>
                          {v.key === "padded" ? "padded" : "punctuated"}: {other}
                        </span>
                      );
                    })}
                  </div>
                  {/* Both lines, always. The pair IS the finding: same words and a
                      red row means the grammar; different words means the ear. */}
                  <div className="text-gray-800">said:&nbsp; “{said[r.caseId] ?? ""}”</div>
                  <div className={baseHeard[r.caseId] === said[r.caseId] ? "text-gray-500" : "text-purple-700"}>
                    heard: “{baseHeard[r.caseId] ?? ""}”
                  </div>
                  {r.detail && <div className="text-gray-500 mt-0.5">{r.detail}</div>}
                </div>
              );
            })}
            {results.every((r) => !isFailure(r.outcome)) && <p className="text-xs text-gray-500">Nothing failed.</p>}
          </div>
        </>
      )}
    </div>
  );
}
