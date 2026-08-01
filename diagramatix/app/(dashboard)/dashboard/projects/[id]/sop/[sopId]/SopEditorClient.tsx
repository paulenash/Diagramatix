"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GuideEditor } from "@/app/(dashboard)/dashboard/admin/user-guide/GuideEditor";

interface Section { heading: string; bodyMarkdown: string }

/**
 * Edit a generated SOP: per-section heading + rich-text (markdown) body, add /
 * remove / reorder sections, edit the title, Save (PUT /api/sop/:id) and Export
 * to Word (/api/sop/:id/export). Reuses the User-Guide TipTap body editor.
 */
export function SopEditorClient({
  projectId, sopId, initialTitle, initialStatus, initialScopeLabel, initialSections,
}: {
  projectId: string;
  sopId: string;
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

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => router.push(`/dashboard/projects/${projectId}`)}
            className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1 shrink-0" title="Back to project">
            <span style={{ fontSize: "1.5em", lineHeight: 1 }}>{"←"}</span><span className="underline">Project</span>
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
          <a href={`/api/sop/${sopId}/export`}
            className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50">Export .docx</a>
          <button onClick={save} disabled={!dirty || saving}
            className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-40">
            {saving ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">
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
          </div>
        ))}
        <button onClick={add} className="w-full py-2 text-xs text-blue-600 border border-dashed border-blue-300 rounded hover:bg-blue-50">+ Add section</button>
      </div>
    </div>
  );
}
