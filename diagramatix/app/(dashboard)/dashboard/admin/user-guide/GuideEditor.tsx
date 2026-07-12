"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { Image } from "@tiptap/extension-image";
import { marked } from "marked";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { PromptDialog } from "@/app/components/PromptDialog";
import { SymbolPicker } from "./SymbolPicker";
import { ImagePickerDialog } from "./ImagePickerDialog";
import { JoinAdjacentLists } from "./joinLists";
import { startDictation, type DictationHandle } from "@/app/lib/dictation";
import { useMicTest } from "@/app/lib/dictation/useMicTest";

// Markdown ↔ HTML for the editor (TipTap edits HTML; we store Markdown).
const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced", emDelimiter: "*" });
td.use(gfm);
const mdToHtml = (md: string) => marked.parse(md ?? "", { async: false }) as string;
const htmlToMd = (html: string) => td.turndown(html).trim();

function Btn({ on, active, title, children }: { on: () => void; active?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={on}
      title={title}
      className={`px-2 py-1 text-xs rounded border ${active ? "bg-blue-50 border-blue-300 text-blue-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
    >
      {children}
    </button>
  );
}

/**
 * WYSIWYG editor for one guide section. Edits the rendered view; content is read
 * and written as Markdown. Remount with a `key` per section so it re-initialises.
 */
export function GuideEditor({ value, onChange }: { value: string; onChange: (md: string) => void }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [imgPickerOpen, setImgPickerOpen] = useState(false);
  const [, forceTick] = useState(0); // bump on each transaction → live toolbar state
  // Voice dictation straight into the rich-text body (TipTap inserts at the
  // cursor; the toolbar's onMouseDown-preventDefault keeps the editor focused).
  const [listening, setListening] = useState(false);
  const [dictEngine, setDictEngine] = useState<"deepgram" | "browser" | null>(null);
  const [showMicTest, setShowMicTest] = useState(false);
  const dictRef = useRef<DictationHandle | null>(null);
  // startDictation is async; a Stop pressed before the handle resolves would
  // otherwise leave an orphaned live mic (see toggleDictation).
  const stopRequestedRef = useRef(false);
  const mic = useMicTest();

  const editor = useEditor({
    immediatelyRender: false, // Next SSR: avoid hydration mismatch
    extensions: [
      StarterKit.configure({ heading: { levels: [3, 4] } }),
      Link.configure({ openOnClick: false, autolink: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ inline: false, HTMLAttributes: { class: "rounded border border-gray-200 max-w-full block my-3" } }),
      JoinAdjacentLists,
    ],
    content: mdToHtml(value),
    onUpdate: ({ editor }) => onChange(htmlToMd(editor.getHTML())),
    editorProps: {
      // Force dark, readable body/heading text — the default prose palette renders
      // too light in the editor surface. text-gray-800 + the prose CSS vars.
      attributes: {
        class:
          "prose prose-sm prose-gray max-w-none min-h-[200px] focus:outline-none px-3 py-2 " +
          "text-gray-800 [--tw-prose-body:#1f2937] [--tw-prose-headings:#111827] [--tw-prose-bold:#111827] " +
          "[--tw-prose-bullets:#4b5563] [--tw-prose-counters:#4b5563] [--tw-prose-quotes:#374151] [--tw-prose-quote-borders:#d1d5db] " +
          "[&_ul]:list-disc [&_ol]:list-decimal [&_:is(ul,ol)]:pl-6 " +
          // Visible table grid — TipTap/prose otherwise renders borderless cells
          // (an empty inserted table looks invisible).
          "[&_table]:w-full [&_table]:my-2 [&_table]:border-collapse " +
          "[&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-50 [&_th]:p-1.5 [&_th]:text-left " +
          "[&_td]:border [&_td]:border-gray-300 [&_td]:p-1.5 [&_td]:min-w-[3rem]",
      },
    },
  });

  useEffect(() => () => { dictRef.current?.stop(); }, []);

  // Re-render on every transaction so isActive()/inTable reflect the CURRENT
  // selection. TipTap v3's useEditor doesn't re-render on selection changes by
  // itself — without this the table controls (delete/+row/+col) never appear
  // when you click into a table, and the toolbar highlights go stale.
  useEffect(() => {
    if (!editor) return;
    const tick = () => forceTick((n) => n + 1);
    editor.on("transaction", tick);
    return () => { editor.off("transaction", tick); };
  }, [editor]);

  if (!editor) return <div className="min-h-[240px] border border-gray-200 rounded bg-gray-50 animate-pulse" />;

  const inTable = editor.isActive("table");

  async function toggleDictation() {
    if (!editor) return;
    if (listening) {
      stopRequestedRef.current = true;
      dictRef.current?.stop();
      dictRef.current = null;
      setListening(false);
      setDictEngine(null);
      return;
    }
    stopRequestedRef.current = false;
    setListening(true);
    const h = await startDictation({
      onText: (t) => editor.chain().focus().insertContent(`${t} `).run(),
      onEngine: (e) => setDictEngine(e),
      onEnd: () => { dictRef.current = null; setListening(false); setDictEngine(null); },
    });
    if (!h) { setListening(false); setDictEngine(null); return; }
    // Stop was pressed while we were still starting → don't leave it running.
    if (stopRequestedRef.current) {
      stopRequestedRef.current = false;
      h.stop();
      setListening(false);
      setDictEngine(null);
      return;
    }
    dictRef.current = h;
  }

  return (
    <div className="border border-gray-200 rounded">
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
        <Btn on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Heading 3">H3</Btn>
        <Btn on={() => editor.chain().focus().toggleHeading({ level: 4 }).run()} active={editor.isActive("heading", { level: 4 })} title="Heading 4">H4</Btn>
        <span className="w-px h-4 bg-gray-300 mx-0.5" />
        <Btn on={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold"><strong>B</strong></Btn>
        <Btn on={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic"><em>I</em></Btn>
        <Btn on={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Strikethrough"><s>S</s></Btn>
        <Btn on={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")} title="Inline code">{"</>"}</Btn>
        <span className="w-px h-4 bg-gray-300 mx-0.5" />
        <Btn on={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet list">• List</Btn>
        <Btn on={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered list">1. List</Btn>
        <Btn on={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Quote / callout">❝</Btn>
        <span className="w-px h-4 bg-gray-300 mx-0.5" />
        <Btn on={() => setLinkOpen(true)} active={editor.isActive("link")} title="Link">🔗</Btn>
        <Btn on={() => setImgPickerOpen(true)} title="Insert image from the library">🖼 Image</Btn>
        <Btn on={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Insert table">⊞ Table</Btn>
        {inTable && (
          <>
            <Btn on={() => editor.chain().focus().addRowAfter().run()} title="Add row">+Row</Btn>
            <Btn on={() => editor.chain().focus().addColumnAfter().run()} title="Add column">+Col</Btn>
            <Btn on={() => editor.chain().focus().deleteRow().run()} title="Delete row">−Row</Btn>
            <Btn on={() => editor.chain().focus().deleteColumn().run()} title="Delete column">−Col</Btn>
            <Btn on={() => editor.chain().focus().deleteTable().run()} title="Delete table">✕ Table</Btn>
          </>
        )}
        <span className="w-px h-4 bg-gray-300 mx-0.5" />
        <SymbolPicker onInsert={(text) => editor.chain().focus().insertContent(text).run()} />
        <span className="w-px h-4 bg-gray-300 mx-0.5" />
        <Btn on={toggleDictation} active={listening} title={listening ? "Stop dictation" : "Dictate into the text"}>
          {listening ? "● Stop" : "🎤 Dictate"}
        </Btn>
        <Btn on={() => setShowMicTest((s) => !s)} active={showMicTest} title="Test microphone">Test mic</Btn>
      </div>

      {(listening || showMicTest) && (
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-gray-50 px-3 py-1.5 text-[11px]">
          {listening && (
            <span className={`animate-pulse ${dictEngine === "browser" ? "text-red-500" : dictEngine === "deepgram" ? "text-blue-500" : "text-gray-500"}`}>
              ● {dictEngine === null ? "Starting…" : `Listening — ${dictEngine === "browser" ? "browser fallback" : "Deepgram (high quality)"}…`}
            </span>
          )}
          {showMicTest && (
            <span className="flex items-center gap-2">
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={mic.toggle}
                className={`px-2 py-0.5 rounded border ${mic.testing ? "border-green-300 bg-green-50 text-green-700" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
                {mic.testing ? "Stop test" : "Start test"}
              </button>
              {mic.testing && (
                <span className="w-24 h-2 bg-gray-200 rounded overflow-hidden inline-block align-middle">
                  <span className="block h-full bg-green-500" style={{ width: `${mic.level}%` }} />
                </span>
              )}
              {mic.device && <span className="text-gray-400">{mic.device}</span>}
              {mic.recordingUrl && <audio controls src={mic.recordingUrl} className="h-7" />}
              {mic.err && <span className="text-red-500">{mic.err}</span>}
            </span>
          )}
        </div>
      )}

      <EditorContent editor={editor} />

      {linkOpen && (
        <PromptDialog
          title="Link"
          message="Enter a URL (leave blank to remove the link)."
          defaultValue={(editor.getAttributes("link").href as string) ?? ""}
          placeholder="https://…  or  /help?c=…"
          onConfirm={(url) => {
            setLinkOpen(false);
            const v = url.trim();
            if (!v) editor.chain().focus().unsetLink().run();
            else editor.chain().focus().setLink({ href: v }).run();
          }}
          onCancel={() => setLinkOpen(false)}
        />
      )}

      {imgPickerOpen && (
        <ImagePickerDialog
          onClose={() => setImgPickerOpen(false)}
          onPick={(url, alt) => {
            // Insert the image as its own block with a blank line before and
            // after, so it never butts up against the surrounding text.
            editor.chain().focus().insertContent([
              { type: "paragraph" },
              { type: "image", attrs: { src: url, alt: alt ?? "" } },
              { type: "paragraph" },
            ]).run();
            setImgPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}
