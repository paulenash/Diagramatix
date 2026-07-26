"use client";

/**
 * Movable, medium-sized popup for viewing/editing the AI prompt that generated
 * the current diagram — opened from the "AI Prompt" link in the Diagram
 * Properties panel instead of navigating away to Prompt Maintenance. Loads the
 * prompt's current text, lets the user edit it, then Save (PUT /api/prompts/[id])
 * or Cancel. Drag the header to move it. Centred over the canvas on open.
 */
import { useEffect, useRef, useState } from "react";

export function PromptEditPopup({ promptId, promptName, initialText, onClose, onSaved }: {
  promptId: string;
  promptName: string;
  initialText: string;
  onClose: () => void;
  onSaved?: (text: string) => void;
}) {
  const [text, setText] = useState(initialText);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  // Load the prompt's CURRENT text (the diagram only carries a snapshot).
  useEffect(() => {
    let on = true;
    fetch(`/api/prompts/${promptId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (on && j && typeof j.text === "string") setText(j.text); })
      .catch(() => { /* keep the snapshot */ })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [promptId]);

  // Centre over the viewport on open.
  useEffect(() => {
    const W = 560, H = 420;
    setPos({
      left: Math.max(16, Math.round((window.innerWidth - W) / 2)),
      top: Math.max(16, Math.round((window.innerHeight - H) / 2)),
    });
  }, []);

  function onHeaderDown(e: React.PointerEvent) {
    if (!pos) return;
    drag.current = { x: e.clientX, y: e.clientY, left: pos.left, top: pos.top };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onHeaderMove(e: React.PointerEvent) {
    if (!drag.current) return;
    setPos({
      left: drag.current.left + (e.clientX - drag.current.x),
      top: drag.current.top + (e.clientY - drag.current.y),
    });
  }
  function onHeaderUp(e: React.PointerEvent) {
    drag.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  }

  async function save() {
    setSaving(true); setError(null);
    try {
      const r = await fetch(`/api/prompts/${promptId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error ?? "Save failed"); }
      onSaved?.(text);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!pos) return null;
  return (
    <div
      className="fixed z-[80] w-[560px] max-w-[92vw] bg-white rounded-lg shadow-2xl border border-gray-300 flex flex-col"
      style={{ left: pos.left, top: pos.top }}
    >
      <div
        onPointerDown={onHeaderDown}
        onPointerMove={onHeaderMove}
        onPointerUp={onHeaderUp}
        className="flex items-center justify-between px-4 py-2 border-b border-gray-200 cursor-move select-none rounded-t-lg bg-gray-50"
      >
        <span className="text-xs font-semibold text-gray-800 truncate">AI Prompt: {promptName}</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-base leading-none" title="Close">&times;</button>
      </div>
      <div className="p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={loading}
          autoFocus
          className="w-full h-72 text-xs border border-gray-300 rounded p-2 text-gray-800 resize-y leading-relaxed"
          placeholder={loading ? "Loading…" : "Prompt text"}
        />
        {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-gray-400">Editing the current version of this prompt.</span>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={saving} className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={save} disabled={saving || loading || !text.trim()} className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
