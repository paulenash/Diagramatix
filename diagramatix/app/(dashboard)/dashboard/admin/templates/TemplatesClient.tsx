"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";

interface TemplateRow {
  id: string;
  name: string;
  diagramType: string;
  templateType: "builtin" | "user";
  group: string | null;
  description: string | null;
  thumbnailSvg: string | null;
  updatedAt: string;
  ownerEmail: string | null;
  hasElements: boolean;
}

export function TemplatesClient() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "builtin" | "user">("all");
  const [dtFilter, setDtFilter] = useState<string>("all");

  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [confirmDel, setConfirmDel] = useState<TemplateRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/admin/templates");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
      setRows(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const diagramTypes = useMemo(
    () => [...new Set(rows.map((r) => r.diagramType))].sort(),
    [rows],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      (typeFilter === "all" || r.templateType === typeFilter) &&
      (dtFilter === "all" || r.diagramType === dtFilter) &&
      (!q || r.name.toLowerCase().includes(q) || (r.group ?? "").toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q) || (r.ownerEmail ?? "").toLowerCase().includes(q)));
  }, [rows, search, typeFilter, dtFilter]);

  const counts = useMemo(() => ({
    builtin: rows.filter((r) => r.templateType === "builtin").length,
    user: rows.filter((r) => r.templateType === "user").length,
  }), [rows]);

  async function regen(templateId: string) {
    setBusyId(templateId); setStatus(null);
    try {
      const res = await fetch("/api/admin/templates/regenerate-thumbnails", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      const j = await res.json();
      if (!res.ok) { setStatus(`Error: ${j?.error ?? res.statusText}`); return; }
      setStatus(`Thumbnail regenerated (${j.updated} updated).`);
      await load();
    } catch (e) { setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusyId(null); }
  }

  async function bulkRegen(scope: "all" | "builtin") {
    setBulkBusy(true); setStatus(null);
    try {
      const res = await fetch("/api/admin/templates/regenerate-thumbnails", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const j = await res.json();
      if (!res.ok) { setStatus(`Error: ${j?.error ?? res.statusText}`); return; }
      setStatus(`Regenerated ${scope === "builtin" ? "built-ins" : "all"}: ${j.updated} updated, ${j.skipped} skipped (of ${j.total}).`);
      await load();
    } catch (e) { setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBulkBusy(false); }
  }

  async function saveEdit(patch: { name: string; group: string | null; description: string | null }) {
    if (!editing) return;
    setStatus(null);
    try {
      const res = await fetch(`/api/templates/${editing.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) { setStatus(`Error: ${(await res.json().catch(() => ({}))).error ?? res.statusText}`); return; }
      setEditing(null);
      setStatus("Template updated.");
      await load();
    } catch (e) { setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`); }
  }

  async function doDelete() {
    const t = confirmDel; if (!t) return;
    setConfirmDel(null); setStatus(null);
    try {
      const res = await fetch(`/api/templates/${t.id}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      if (!res.ok) { setStatus(`Error: ${(await res.json().catch(() => ({}))).error ?? res.statusText}`); return; }
      setStatus(`Deleted "${t.name}".`);
      await load();
    } catch (e) { setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`); }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <a href="/dashboard/admin" className="text-sm font-medium text-red-600 hover:text-red-700">← SuperAdmin</a>
        <div className="flex gap-1.5">
          <button onClick={() => bulkRegen("builtin")} disabled={bulkBusy}
            className="text-xs text-emerald-700 border border-emerald-300 hover:bg-emerald-50 rounded px-2.5 py-1 disabled:opacity-50">
            Regen built-ins ↻
          </button>
          <button onClick={() => bulkRegen("all")} disabled={bulkBusy}
            className="text-xs text-white bg-emerald-600 hover:bg-emerald-700 rounded px-2.5 py-1 disabled:opacity-50">
            {bulkBusy ? "Regenerating…" : "Regen all thumbnails ↻"}
          </button>
        </div>
      </div>

      <div>
        <h1 className="text-lg font-semibold text-gray-900">Template Management</h1>
        <p className="text-xs text-gray-500">Every diagram template — {counts.builtin} built-in · {counts.user} user. Thumbnails are auto-generated from each template&apos;s content; edit the name/group/description here, or regenerate a preview after a renderer change.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name / group / description / owner"
          className="flex-1 min-w-48 text-xs border border-gray-300 rounded px-2 py-1.5" />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="text-xs border border-gray-300 rounded px-2 py-1.5">
          <option value="all">All types</option>
          <option value="builtin">Built-in</option>
          <option value="user">User</option>
        </select>
        <select value={dtFilter} onChange={(e) => setDtFilter(e.target.value)}
          className="text-xs border border-gray-300 rounded px-2 py-1.5">
          <option value="all">All diagram types</option>
          {diagramTypes.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {status && <p className="text-xs text-gray-600">{status}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500 uppercase tracking-wide text-[10px]">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Preview</th>
                <th className="text-left px-3 py-2 font-medium">Name</th>
                <th className="text-left px-3 py-2 font-medium">Type</th>
                <th className="text-left px-3 py-2 font-medium">Group</th>
                <th className="text-left px-3 py-2 font-medium">Owner</th>
                <th className="text-right px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 align-top">
                  <td className="px-3 py-2">
                    <div className="w-24 h-16 bg-white border border-gray-100 rounded flex items-center justify-center overflow-hidden"
                      dangerouslySetInnerHTML={{ __html: t.thumbnailSvg ?? '<span style="font-size:9px;color:#9ca3af">no preview</span>' }} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{t.name}</div>
                    {t.description && <div className="text-[10px] text-gray-500 max-w-xs line-clamp-2">{t.description}</div>}
                    <div className="text-[10px] text-gray-400">{t.diagramType}{!t.hasElements && " · empty"}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${t.templateType === "builtin" ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                      {t.templateType}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{t.group ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2 text-gray-500">{t.ownerEmail ?? (t.templateType === "builtin" ? <span className="text-gray-300">system</span> : "—")}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => regen(t.id)} disabled={busyId === t.id}
                      className="text-emerald-700 hover:text-emerald-800 px-1.5 disabled:opacity-40" title="Regenerate this thumbnail from its data">
                      {busyId === t.id ? "…" : "↻"}
                    </button>
                    <button onClick={() => setEditing(t)} className="text-blue-600 hover:text-blue-800 px-1.5">Edit</button>
                    <button onClick={() => setConfirmDel(t)} className="text-red-600 hover:text-red-800 px-1.5">Delete</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No templates match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && <EditModal template={editing} onCancel={() => setEditing(null)} onSave={saveEdit} />}
      {confirmDel && (
        <ConfirmDialog
          title="Delete template"
          message={`Delete "${confirmDel.name}"${confirmDel.templateType === "builtin" ? " (a BUILT-IN template)" : confirmDel.ownerEmail ? ` — owned by ${confirmDel.ownerEmail}` : ""}? This cannot be undone.`}
          onConfirm={doDelete}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}

function EditModal({ template, onCancel, onSave }: {
  template: TemplateRow;
  onCancel: () => void;
  onSave: (patch: { name: string; group: string | null; description: string | null }) => void;
}) {
  const [name, setName] = useState(template.name);
  const [group, setGroup] = useState(template.group ?? "");
  const [description, setDescription] = useState(template.description ?? "");
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-lg shadow-xl p-4 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-gray-900">Edit template {template.templateType === "builtin" && <span className="text-[10px] text-blue-700">(built-in)</span>}</h3>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-gray-400">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5" />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-gray-400">Group</span>
          <input value={group} onChange={(e) => setGroup(e.target.value)} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5" />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-gray-400">Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5" />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCancel} className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
          <button onClick={() => onSave({ name: name.trim() || template.name, group: group.trim() || null, description: description.trim() || null })}
            disabled={!name.trim()}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  );
}
