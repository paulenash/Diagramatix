"use client";
/**
 * Abracadabra Mode UI — a floating command bar. Shows the live-listening caption
 * (Stage 3 voice), a typed-command input, and a scrolling command log (heard →
 * did, per-entry undo). Presentational: all state + apply logic live in the
 * editor.
 */
import { useState } from "react";

export interface CommandLogEntry {
  id: string;
  heard: string;
  summary: string;
  ok: boolean;
}

export function AbracadabraBar({
  listening,
  engine,
  interim,
  busy,
  log,
  onSubmitText,
  onToggleListen,
  onClose,
}: {
  listening: boolean;
  engine: "deepgram" | "browser" | null;
  interim: string;
  busy: boolean;
  log: CommandLogEntry[];
  onSubmitText: (text: string) => void;
  onToggleListen: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onSubmitText(t);
    setText("");
  };

  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-4 z-40 w-[440px] max-w-[92vw] bg-white rounded-xl shadow-2xl border border-purple-200"
      onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <div className="flex items-center gap-2 text-sm font-semibold text-purple-800">
          <span>🪄 Abracadabra</span>
          {listening && <span className="text-[10px] font-normal text-red-500 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />listening{engine === "browser" ? " (browser)" : ""}…</span>}
          {busy && <span className="text-[10px] font-normal text-gray-400">thinking…</span>}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none" title="Close">×</button>
      </div>

      {/* Command log */}
      {log.length > 0 && (
        <div className="max-h-40 overflow-y-auto px-3 py-2 space-y-1 border-b border-gray-100">
          {log.map((e) => (
            <div key={e.id} className="text-[11px] flex items-start gap-2">
              <span className={e.ok ? "text-green-600" : "text-amber-600"}>{e.ok ? "✓" : "…"}</span>
              <span className="flex-1 min-w-0">
                <span className="text-gray-400">“{e.heard}”</span>
                <span className="text-gray-700"> → {e.summary}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Live caption + input */}
      <div className="px-3 py-2">
        {listening && interim && (
          <div className="text-[11px] text-purple-400 italic mb-1 truncate">“{interim}”</div>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleListen}
            className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white ${listening ? "bg-red-500 hover:bg-red-600" : "bg-purple-600 hover:bg-purple-700"}`}
            title={listening ? "Stop listening" : "Start listening"}
          >
            {listening ? "■" : "🎙"}
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder='Type or say: "add a task called Approve after Review"'
            className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-400"
          />
          <button onClick={submit} disabled={busy} className="shrink-0 text-xs text-white bg-purple-600 hover:bg-purple-700 rounded px-3 py-1.5 disabled:opacity-50">Run</button>
        </div>
      </div>
    </div>
  );
}
