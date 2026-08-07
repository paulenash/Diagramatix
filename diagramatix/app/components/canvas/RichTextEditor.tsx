"use client";

import { useRef, useEffect, useState } from "react";
import { sanitizeRichText, isRichText, plainToHtml } from "@/app/lib/diagram/richText";
import { startDictation, type DictationHandle } from "@/app/lib/dictation";
import {
  matchDictationCommand, DEFAULT_DICTATION_COMMANDS,
  type DictationAction, type DictationCommandDef,
} from "@/app/lib/dictation/commands";

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
  // Live (admin-editable) command catalogue, fetched once; falls back to the
  // built-in defaults. Held in a ref so the streaming callback reads the latest.
  const commandsRef = useRef<DictationCommandDef[]>(DEFAULT_DICTATION_COMMANDS);
  useEffect(() => {
    if (!dictation) return;
    let on = true;
    fetch("/api/ai/dictation/commands")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (on && Array.isArray(j?.commands) && j.commands.length) commandsRef.current = j.commands; })
      .catch(() => { /* keep defaults */ });
    return () => { on = false; };
  }, [dictation]);

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

  // The `<li>`s of the list the caret is in — else the last list in the editor.
  const listItems = (): HTMLLIElement[] => {
    const el = ref.current;
    if (!el) return [];
    let node: Node | null = window.getSelection()?.anchorNode ?? null;
    let list: HTMLElement | null = null;
    while (node && node !== el) {
      if (node instanceof HTMLElement && (node.tagName === "OL" || node.tagName === "UL")) { list = node; break; }
      node = node.parentNode;
    }
    if (!list) {
      const lists = el.querySelectorAll("ol,ul");
      list = lists.length ? (lists[lists.length - 1] as HTMLElement) : null;
    }
    return list ? (Array.from(list.querySelectorAll(":scope > li")) as HTMLLIElement[]) : [];
  };

  // Positional: drop the caret at the end of the N-th item and open a new one.
  const addPointAfter = (n: number) => {
    const li = listItems()[n - 1];
    if (!li) return;
    const range = document.createRange();
    range.selectNodeContents(li);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    ref.current?.focus();
    document.execCommand("insertParagraph"); // a new <li> after the N-th
    commit();
  };

  const deletePoint = (n: number) => {
    const items = listItems();
    const li = items[n - 1];
    if (!li) return;
    const list = li.parentElement;
    li.remove();
    if (list && list.children.length === 0) list.remove();
    ensureCaret();
    commit();
  };

  const stopDictation = () => {
    dictRef.current?.stop();
    dictRef.current = null;
    setListening(false);
  };

  const applyAction = (action: DictationAction, n?: number) => {
    switch (action) {
      case "newLine": lineBreak(); break;
      case "newParagraph": case "nextPoint": run("insertParagraph"); break;
      case "numberedList": run("insertOrderedList"); break;
      case "bulletList": run("insertUnorderedList"); break;
      case "bold": run("bold"); break;
      case "italic": run("italic"); break;
      case "underline": run("underline"); break;
      case "deleteWord": deleteLastWord(); break;
      case "stop": stopDictation(); break;
      case "addPointAfter": if (n) addPointAfter(n); break;
      case "deletePoint": if (n) deletePoint(n); break;
    }
  };

  const handleUtterance = (text: string) => {
    const cmd = matchDictationCommand(text, commandsRef.current);
    if (cmd) { applyAction(cmd.action, cmd.n); return; }
    insertText(text);
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
    <div className="border border-gray-300 rounded bg-white">
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
