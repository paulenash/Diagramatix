"use client";

import { useRef, useEffect, useState } from "react";
import { sanitizeRichText, isRichText, plainToHtml } from "@/app/lib/diagram/richText";
import { startDictation, type DictationHandle } from "@/app/lib/dictation";

/**
 * Small contentEditable rich-text editor for descriptions + Review Comments:
 * Bold, Italic, Underline, numbered list, bullet list. Stores a sanitised HTML
 * subset. Mount one per element (key by element id) so it initialises from the
 * right value; commits on blur and after each toolbar command.
 *
 * With `dictation`, a 🎤 button streams speech to text (shared Deepgram client)
 * straight into the editor, plus voice commands for formatting — say "new line",
 * "numbered list", "bullet list", "next point", "bold"/"italic"/"underline",
 * "delete" (removes the last word), or "stop" to finish (MVP).
 */
export function RichTextEditor({
  value,
  onChange,
  dictation = false,
}: {
  value: string;
  onChange: (html: string) => void;
  dictation?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [listening, setListening] = useState(false);
  const dictRef = useRef<DictationHandle | null>(null);

  // Initialise the editor once on mount from the incoming value (legacy
  // plain-text descriptions are converted to HTML). Subsequent prop changes
  // are NOT pushed back into the DOM so the caret never jumps mid-edit.
  useEffect(() => {
    if (ref.current) {
      // CANVAS-01: sanitise on init too. `value` can arrive from imported JSON
      // or AI output that never passed through commit()'s sanitiser, so an
      // unsanitised assignment here is a stored-XSS sink (e.g. <img onerror>).
      ref.current.innerHTML = sanitizeRichText(isRichText(value) ? value : plainToHtml(value ?? ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop any live dictation when the editor unmounts.
  useEffect(() => () => { dictRef.current?.stop(); dictRef.current = null; }, []);

  const commit = () => {
    if (ref.current) onChange(sanitizeRichText(ref.current.innerHTML));
  };

  const run = (command: string) => {
    ref.current?.focus();
    // execCommand is deprecated but is still the simplest dependency-free way
    // to drive a contentEditable; the output is sanitised on commit.
    document.execCommand(command, false);
    commit();
  };

  // Put the caret inside the editor (at the end if it isn't already there) so a
  // dictated word/command lands in the content rather than nowhere.
  const ensureCaret = () => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  };

  const insertText = (text: string) => {
    const el = ref.current;
    if (!el) return;
    ensureCaret();
    const t = el.textContent ?? "";
    const clean = text.trim();
    const needSpace = t.length > 0 && !/\s$/.test(t) && !/^[.,!?;:]/.test(clean);
    document.execCommand("insertText", false, (needSpace ? " " : "") + clean);
    commit();
  };

  const lineBreak = () => {
    ensureCaret();
    if (!document.execCommand("insertLineBreak")) document.execCommand("insertHTML", false, "<br>");
    commit();
  };

  const deleteLastWord = () => {
    ensureCaret();
    const sel = window.getSelection();
    if (!sel) return;
    // Extend the selection back over the last word, then delete it.
    if (sel.isCollapsed) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const modify = (sel as any).modify as ((a: string, d: string, g: string) => void) | undefined;
      if (modify) { try { modify.call(sel, "extend", "backward", "word"); } catch { /* unsupported */ } }
    }
    document.execCommand("delete");
    commit();
  };

  // Normalised utterance → formatting action. Returns true if handled as a
  // command (otherwise the words are dictated in as text).
  const applyCommand = (norm: string): boolean => {
    switch (norm) {
      case "new line": case "next line": case "line break": lineBreak(); return true;
      case "new paragraph": run("insertParagraph"); return true;
      case "numbered list": case "start a numbered list": case "start numbered list": case "ordered list":
        run("insertOrderedList"); return true;
      case "bullet list": case "bullet points": case "start a bullet list": case "start bullet list": case "bulleted list":
        run("insertUnorderedList"); return true;
      case "next point": case "new point": case "new item": case "next item": case "new bullet": case "next bullet": case "new number":
        run("insertParagraph"); return true;
      case "bold": run("bold"); return true;
      case "italic": run("italic"); return true;
      case "underline": run("underline"); return true;
      case "delete": case "delete that": case "scratch that": case "delete last word": deleteLastWord(); return true;
      default: return false;
    }
  };

  const handleUtterance = (text: string) => {
    const norm = text.toLowerCase().trim().replace(/[.,!?;:]+$/, "");
    if (norm === "stop" || norm === "stop dictation" || norm === "done") { stopDictation(); return; }
    if (applyCommand(norm)) return;
    insertText(text);
  };

  const stopDictation = () => {
    dictRef.current?.stop();
    dictRef.current = null;
    setListening(false);
  };

  const toggleDictation = async () => {
    if (dictRef.current) { stopDictation(); return; }
    setListening(true);
    ensureCaret();
    const handle = await startDictation({
      onText: handleUtterance,
      onError: () => { /* transient — keep the session */ },
      onEnd: () => { dictRef.current = null; setListening(false); },
    });
    if (!handle) { setListening(false); return; }
    dictRef.current = handle;
  };

  const btn = "w-6 h-6 rounded text-[11px] flex items-center justify-center text-gray-600 hover:bg-gray-200";

  return (
    <div className="border border-gray-300 rounded">
      <div className="flex items-center gap-0.5 border-b border-gray-200 px-1 py-0.5 bg-gray-50">
        <button type="button" title="Bold" className={`${btn} font-bold`}
          onMouseDown={(e) => { e.preventDefault(); run("bold"); }}>B</button>
        <button type="button" title="Italic" className={`${btn} italic`}
          onMouseDown={(e) => { e.preventDefault(); run("italic"); }}>I</button>
        <button type="button" title="Underline" className={`${btn} underline`}
          onMouseDown={(e) => { e.preventDefault(); run("underline"); }}>U</button>
        <span className="w-px h-4 bg-gray-200 mx-0.5" />
        <button type="button" title="Numbered list" className={btn}
          onMouseDown={(e) => { e.preventDefault(); run("insertOrderedList"); }}>1.</button>
        <button type="button" title="Bullet list" className={btn}
          onMouseDown={(e) => { e.preventDefault(); run("insertUnorderedList"); }}>&bull;</button>
        {dictation && (
          <>
            <span className="w-px h-4 bg-gray-200 mx-0.5" />
            <button type="button"
              title={listening
                ? "Stop dictation. Say: new line · numbered list · bullet list · next point · bold/italic/underline · delete · stop"
                : "Dictate — speak your comment; say 'numbered list', 'bullet list', 'next point', 'new line', 'bold', 'delete', 'stop'"}
              className={`${btn} ${listening ? "text-red-600 bg-red-50 animate-pulse" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); void toggleDictation(); }}>🎤</button>
            {listening && <span className="text-[9px] text-red-600 ml-0.5">listening…</span>}
          </>
        )}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onBlur={commit}
        className="dgx-rich-edit text-[11px] px-2 py-1.5 min-h-[150px] max-h-[300px] overflow-y-auto outline-none leading-snug text-gray-800"
        style={{ wordBreak: "break-word" }}
      />
    </div>
  );
}
