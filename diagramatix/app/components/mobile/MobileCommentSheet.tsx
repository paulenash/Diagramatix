"use client";

import { useEffect, useRef, useState } from "react";
import { startDictation, type DictationHandle } from "@/app/lib/dictation";
import { isRichText, sanitizeRichText } from "@/app/lib/diagram/richText";
import { MicTest } from "./MicTest";

/**
 * Bottom sheet for a mobile review comment. `mode:"edit"` = textarea + dictation
 * mic + Save/Cancel (attach a new note). `mode:"read"` = show an existing note's
 * text + Close. Dictation reuses the shared startDictation primitive (Deepgram,
 * falling back to native mobile speech-to-text).
 */
export function MobileCommentSheet({
  mode,
  heading,
  targetLabel,
  initialText = "",
  html,
  authorLine,
  onSave,
  onClose,
}: {
  mode: "edit" | "read";
  heading?: string;
  targetLabel?: string;
  initialText?: string;
  /** Read mode: original rich-text (HTML) body — rendered with formatting
   *  (bold/lists/line breaks) when present, sanitised to a safe tag whitelist. */
  html?: string;
  authorLine?: string;
  onSave?: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [showMicTest, setShowMicTest] = useState(false);
  const handleRef = useRef<DictationHandle | null>(null);

  // Stop dictation if the sheet unmounts.
  useEffect(() => () => { handleRef.current?.stop(); handleRef.current = null; }, []);

  async function toggleMic() {
    if (listening) {
      handleRef.current?.stop();
      handleRef.current = null;
      setListening(false);
      setInterim("");
      return;
    }
    setHint(null);
    setListening(true);
    const h = await startDictation({
      onText: (chunk) => setText((cur) => (cur ? `${cur} ${chunk}` : chunk).replace(/\s+/g, " ")),
      onInterim: (t) => setInterim(t),
      onError: (m) => setHint(m),
      onEnd: () => { setListening(false); setInterim(""); handleRef.current = null; },
      onEngine: (e) => { if (e === "browser") setHint("Using your phone's built-in dictation."); },
    });
    if (!h) { setListening(false); setHint("Couldn't start the microphone. Check its permission."); return; }
    handleRef.current = h;
  }

  const read = mode === "read";

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative bg-white rounded-t-2xl shadow-xl p-4 pb-6" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300" />
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-900">
            {read ? (heading ?? "Review comment") : "Add review comment"}
          </h2>
          <button onClick={onClose} className="text-gray-400 text-xl leading-none px-1">×</button>
        </div>
        {targetLabel && <p className="text-[11px] text-gray-500 mb-2 truncate">On: <span className="text-gray-700">{targetLabel}</span></p>}
        {read && authorLine && <p className="text-[11px] text-pink-700 mb-2">{authorLine}</p>}

        {read ? (
          html && isRichText(html) ? (
            <>
              <style>{`.mobile-rich ul{list-style:disc;padding-left:1.25rem}.mobile-rich ol{list-style:decimal;padding-left:1.25rem}.mobile-rich li{margin:0.1rem 0}.mobile-rich p{margin:0.25rem 0}.mobile-rich b,.mobile-rich strong{font-weight:600}`}</style>
              <div className="mobile-rich text-sm text-gray-800 min-h-[3rem] max-h-[45vh] overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: sanitizeRichText(html) }} />
            </>
          ) : (
            <div className="text-sm text-gray-800 whitespace-pre-wrap min-h-[3rem] max-h-[45vh] overflow-y-auto">{text || "(empty)"}</div>
          )
        ) : (
          <>
            <div className="relative">
              <textarea
                value={interim ? `${text}${text ? " " : ""}${interim}` : text}
                onChange={(e) => setText(e.target.value)}
                readOnly={listening}
                rows={4}
                autoFocus
                placeholder="Type your comment, or tap the mic to dictate…"
                className="w-full text-sm border border-gray-300 rounded-lg p-2.5 pr-12 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={toggleMic}
                aria-label={listening ? "Stop dictation" : "Dictate"}
                className={`absolute right-2 top-2 w-9 h-9 rounded-full flex items-center justify-center text-lg active:scale-95 ${listening ? "bg-red-600 text-white animate-pulse" : "bg-pink-100 text-pink-700 border border-pink-300"}`}
              >
                {listening ? "■" : "🎤"}
              </button>
            </div>
            {hint && <p className="text-[11px] text-amber-600 mt-1">{hint}</p>}
            <button type="button" onClick={() => setShowMicTest((v) => !v)}
              className="mt-1.5 text-[11px] text-gray-500 underline active:text-gray-700">
              {showMicTest ? "Hide mic test" : "Mic not working? Test it"}
            </button>
            {showMicTest && <div className="mt-2"><MicTest compact /></div>}
            <div className="flex gap-2 mt-3">
              <button onClick={onClose} className="flex-1 py-2.5 text-sm text-gray-700 border border-gray-300 rounded-lg active:bg-gray-50">Cancel</button>
              <button
                onClick={() => { handleRef.current?.stop(); onSave?.(text.trim()); }}
                disabled={!text.trim()}
                className="flex-1 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg disabled:opacity-40 active:bg-blue-700"
              >
                Save note
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
