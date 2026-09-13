"use client";

/**
 * Items 4, 5 and 10 — "Describe the process", its dictation controls, the
 * Save / Update / New row directly beneath it, and Refine below that.
 *
 * The one behavioural change from the sidebar: the mic test's level meter,
 * device name and replay clip render HERE, beside the Test mic button that
 * produced them. In the sidebar they appeared far below, after the dictation
 * banner and the compare controls — so the bar you were told to watch was
 * off-screen on the panel where you pressed the button.
 */
import { AiPanel, AiButton, AiSpinner, type AiTones } from "./AiConsoleChrome";

const MIC_PATH_TOP = "M8 11a3 3 0 0 0 3-3V4a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3z";
const MIC_PATH_BASE = "M13 8a1 1 0 1 0-2 0 3 3 0 0 1-6 0 1 1 0 1 0-2 0 5 5 0 0 0 4 4.9V14H5.5a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1H9v-1.1A5 5 0 0 0 13 8z";

export function PromptPanel({
  tones, prompt, onPromptChange, placeholder,
  speechSupported, listening, dictEngine, onToggleDictation, dictateMsg, onDismissDictateMsg,
  mic, onToggleMicTest,
  pcf,
  busy, saving, editingPromptId, canSave, onSave, onNew,
  canRefine, refining, onRefine, refineMsg, onDismissRefineMsg,
}: {
  tones: AiTones;
  prompt: string;
  onPromptChange: (next: string) => void;
  placeholder: string;
  speechSupported: boolean;
  listening: boolean;
  dictEngine: "deepgram" | "browser" | null;
  onToggleDictation: () => void;
  dictateMsg: string | null;
  onDismissDictateMsg: () => void;
  mic: { testing: boolean; level: number; device: string | null; err: string | null; recordingUrl: string | null };
  onToggleMicTest: () => void;
  pcf?: { hierarchyId: string; name: string };
  busy: boolean;
  saving: boolean;
  editingPromptId: string | null;
  canSave: boolean;
  onSave: () => void;
  onNew: () => void;
  canRefine: boolean;
  refining: boolean;
  onRefine: () => void;
  refineMsg: string | null;
  onDismissRefineMsg: () => void;
}) {
  const showMicBlock = mic.testing || !!mic.err || !!mic.device || !!mic.recordingUrl;

  return (
    <AiPanel
      title="Describe the process"
      tones={tones}
      right={
        <div className="flex items-center gap-2">
          {speechSupported && (
            <AiButton
              tones={tones}
              onClick={onToggleDictation}
              variant={listening ? (dictEngine === "deepgram" ? "solid" : "danger") : "outline"}
              title={listening
                ? `Stop dictation — ${dictEngine === "deepgram" ? "Deepgram (high quality)" : "browser fallback"}`
                : "Dictate prompt"}
            >
              <svg width={10} height={10} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <path d={MIC_PATH_TOP} />
                <path d={MIC_PATH_BASE} />
              </svg>
              {listening ? "Stop" : "Dictate"}
            </AiButton>
          )}
          <AiButton
            tones={tones}
            onClick={onToggleMicTest}
            variant={mic.testing ? "solid" : "outline"}
            title="Test the browser's selected microphone for ~8 seconds. Talk and watch the bar move, then replay what it captured."
          >
            {mic.testing ? "Stop test" : "Test mic"}
          </AiButton>
        </div>
      }
    >
      {/* Mic test readout — deliberately directly under the button that starts it. */}
      {showMicBlock && (
        <div className="mb-2 rounded border px-2.5 py-1.5" style={{ borderColor: tones.line }}>
          {mic.testing && (
            <>
              <p className="text-[11px] mb-1" style={{ color: tones.bright }}>
                Listening on <span className="font-semibold">{mic.device}</span> — talk now (it&apos;s recording)
              </p>
              <div className="h-2 bg-white/10 rounded overflow-hidden">
                <div className="h-full transition-[width] duration-75"
                  style={{ width: `${mic.level}%`, background: tones.accent }} />
              </div>
              <p className="text-[9px] text-white/35 mt-0.5">
                The bar should jump when you speak. Stop the test, then replay below to hear what was captured.
              </p>
            </>
          )}
          {!mic.testing && mic.device && !mic.err && (
            <p className="text-[11px] text-white/50">Last test mic: <span className="font-medium">{mic.device}</span></p>
          )}
          {!mic.testing && mic.recordingUrl && (
            <div className="mt-1">
              <p className="text-[9px] text-white/35 mb-0.5">Replay your test recording:</p>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio controls src={mic.recordingUrl} className="w-full h-8" />
            </div>
          )}
          {mic.err && (
            <p className="text-[11px] text-red-300 bg-red-500/10 border border-red-400/40 rounded px-2 py-1">{mic.err}</p>
          )}
        </div>
      )}

      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder={placeholder}
        rows={12}
        aria-label="Describe the process"
        className="w-full px-3 py-2 text-[13px] rounded resize-y bg-black/50 text-white/90 placeholder:text-white/25 focus:outline-none border"
        style={{ borderColor: listening ? tones.accent : tones.line }}
      />

      {listening && (
        <p className="text-[10px] mt-1 animate-pulse" style={{ color: tones.bright }}>
          {dictEngine === "deepgram" ? "Listening — Deepgram (high quality)…" : "Listening — browser fallback…"}
        </p>
      )}
      {dictateMsg && !listening && (
        <div className="relative text-[11px] text-amber-200 bg-amber-500/10 border border-amber-400/40 rounded pl-2 pr-6 py-1 mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap">
          <button onClick={onDismissDictateMsg} aria-label="Dismiss"
            className="absolute top-0.5 right-1 text-amber-300/70 hover:text-amber-100 leading-none">&times;</button>
          {dictateMsg}
        </div>
      )}

      {pcf && (
        <p className="mt-1.5 text-[11px] text-emerald-200 bg-emerald-500/10 border border-emerald-400/40 rounded px-2 py-1"
          title="The plan is aligned to this APQC PCF standard process's decomposition">
          ◎ Aligning to APQC PCF: <span className="font-mono">{pcf.hierarchyId}</span> {pcf.name}
        </p>
      )}

      {/* Item 10 — Save / Update / New immediately under the description. */}
      <div className="flex items-center gap-2 mt-2">
        <AiButton tones={tones} onClick={onSave} disabled={!canSave || busy} variant="outline"
          title={editingPromptId
            ? "Update the open saved prompt with this text and the current plan"
            : "Save this prompt (including the current plan) for later"}>
          {saving && <AiSpinner />}
          {saving ? "Saving…" : editingPromptId ? "Update" : "Save…"}
        </AiButton>
        <AiButton tones={tones} onClick={onNew} disabled={busy} variant="muted"
          title="Start a new prompt (you'll be asked whether to save the current one first)">
          New
        </AiButton>
        {editingPromptId && (
          <span className="text-[10px] text-white/35">editing a saved prompt — Save updates it in place</span>
        )}
      </div>

      {/* Item 5 — Refine, under the prompt edit area. Never auto-plans. */}
      {canRefine && (
        <div className="mt-2">
          <AiButton tones={tones} onClick={onRefine} disabled={!prompt.trim() || busy} variant="outline"
            className="w-full"
            title="Ask the AI a few clarifying questions and fold your answers into the prompt before you Plan">
            {refining && <AiSpinner />}
            {refining ? "Refining…" : "✨ Refine prompt"}
          </AiButton>
          {refineMsg && (
            <p className="text-[10px] text-white/55 mt-1 flex items-start gap-1">
              <span className="flex-1">{refineMsg}</span>
              <button onClick={onDismissRefineMsg} className="text-white/30 hover:text-white/70 shrink-0"
                title="Dismiss" aria-label="Dismiss">&times;</button>
            </p>
          )}
        </div>
      )}
    </AiPanel>
  );
}
