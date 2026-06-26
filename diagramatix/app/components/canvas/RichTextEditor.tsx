"use client";

import { useRef, useEffect } from "react";
import { sanitizeRichText, isRichText, plainToHtml } from "@/app/lib/diagram/richText";

/**
 * Small contentEditable rich-text editor for Process descriptions: Bold,
 * Italic, Underline, numbered list, bullet list. Stores a sanitised HTML
 * subset. Mount one per element (key by element id) so it initialises from
 * the right value; commits on blur and after each toolbar command.
 */
export function RichTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

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
