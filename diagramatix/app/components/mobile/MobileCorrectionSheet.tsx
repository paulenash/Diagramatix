"use client";

/**
 * The phone's "✎ Correct" sheet (2026-09-29, mobile voice stage 3): say or
 * type what the generated diagram got wrong, and re-generate it. The words
 * live in the screen (words / setWords), so closing the sheet or a failed run
 * never loses them.
 *
 * Before anything is sent it says what is at stake: the WHOLE diagram is
 * replaced, review comments included, and the current version stays in the
 * diagram's history. The prompt the AI will be sent can be read in full.
 */
import { useEffect, useRef, useState } from "react";
import { startDictation } from "@/app/lib/dictation";
import { joinSpoken } from "@/app/lib/mobile/generateDraft";
import { createMicController } from "@/app/lib/mobile/micController";
import { replaceWarning } from "@/app/lib/mobile/correction";
import { withCorrection } from "@/app/lib/ai/promptPreambles";
import { MicTest } from "./MicTest";

export function MobileCorrectionSheet({
  words, setWords, basePrompt, imageName, comments, unsaved, onSubmit, onClose, starting, error,
}: {
  words: string;
  setWords: (update: (w: string) => string) => void;
  /** The prompt the diagram was generated from — the correction goes on its end. */
  basePrompt: string;
  /** The kept photo or image it is re-generated with, if any. */
  imageName: string | null;
  /** Review comments on the diagram now (unsaved ones included). */
  comments: number;
  /** Some of them are not saved yet. */
  unsaved: boolean;
  /** Called with the finished words (they may hold a phrase the last render has not shown yet). */
  onSubmit: (finished: string) => void;
  onClose: () => void;
  starting: boolean;
  error: string | null;
}) {
  const [mic, setMic] = useState<{ target: "c"; ready: boolean } | null>(null);
  const [interim, setInterim] = useState("");
  const [micMsg, setMicMsg] = useState<string | null>(null);
  const [showMicTest, setShowMicTest] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  const wordsRef = useRef(words);
  wordsRef.current = words;
  const setWordsRef = useRef(setWords);
  setWordsRef.current = setWords;

  const micRef = useRef<ReturnType<typeof createMicController<"c">> | null>(null);
  if (!micRef.current) {
    micRef.current = createMicController<"c">(startDictation, {
      onText: (_t, text) => setWordsRef.current((w) => joinSpoken(w, text)),
      onInterim: (text) => setInterim(text),
      onState: (s) => setMic(s),
      onMessage: (m) => setMicMsg(m),
    });
  }
  useEffect(() => () => micRef.current?.dispose(), []);

  /** Stop the mic and return the words with the phrase that was still on screen. */
  function stopKeepingWords(): string {
    const kept = micRef.current?.stop();
    if (!kept) return wordsRef.current;
    const next = joinSpoken(wordsRef.current, kept.tail);
    setWords(() => next);
    return next;
  }

  function close() {
    // While the start is in flight the run may already exist: stay, and show how it went.
    if (starting) return;
    stopKeepingWords();
    onClose();
  }

  const hasText = words.trim().length > 0 || (!!mic && interim.trim().length > 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={close}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative bg-white rounded-t-2xl shadow-xl p-4 pb-6 max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300" />
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-900">Correct this diagram</h2>
          <button onClick={close} disabled={starting} className="text-gray-400 text-xl leading-none px-1 disabled:opacity-40" aria-label="Close">×</button>
        </div>
        <p className="text-[11px] text-gray-500 mb-2">
          Say or type what’s wrong or missing. The AI draws the process again with your correction
          {imageName ? ", from the same photo" : ""}.
        </p>

        <textarea
          value={words}
          onChange={(e) => { const v = e.target.value; setWords(() => v); }}
          rows={4}
          placeholder="e.g. The approval happens before payment."
          className="w-full text-base text-gray-900 border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {mic && interim && <p className="text-[13px] text-gray-400 italic mt-1">{interim}</p>}

        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => void micRef.current?.toggle("c")}
            disabled={starting}
            className={`h-11 px-4 rounded-full text-sm font-medium flex items-center gap-1.5 disabled:opacity-40 ${mic
              ? "bg-red-50 text-red-600 animate-pulse"
              : "bg-pink-600 text-white active:bg-pink-700"}`}
          >
            <span className="text-lg leading-none">{mic ? "■" : "🎤"}</span>
            {mic ? "Stop" : "Speak"}
          </button>
          {mic && <span className="text-[11px] text-gray-500">{mic.ready ? "listening…" : "connecting…"}</span>}
        </div>
        {micMsg && <p className="text-[11px] text-amber-600 mt-1">{micMsg}</p>}
        <button type="button" onClick={() => setShowMicTest((v) => !v)}
          className="mt-1 text-[11px] text-gray-500 underline active:text-gray-700">
          {showMicTest ? "Hide mic test" : "Mic not working? Test it"}
        </button>
        {showMicTest && <div className="mt-2"><MicTest compact /></div>}

        <p className="text-[12px] text-amber-800 bg-amber-50 rounded-md px-2 py-1.5 mt-3">⚠ {replaceWarning(comments, unsaved)}</p>

        <button type="button" onClick={() => setShowPrompt((v) => !v)}
          className="mt-2 text-[11px] text-blue-600 underline">
          {showPrompt ? "Hide what the AI is sent" : "Show what the AI is sent"}
        </button>
        {showPrompt && (
          <pre className="mt-1 max-h-[30vh] overflow-y-auto whitespace-pre-wrap break-words text-[11px] text-gray-700 bg-gray-50 border border-gray-200 rounded-md p-2 font-sans">
            {withCorrection(basePrompt, words || "…")}
          </pre>
        )}

        <p className="text-[11px] text-gray-500 mt-3">
          Takes a minute or two. You can lock your phone or leave this screen — the diagram is saved when it’s ready.
        </p>
        {error && <p className="text-[12px] text-amber-800 bg-amber-50 rounded-md px-2 py-1.5 mt-2">{error}</p>}
        <div className="flex gap-2 mt-3">
          <button onClick={close} disabled={starting} className="flex-1 py-2.5 text-sm text-gray-700 border border-gray-300 rounded-lg active:bg-gray-50 disabled:opacity-40">Cancel</button>
          <button onClick={() => onSubmit(stopKeepingWords())} disabled={!hasText || starting}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg disabled:opacity-40 active:bg-blue-700">
            {starting ? "Starting…" : "Re-generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
