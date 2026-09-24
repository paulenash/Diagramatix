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
 */
import { useCallback, useEffect, useState } from "react";
import { scoreCase, summarise, isFailure, type CaseResult } from "@/app/lib/assist/commandScore";
import { fixtureElements } from "@/app/lib/assist/commandFixture";
import { replayClip } from "@/app/lib/dictation/replayClip";
import { asrFingerprint, liveStreamParams } from "@/app/lib/dictation/asrParams";
import { BOOST_PROFILES, boostProfile, DEFAULT_BOOST_PROFILE, type BoostProfileId } from "@/app/lib/dictation/boostProfiles";
import type { GeneratedCase } from "@/app/lib/assist/commandGenerator";

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

export function ReplayPanel() {
  const [clips, setClips] = useState<ClipRow[] | null>(null);
  const [leg, setLeg] = useState<Leg>("stream");
  const [profileId, setProfileId] = useState<BoostProfileId>(DEFAULT_BOOST_PROFILE);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Record<string, CaseResult>>({});
  const [heard, setHeard] = useState<Record<string, string>>({});
  /** What the script asked for, so a failure row can show both lines. */
  const [said, setSaid] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/voice-assist-test/clips", { cache: "no-store" });
      if (!res.ok) throw new Error(`could not list clips (${res.status})`);
      setClips((await res.json()).clips as ClipRow[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "could not list clips");
      setClips([]);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

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
    if (!clips?.length) return;
    setRunning(true);
    setErr(null);
    setSaved(null);
    setRows({});
    setHeard({});
    setSaid({});
    const els = fixtureElements();
    const todo = latest(clips);
    setProgress({ done: 0, total: todo.length });
    const started = Date.now();
    const collected: CaseResult[] = [];

    for (const clip of todo) {
      try {
        const audioRes = await fetch(`/api/admin/voice-assist-test/clips/${clip.id}`, { cache: "no-store" });
        if (!audioRes.ok) throw new Error(`clip ${clip.caseId}: ${audioRes.status}`);
        const wav = await audioRes.arrayBuffer();

        let transcript = "";
        let replayError: string | undefined;
        if (leg === "stream") {
          const r = await replayClip(wav, { commandWords: boostProfile(profileId).keywords });
          // The stitched utterances ARE the answer: if the buffer would have
          // produced two commands, the first one is what the user's sentence
          // actually became, and scoring the concatenation would hide it.
          transcript = r.utterances[0] ?? "";
          replayError = r.error;
        } else {
          const res = await fetch(`/api/admin/voice-assist-test/transcribe-clip?profile=${profileId}`, {
            method: "POST",
            headers: { "Content-Type": "audio/wav" },
            body: wav,
          });
          const j = await res.json().catch(() => ({}));
          transcript = typeof j.transcript === "string" ? j.transcript : "";
          if (!res.ok) replayError = j.error ?? `transcribe failed (${res.status})`;
        }

        // The clip carries its own sentence and its own expected ops — that is
        // exactly why they are denormalised onto it, and why a generator change
        // cannot orphan a corpus that took twenty minutes to record.
        const asCase: GeneratedCase = {
          id: clip.caseId,
          family: clip.family || "recorded",
          utterance: clip.utterance,
          ops: JSON.parse(clip.expectedOps || "[]"),
          refs: {},
        };
        const result = scoreCase(asCase, replayError ? "" : transcript, els);
        collected.push(result);
        setRows((p) => ({ ...p, [clip.caseId]: result }));
        setHeard((p) => ({ ...p, [clip.caseId]: replayError ? `⚠ ${replayError}` : transcript }));
        setSaid((p) => ({ ...p, [clip.caseId]: clip.utterance }));
      } catch (e) {
        setErr(e instanceof Error ? e.message : "a clip failed");
      } finally {
        // MERGE BY caseId, never by index: clips can fail or be skipped, and an
        // index-keyed table would land every later result on the wrong row —
        // the bug MdDiagramsClient documents.
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    }

    setRunning(false);

    // Keep the run, so the next one can be compared with it.
    try {
      const s = summarise(collected);
      const res = await fetch("/api/admin/voice-assist-test/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leg, corpusSeed: todo[0]?.corpusSeed ?? "", boostProfile: profileId,
          asrFingerprint: asrFingerprint(liveStreamParams({ sampleRate: 48000 })),
          total: s.total, passed: s.passed, failed: s.failed,
          fallbackRate: s.fallbackRate, outcomes: s.byOutcome, families: s.byFamily,
          results: collected, durationMs: Date.now() - started,
        }),
      });
      setSaved(res.ok ? "run saved" : null);
    } catch { /* the numbers are on screen either way */ }
  }, [clips, leg, profileId]);

  const results = Object.values(rows);
  const summary = results.length ? summarise(results) : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
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
        <button onClick={() => { void load(); }} disabled={running} className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50">Refresh clips</button>
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

      {leg === "stream" ? (
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
          <div className="flex flex-wrap items-center gap-4 mb-2 text-sm">
            <span className="font-semibold text-gray-800">
              {summary.passed}/{summary.total} passed
              <span className="text-gray-400 font-normal"> ({Math.round((summary.passed / summary.total) * 100)}%)</span>
            </span>
            <span className="text-xs text-gray-500">leg: {leg}</span>
          </div>
          <div className="space-y-1">
            {results.filter((r) => isFailure(r.outcome)).map((r) => (
              <div key={r.caseId} className="border border-red-100 bg-red-50 rounded p-2 text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-1 rounded bg-red-100 text-red-800 text-[10px] shrink-0">{r.outcome}</span>
                  <span className="text-gray-400 text-[10px] shrink-0">{r.family}</span>
                </div>
                {/* Both lines, always. The pair IS the finding: same words and a
                    red row means the grammar; different words means the ear. */}
                <div className="text-gray-800">said:&nbsp; “{said[r.caseId] ?? ""}”</div>
                <div className={heard[r.caseId] === said[r.caseId] ? "text-gray-500" : "text-purple-700"}>
                  heard: “{heard[r.caseId] ?? ""}”
                </div>
                {r.detail && <div className="text-gray-500 mt-0.5">{r.detail}</div>}
              </div>
            ))}
            {results.every((r) => !isFailure(r.outcome)) && <p className="text-xs text-gray-500">Nothing failed.</p>}
          </div>
        </>
      )}
    </div>
  );
}
