"use client";

import { useState } from "react";
import { symbolGlyphSvg } from "@/app/lib/help/symbolGlyph";

// The special characters the guide uses in its copy.
const GLYPHS = ["→", "←", "↑", "↓", "▾", "▸", "◈", "⧉", "×", "+", "⬠", "▪", "«", "»", "“", "”", "…", "‹", "›", "✕", "✦", "•"];

// Diagram symbols offered as inline thumbnails (insert `:sym[type]:`).
const SYMS = [
  "task", "subprocess", "start-event", "intermediate-event", "end-event",
  "gateway", "gateway-exclusive", "gateway-parallel", "gateway-inclusive",
  "pool", "lane", "data-object", "data-store", "actor",
  "flowchart-process", "flowchart-decision", "flowchart-terminator",
  "flowchart-io", "flowchart-document",
];

export function SymbolPicker({ onInsert }: { onInsert: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"glyphs" | "symbols">("glyphs");

  const tabCls = (t: typeof tab) =>
    `px-2 py-0.5 text-[11px] rounded ${tab === t ? "bg-blue-100 text-blue-700 font-medium" : "text-gray-500 hover:bg-gray-100"}`;

  return (
    <div className="relative">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        title="Insert a special symbol"
        className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
      >
        ⬠ Symbols ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute z-30 mt-1 w-72 bg-white border border-gray-200 rounded shadow-lg p-2">
            <div className="flex gap-1 mb-2">
              <button type="button" onClick={() => setTab("glyphs")} className={tabCls("glyphs")}>Glyphs</button>
              <button type="button" onClick={() => setTab("symbols")} className={tabCls("symbols")}>Diagram symbols</button>
            </div>
            {tab === "glyphs" ? (
              <div className="grid grid-cols-8 gap-1">
                {GLYPHS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { onInsert(g); setOpen(false); }}
                    className="h-7 text-base text-gray-800 rounded border border-gray-100 hover:bg-blue-50"
                  >
                    {g}
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-1">
                {SYMS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    title={t}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { onInsert(`:sym[${t}]: `); setOpen(false); }}
                    className="h-9 flex items-center justify-center rounded border border-gray-100 hover:bg-blue-50"
                    dangerouslySetInnerHTML={{ __html: symbolGlyphSvg(t) }}
                  />
                ))}
              </div>
            )}
            <p className="text-[10px] text-gray-400 mt-2">
              Diagram symbols insert a <code>:sym[type]:</code> tag rendered as an icon in the guide.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
