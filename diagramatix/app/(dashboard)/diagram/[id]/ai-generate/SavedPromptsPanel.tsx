"use client";

/**
 * Item 3 — Saved Prompts, scrollable and filterable, at the top of the console.
 *
 * The sidebar's version was a 96px-high unfiltered list you dragged to resize.
 * On a full screen there is room to give it a proper filter, so the filter is
 * the one borrowed from Prompt Maintenance: it matches the NAME **or** the
 * TEXT, because somebody hunting for a prompt usually remembers a phrase from
 * inside it rather than what they called it.
 */
import { useMemo, useState } from "react";
import { AiPanel, type AiTones } from "./AiConsoleChrome";
import { filterSavedPrompts } from "@/app/lib/ai/savedPromptFilter";

export interface SavedPrompt { id: string; name: string; text: string; }

export function SavedPromptsPanel({
  prompts, tones, editingId, busy, onLoad, onDelete,
}: {
  prompts: SavedPrompt[];
  tones: AiTones;
  editingId: string | null;
  busy: boolean;
  onLoad: (sp: SavedPrompt) => void;
  onDelete: (id: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // The same rule as the two sidebar panels (savedPromptFilter.ts).
  const visible = useMemo(() => filterSavedPrompts(prompts, filter), [prompts, filter]);

  return (
    <AiPanel
      title="Saved prompts"
      tones={tones}
      hint={filter.trim() ? `${visible.length} of ${prompts.length}` : `${prompts.length}`}
      right={
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter name or text…"
          aria-label="Filter saved prompts"
          className="bg-black/60 border rounded px-2 py-0.5 text-[11px] w-56 focus:outline-none"
          style={{ borderColor: tones.line, color: tones.bright }}
        />
      }
      bodyClassName="p-0"
    >
      {prompts.length === 0 ? (
        <p className="px-3 py-2 text-[11px] text-white/40">
          No saved prompts yet. Write one below, then Save it.
        </p>
      ) : visible.length === 0 ? (
        <p className="px-3 py-2 text-[11px] text-white/40">
          Nothing matches &ldquo;{filter.trim()}&rdquo;.
        </p>
      ) : (
        <div className="max-h-44 overflow-y-auto divide-y" style={{ borderColor: tones.line }}>
          {visible.map((sp) => (
            <div key={sp.id} className="flex items-center gap-2 px-3 py-1 group hover:bg-white/5">
              {confirmId === sp.id ? (
                <>
                  <span className="flex-1 text-[11px] text-red-300 truncate">Delete &ldquo;{sp.name}&rdquo;?</span>
                  <button onClick={() => { onDelete(sp.id); setConfirmId(null); }}
                    className="text-[11px] text-red-300 hover:text-red-200 px-1">Yes</button>
                  <button onClick={() => setConfirmId(null)}
                    className="text-[11px] text-white/50 hover:text-white/80 px-1">No</button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => onLoad(sp)}
                    disabled={busy}
                    title={sp.text}
                    className="flex-1 text-left text-xs truncate py-0.5 disabled:opacity-40"
                    style={{ color: editingId === sp.id ? tones.bright : "rgba(255,255,255,0.75)" }}
                  >
                    {editingId === sp.id ? "▸ " : ""}{sp.name}{editingId === sp.id ? " (editing)" : ""}
                  </button>
                  <button
                    onClick={() => setConfirmId(sp.id)}
                    className="text-white/25 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 px-1"
                    title="Delete saved prompt"
                    aria-label={`Delete ${sp.name}`}
                  >&times;</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </AiPanel>
  );
}
