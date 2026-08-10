"use client";

import { useState } from "react";
import { isRichText, sanitizeRichText } from "@/app/lib/diagram/richText";
import { RichTextEditor } from "@/app/components/canvas/RichTextEditor";
import { MicTest } from "./MicTest";

/**
 * Bottom sheet for a mobile review comment.
 *   mode:"edit" = rich-text editor (bold/italic/underline + lists) with the shared
 *     dictation mic (Deepgram → browser fallback) and voice formatting commands;
 *     Save/Cancel attach a new note as sanitised HTML.
 *   mode:"read" = render an existing note (rich text) + Close.
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
  /** Edit mode returns sanitised HTML (rich text). */
  onSave?: (html: string) => void;
  onClose: () => void;
}) {
  const [editHtml, setEditHtml] = useState("");
  const [showMicTest, setShowMicTest] = useState(false);

  const read = mode === "read";
  // Plain-text length of the current edit, to enable/disable Save.
  const plain = editHtml.replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").trim();

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
            <div className="text-sm text-gray-800 whitespace-pre-wrap min-h-[3rem] max-h-[45vh] overflow-y-auto">{sanitizeRichText(html ?? "").replace(/<[^>]+>/g, "") || initialText || "(empty)"}</div>
          )
        ) : (
          <>
            <RichTextEditor value={initialText} onChange={setEditHtml} dictation mobile />
            <p className="text-[11px] text-gray-500 mt-1">Type or tap 🎤 to dictate. Say “bullet list”, “new line”, “bold”, “stop”.</p>
            <button type="button" onClick={() => setShowMicTest((v) => !v)}
              className="mt-1.5 text-[11px] text-gray-500 underline active:text-gray-700">
              {showMicTest ? "Hide mic test" : "Mic not working? Test it"}
            </button>
            {showMicTest && <div className="mt-2"><MicTest compact /></div>}
            <div className="flex gap-2 mt-3">
              <button onClick={onClose} className="flex-1 py-2.5 text-sm text-gray-700 border border-gray-300 rounded-lg active:bg-gray-50">Cancel</button>
              <button
                onClick={() => onSave?.(editHtml)}
                disabled={!plain}
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
