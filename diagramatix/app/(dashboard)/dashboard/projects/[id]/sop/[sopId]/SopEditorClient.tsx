"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GuideEditor } from "@/app/(dashboard)/dashboard/admin/user-guide/GuideEditor";

interface Section {
  heading: string;
  bodyMarkdown: string;
  image?: string | null;
  key?: string | null;        // template section key (AI-derived) or null (author-added)
  aiBodyHash?: string | null; // hash of the AI's last output — round-tripped for edit detection
  locked?: boolean;           // "keep on regenerate"
}
interface RegenSummary { refreshed: number; kept: number; added: number; dropped: number }

/**
 * Edit a generated SOP: per-section heading + rich-text (markdown) body, add /
 * remove / reorder / LOCK sections, edit the title, Save (PUT /api/sop/:id) and
 * Export to Word. Regenerate MERGES fresh AI prose by section identity — author
 * edits, added sections, and locked sections survive — with one-level Undo.
 */
export function SopEditorClient({
  projectId, sopId, backHref, stale, initialTitle, initialStatus, initialScopeLabel, initialUndoAvailable, initialSections,
}: {
  projectId: string;
  sopId: string;
  backHref: string;
  stale: boolean;
  initialTitle: string;
  initialStatus: string;
  initialScopeLabel: string | null;
  initialUndoAvailable: boolean;
  initialSections: Section[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [status, setStatus] = useState(initialStatus);
  // A figure section always carries a visible "Process Diagram" heading (older ones
  // could be blank, which showed only the grey placeholder above the image).
  const [sections, setSections] = useState<Section[]>(() =>
    initialSections.map((s) => (s.image && !s.heading.trim() ? { ...s, heading: "Process Diagram" } : s)),
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  const [undoAvailable, setUndoAvailable] = useState(initialUndoAvailable);
  const [undoing, setUndoing] = useState(false);
  const [regenSummary, setRegenSummary] = useState<RegenSummary | null>(null);

  // Full-screen figure viewer — Esc to close.
  useEffect(() => {
    if (!zoomImg) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoomImg(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomImg]);

  const touch = () => setDirty(true);
  const setSection = (i: number, patch: Partial<Section>) => {
    setSections((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s))); touch();
  };
  const move = (i: number, dir: -1 | 1) => {
    setSections((prev) => {
      const j = i + dir; if (j < 0 || j >= prev.length) return prev;
      const next = [...prev]; [next[i], next[j]] = [next[j], next[i]]; return next;
    }); touch();
  };
  const remove = (i: number) => { setSections((prev) => prev.filter((_, j) => j !== i)); touch(); };
  const add = () => { setSections((prev) => [...prev, { heading: "New section", bodyMarkdown: "", key: null, locked: false }]); touch(); };
  const toggleLock = (i: number) => setSection(i, { locked: !sections[i].locked });

  async function reloadSections() {
    const res = await fetch(`/api/sop/${sopId}`);
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.document) {
      setSections((j.document.sections ?? []).map((s: Record<string, unknown>) => ({
        heading: (s.heading as string) ?? "", bodyMarkdown: (s.bodyMarkdown as string) ?? "",
        image: (s.image as string | null) ?? null, key: (s.key as string | null) ?? null,
        aiBodyHash: (s.aiBodyHash as string | null) ?? null, locked: s.locked === true,
      })));
      setUndoAvailable(!!j.document.prevSectionsJson);
      setDirty(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/sop/${sopId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, status, sections }),
      });
      if (res.ok) { setDirty(false); router.refresh(); }
    } finally { setSaving(false); }
  }

  async function regenerate() {
    setRegenerating(true); setErr(null); setConfirmRegen(false); setRegenSummary(null);
    try {
      const res = await fetch(`/api/sop/${sopId}/regenerate`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { setRegenSummary(j.summary ?? null); await reloadSections(); router.refresh(); return; }
      setErr(j.error ?? "Regeneration failed");
    } catch { setErr("Regeneration failed"); }
    finally { setRegenerating(false); }
  }

  async function undoRegen() {
    setUndoing(true); setErr(null);
    try {
      const res = await fetch(`/api/sop/${sopId}/undo-regenerate`, { method: "POST" });
      if (res.ok) { setRegenSummary(null); await reloadSections(); router.refresh(); return; }
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "Undo failed");
    } catch { setErr("Undo failed"); }
    finally { setUndoing(false); }
  }

  async function del() {
    await fetch(`/api/sop/${sopId}`, { method: "DELETE" });
    router.push(`/dashboard/projects/${projectId}`);
  }

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => router.push(backHref)}
            className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1 shrink-0" title="Return to where you came from">
            <span style={{ fontSize: "1.5em", lineHeight: 1 }}>{"←"}</span><span className="underline">Back</span>
          </button>
          <input value={title} onChange={(e) => { setTitle(e.target.value); touch(); }}
            className="text-lg font-semibold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-400 outline-none min-w-0 flex-1" />
          {initialScopeLabel && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">{initialScopeLabel}</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select value={status} onChange={(e) => { setStatus(e.target.value); touch(); }}
            className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-white text-gray-700">
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
          {undoAvailable && (
            <button onClick={undoRegen} disabled={undoing}
              className="px-3 py-1.5 text-xs text-amber-700 border border-amber-300 rounded hover:bg-amber-50 disabled:opacity-40"
              title="Revert the last regenerate">{undoing ? "Undoing…" : "↶ Undo regen"}</button>
          )}
          {confirmRegen ? (
            <span className="flex items-center gap-1">
              <span className="text-[10px] text-gray-500">Regenerate — keeps your edits, added &amp; locked sections?</span>
              <button onClick={regenerate} className="px-2 py-1.5 text-xs text-white bg-amber-600 rounded hover:bg-amber-700">Regenerate</button>
              <button onClick={() => setConfirmRegen(false)} className="px-2 py-1.5 text-xs text-gray-600 border border-gray-300 rounded">Cancel</button>
            </span>
          ) : (
            <button onClick={() => setConfirmRegen(true)} disabled={regenerating}
              className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
              title="Re-run the AI over the source diagram and MERGE it in — your edited, added and locked sections are kept">
              {regenerating ? "Regenerating…" : "Regenerate"}
            </button>
          )}
          <a href={`/api/sop/${sopId}/export`}
            className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50">Export .docx</a>
          <button onClick={save} disabled={!dirty || saving}
            className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-40">
            {saving ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
          {confirmDelete ? (
            <span className="flex items-center gap-1">
              <button onClick={del} className="px-2 py-1.5 text-xs text-white bg-red-600 rounded hover:bg-red-700">Delete</button>
              <button onClick={() => setConfirmDelete(false)} className="px-2 py-1.5 text-xs text-gray-600 border border-gray-300 rounded">Cancel</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50" title="Delete this SOP">Delete</button>
          )}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">
        {stale && (
          <div className="flex items-center justify-between gap-3 text-xs bg-amber-50 border border-amber-300 text-amber-800 rounded px-3 py-2">
            <span><strong>⚠ SOP Regeneration required.</strong> The source diagram has changed since this SOP was generated — regenerate to bring it up to date. Your edits, added and 🔒 locked sections are kept.</span>
            <button onClick={() => setConfirmRegen(true)} disabled={regenerating}
              className="shrink-0 px-2 py-1 text-white bg-amber-600 rounded hover:bg-amber-700 disabled:opacity-40">Regenerate</button>
          </div>
        )}
        {regenSummary && (
          <div className="flex items-center justify-between gap-3 text-xs bg-green-50 border border-green-200 text-green-800 rounded px-3 py-2">
            <span>
              <strong>Regenerated.</strong> {regenSummary.refreshed} refreshed · {regenSummary.kept} kept (your edits / added / locked)
              {regenSummary.added ? ` · ${regenSummary.added} new` : ""}{regenSummary.dropped ? ` · ${regenSummary.dropped} removed` : ""}.
              {undoAvailable ? " Use ↶ Undo regen to revert." : ""}
            </span>
            <button onClick={() => setRegenSummary(null)} className="shrink-0 text-green-700 hover:text-green-900" title="Dismiss">✕</button>
          </div>
        )}
        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</p>}
        {sections.map((s, i) => (
          <div key={i} className={`bg-white border rounded-lg p-4 ${s.locked ? "border-amber-300" : "border-gray-200"}`}>
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => toggleLock(i)}
                className={`text-xs px-1 ${s.locked ? "text-amber-600" : "text-gray-300 hover:text-gray-500"}`}
                title={s.locked ? "Locked — kept as-is on regenerate. Click to unlock." : "Lock — keep this section as-is on regenerate"}>
                {s.locked ? "🔒" : "🔓"}
              </button>
              <input value={s.heading} onChange={(e) => setSection(i, { heading: e.target.value })}
                className="flex-1 text-sm font-semibold text-gray-800 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-400 outline-none"
                placeholder="Section heading" />
              {s.image
                ? <span className="text-[8px] uppercase text-indigo-600 bg-indigo-50 border border-indigo-200 rounded px-1 shrink-0" title="The process diagram figure — leads the document and is kept on regenerate">Figure</span>
                : !s.key && <span className="text-[8px] uppercase text-blue-600 bg-blue-50 border border-blue-200 rounded px-1 shrink-0" title="Author-added — always kept on regenerate">Added</span>}
              <button onClick={() => move(i, -1)} disabled={i === 0} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs px-1" title="Move up">↑</button>
              <button onClick={() => move(i, 1)} disabled={i === sections.length - 1} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs px-1" title="Move down">↓</button>
              <button onClick={() => remove(i)} className="text-red-500 hover:text-red-700 text-xs px-1" title="Remove section">✕</button>
            </div>
            {/* Figure sections show the image directly under the "Process Diagram"
                heading (no empty body box between). Text sections get the editor. */}
            {!s.image && <GuideEditor value={s.bodyMarkdown} onChange={(md) => setSection(i, { bodyMarkdown: md })} />}
            {s.image && (
              <div className="mt-2 flex flex-col items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.image} alt={s.heading || "Figure"} onClick={() => setZoomImg(s.image!)}
                  className="max-w-full border border-gray-200 rounded cursor-zoom-in" title="Click to view full screen" />
                <div className="flex items-center gap-3">
                  <button onClick={() => setZoomImg(s.image!)} className="text-[10px] text-blue-600 hover:underline">⤢ Full screen</button>
                  <button onClick={() => setSection(i, { image: null })} className="text-[10px] text-red-500 hover:underline">Remove figure</button>
                </div>
              </div>
            )}
          </div>
        ))}
        <button onClick={add} className="w-full py-2 text-xs text-blue-600 border border-dashed border-blue-300 rounded hover:bg-blue-50">+ Add section</button>
      </div>

      {zoomImg && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6 cursor-zoom-out"
          onClick={() => setZoomImg(null)} title="Click or press Esc to close">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoomImg} alt="Diagram figure" className="max-w-full max-h-full object-contain" onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setZoomImg(null)}
            className="absolute top-4 right-5 text-white/90 hover:text-white text-2xl leading-none" title="Close (Esc)">✕</button>
        </div>
      )}
    </div>
  );
}
