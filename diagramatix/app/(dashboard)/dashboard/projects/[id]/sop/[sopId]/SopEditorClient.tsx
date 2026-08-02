"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GuideEditor } from "@/app/(dashboard)/dashboard/admin/user-guide/GuideEditor";

interface Section { heading: string; bodyMarkdown: string; image?: string | null }

/**
 * Edit a generated SOP: per-section heading + rich-text (markdown) body, add /
 * remove / reorder sections, edit the title, Save (PUT /api/sop/:id) and Export
 * to Word (/api/sop/:id/export). Reuses the User-Guide TipTap body editor.
 */
export function SopEditorClient({
  projectId, sopId, backHref, initialTitle, initialStatus, initialScopeLabel, initialSections,
}: {
  projectId: string;
  sopId: string;
  backHref: string;
  initialTitle: string;
  initialStatus: string;
  initialScopeLabel: string | null;
  initialSections: Section[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [status, setStatus] = useState(initialStatus);
  const [sections, setSections] = useState<Section[]>(initialSections);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [zoomImg, setZoomImg] = useState<string | null>(null);

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
  const add = () => { setSections((prev) => [...prev, { heading: "New section", bodyMarkdown: "" }]); touch(); };

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
    setRegenerating(true); setErr(null); setConfirmRegen(false);
    try {
      const res = await fetch(`/api/sop/${sopId}/regenerate`, { method: "POST" });
      if (res.ok) { window.location.reload(); return; } // reload to show the fresh sections
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "Regeneration failed");
    } catch { setErr("Regeneration failed"); }
    finally { setRegenerating(false); }
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
          {confirmRegen ? (
            <span className="flex items-center gap-1">
              <span className="text-[10px] text-gray-500">Replace all AI sections?</span>
              <button onClick={regenerate} className="px-2 py-1.5 text-xs text-white bg-amber-600 rounded hover:bg-amber-700">Regenerate</button>
              <button onClick={() => setConfirmRegen(false)} className="px-2 py-1.5 text-xs text-gray-600 border border-gray-300 rounded">Cancel</button>
            </span>
          ) : (
            <button onClick={() => setConfirmRegen(true)} disabled={regenerating}
              className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
              title="Re-run the AI over the source diagram, replacing the text sections (keeps the figure)">
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
        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</p>}
        {sections.map((s, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <input value={s.heading} onChange={(e) => setSection(i, { heading: e.target.value })}
                className="flex-1 text-sm font-semibold text-gray-800 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-400 outline-none"
                placeholder="Section heading" />
              <button onClick={() => move(i, -1)} disabled={i === 0} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs px-1" title="Move up">↑</button>
              <button onClick={() => move(i, 1)} disabled={i === sections.length - 1} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs px-1" title="Move down">↓</button>
              <button onClick={() => remove(i)} className="text-red-500 hover:text-red-700 text-xs px-1" title="Remove section">✕</button>
            </div>
            <GuideEditor value={s.bodyMarkdown} onChange={(md) => setSection(i, { bodyMarkdown: md })} />
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
