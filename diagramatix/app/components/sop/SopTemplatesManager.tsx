"use client";

import { useEffect, useRef, useState } from "react";

interface Tpl { id: string; name: string; isDefault: boolean; docxTemplateName: string | null; hasDocx: boolean; updatedAt: string }

/**
 * Manage SOP templates for one scope (an Org or a Project). Upload a Word
 * (.docx/.dotx) template — its fonts + heading styles are adopted when an SOP is
 * exported — mark one as the default, rename, or delete. Reused by the OrgAdmin
 * and project SOP-templates pages.
 */
export function SopTemplatesManager({ scope, scopeId }: { scope: "org" | "project"; scopeId: string }) {
  const qs = scope === "org" ? `orgId=${scopeId}` : `projectId=${scopeId}`;
  const [rows, setRows] = useState<Tpl[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/sop-templates?${qs}`);
      const j = await res.json().catch(() => ({}));
      if (res.ok) setRows(j.templates ?? []);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [scopeId]);

  async function upload() {
    setErr(null);
    if (!name.trim()) { setErr("Give the template a name."); return; }
    const file = fileRef.current?.files?.[0];
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("scope", scope);
      fd.set(scope === "org" ? "orgId" : "projectId", scopeId);
      fd.set("name", name.trim());
      fd.set("isDefault", String(isDefault));
      if (file) fd.set("file", file);
      const res = await fetch("/api/sop-templates", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? "Upload failed"); return; }
      setName(""); setIsDefault(false); if (fileRef.current) fileRef.current.value = "";
      await load();
    } finally { setBusy(false); }
  }

  async function setDefault(id: string) {
    await fetch(`/api/sop-templates/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isDefault: true }) });
    load();
  }
  async function del(id: string) {
    await fetch(`/api/sop-templates/${id}`, { method: "DELETE" });
    setConfirmDelete(null); load();
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
      {/* Upload */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Add a template</h2>
        <p className="text-xs text-gray-500 mb-3">Upload your organisation&rsquo;s Word template (.docx / .dotx). Its fonts and heading styles are applied when an SOP is exported. Leave the file empty for a name-only template (uses the built-in look).</p>
        <div className="flex flex-wrap items-center gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name"
            className="flex-1 min-w-[160px] text-xs border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-800" />
          <input ref={fileRef} type="file" accept=".docx,.dotx"
            className="text-xs text-gray-600 file:mr-2 file:text-xs file:border file:border-gray-300 file:rounded file:px-2 file:py-1 file:bg-gray-50" />
          <label className="flex items-center gap-1 text-[11px] text-gray-700"><input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} /> Default</label>
          <button onClick={upload} disabled={busy} className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">{busy ? "Uploading…" : "Add"}</button>
        </div>
        {err && <p className="text-[11px] text-red-600 mt-2">{err}</p>}
      </div>

      {/* List */}
      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
        {loading ? (
          <p className="text-xs text-gray-400 px-4 py-3">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-gray-400 px-4 py-3">No templates yet. Add one above — until then, SOP exports use the built-in look.</p>
        ) : rows.map((t) => (
          <div key={t.id} className="flex items-center gap-2 px-4 py-2.5">
            <span className="text-sm text-gray-800 flex-1 min-w-0 truncate">
              {t.name}
              {t.isDefault && <span className="ml-2 text-[9px] uppercase tracking-wide text-green-700 bg-green-50 border border-green-200 rounded px-1 py-0.5">Default</span>}
              {t.hasDocx ? <span className="ml-2 text-[10px] text-gray-400 truncate" title={t.docxTemplateName ?? ""}>📄 {t.docxTemplateName}</span> : <span className="ml-2 text-[10px] text-gray-300">no Word file</span>}
            </span>
            {!t.isDefault && <button onClick={() => setDefault(t.id)} className="text-[11px] text-blue-600 hover:underline shrink-0">Set default</button>}
            {confirmDelete === t.id ? (
              <>
                <button onClick={() => del(t.id)} className="text-[11px] text-white bg-red-600 rounded px-2 py-0.5 shrink-0">Confirm</button>
                <button onClick={() => setConfirmDelete(null)} className="text-[11px] text-gray-500 hover:underline shrink-0">Cancel</button>
              </>
            ) : (
              <button onClick={() => setConfirmDelete(t.id)} className="text-[11px] text-red-500 hover:underline shrink-0">Delete</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
