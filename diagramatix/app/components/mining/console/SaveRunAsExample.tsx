"use client";

/** Admin-only: capture this run (log + reference SM) into a NEW draft
 *  Mining-Example catalog entry. Mirrors the Simulator's "Save as example".
 *
 *  Its own file since Phase 0.2 — it is the one part of the run panel that no
 *  ordinary user ever sees, and it shares nothing with the rest of it. */

import { useState } from "react";

export function SaveRunAsExample({ projectId, runId, defaultTitle }: { projectId: string; runId: string; defaultTitle: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [concept, setConcept] = useState("");
  const [difficulty, setDifficulty] = useState("core");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function capture() {
    if (!title.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/mining-examples/capture`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, runId, title: title.trim(), concept: concept.trim(), difficulty }),
      });
      const json = await res.json().catch(() => ({}));
      setMsg(res.ok ? "Saved as a draft example ✓ — publish it in the Catalog manager." : (json.error ?? "Capture failed"));
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-4 pt-3 border-t border-stone-700">
      {!open ? (
        <button onClick={() => setOpen(true)} className="text-amber-300/70 hover:text-amber-200 text-[10px] uppercase tracking-widest">
          ⎘ Save run as example
        </button>
      ) : (
        <div className="flex flex-col gap-1.5 text-[11px] max-w-md">
          <span className="text-amber-300/70 uppercase tracking-widest text-[10px]">Save as example (admin)</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="title"
            className="bg-stone-900 border border-amber-500/40 rounded px-1.5 py-0.5 text-amber-100 [color-scheme:dark]" />
          <input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="one-line concept"
            className="bg-stone-900 border border-amber-500/40 rounded px-1.5 py-0.5 text-amber-100 [color-scheme:dark]" />
          <div className="flex items-center gap-2">
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="bg-stone-900 border border-amber-500/40 rounded px-1 py-0.5 text-amber-100 [color-scheme:dark]">
              <option value="intro">intro</option><option value="core">core</option><option value="advanced">advanced</option>
            </select>
            <button onClick={capture} disabled={busy} className="text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white rounded px-3 py-1">{busy ? "…" : "Capture"}</button>
            <button onClick={() => setOpen(false)} className="text-amber-300/50 hover:text-amber-200 text-[10px]">cancel</button>
          </div>
          {msg && <span className="text-amber-200 text-[10px]">{msg}</span>}
        </div>
      )}
    </div>
  );
}
