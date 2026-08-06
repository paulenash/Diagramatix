"use client";
/**
 * Per-diagram Properties aside on the Project Screen (item 2). Shown when a
 * diagram TILE is single-clicked (double-click opens the editor). Mirrors the
 * dashboard's Project Properties panel: a right-side `border-l` aside with a ✕
 * to clear. Shows only the sections that exist for the diagram's TYPE — Title,
 * Diagram Details, Diagram Owner (all types) + Process Owner, Procedure
 * Document, Process Classification (BPMN only). Never Pain Points / Issues /
 * Review Comments.
 *
 * Editable + save-back: data-JSON fields (purpose, description, title,
 * processOwner, procedureDoc) save via a GET-fresh → merge → PUT(version)
 * round-trip so a concurrent editor is never clobbered (409 → reopen to retry);
 * the diagram name saves via a metadata PUT. Diagram Owner and PCF are shown
 * read-only here (their pickers live in the editor).
 */
import { useState } from "react";
import { RichTextEditor } from "@/app/components/canvas/RichTextEditor";
import { isRichText, sanitizeRichText, plainToHtml } from "@/app/lib/diagram/richText";
import type { DiagramData } from "@/app/lib/diagram/types";

interface DiagramLite {
  id: string;
  name: string;
  type: string;
  data?: unknown;
  version?: number;
  diagramOwner?: { name: string | null; email: string | null } | null;
}

export function DiagramPropertiesPanel({
  diagram,
  readOnly,
  onClose,
  onOpen,
  onLocalPatch,
}: {
  diagram: DiagramLite;
  readOnly: boolean;
  onClose: () => void;
  onOpen: () => void;
  onLocalPatch: (patch: { name?: string; data?: unknown; version?: number }) => void;
}) {
  const data = (diagram.data ?? {}) as DiagramData;
  const isBpmn = diagram.type === "bpmn";
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const disabled = readOnly || saving;
  const descHtml = data.description
    ? (isRichText(data.description) ? sanitizeRichText(data.description) : plainToHtml(data.description))
    : "<span class='text-gray-400'>—</span>";

  // Save a partial DiagramData patch: GET fresh → merge → PUT (compare-and-swap
  // on version), so we never clobber a concurrent editor.
  async function saveData(patch: Partial<DiagramData>) {
    setSaving(true);
    setErr(null);
    try {
      const getRes = await fetch(`/api/diagrams/${diagram.id}`, { cache: "no-store" });
      if (!getRes.ok) throw new Error("load");
      const server = await getRes.json();
      const fresh = (server?.data ?? {}) as DiagramData;
      const version = typeof server?.version === "number" ? server.version : diagram.version;
      const merged = { ...fresh, ...patch };
      const putRes = await fetch(`/api/diagrams/${diagram.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: merged, version }),
      });
      if (putRes.status === 409) { setErr("Someone else just changed this diagram — reopen it to retry."); return; }
      if (!putRes.ok) throw new Error("save");
      const updated = await putRes.json().catch(() => null);
      onLocalPatch({ data: merged, version: typeof updated?.version === "number" ? updated.version : undefined });
    } catch { setErr("Couldn't save — please try again."); }
    finally { setSaving(false); }
  }

  async function saveName(name: string) {
    if (name === diagram.name) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/diagrams/${diagram.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      onLocalPatch({ name });
    } catch { setErr("Couldn't rename — please try again."); }
    finally { setSaving(false); }
  }

  const inputCls = "w-full text-[11px] border border-gray-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500";
  const labelCls = "block text-[10px] font-medium text-gray-500 mb-0.5";
  const title = data.title ?? {};
  const po = data.processOwner ?? {};
  const pd = data.procedureDoc;
  const owner = diagram.diagramOwner;

  return (
    <aside className="w-72 shrink-0 border-l border-gray-200 bg-white p-3 overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Diagram Properties</span>
        <div className="flex items-center gap-2">
          <button onClick={onOpen} className="text-[10px] text-blue-600 hover:text-blue-700" title="Open this diagram">Open ↗</button>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm leading-none" title="Close">✕</button>
        </div>
      </div>

      {err && <div className="mb-2 text-[10px] text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">{err}</div>}

      {/* Title */}
      <div className="mb-3">
        <div className="text-[9px] font-semibold text-gray-600 italic mb-1">Title</div>
        <label className={labelCls}>Name</label>
        <input type="text" className={inputCls} defaultValue={diagram.name} disabled={disabled}
          onBlur={(e) => saveName(e.target.value.trim())}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        <div className="grid grid-cols-2 gap-1 mt-1">
          <div>
            <label className={labelCls}>Version</label>
            <input type="text" className={inputCls} defaultValue={title.version ?? ""} disabled={disabled}
              onBlur={(e) => saveData({ title: { ...title, version: e.target.value } })} />
          </div>
          <div>
            <label className={labelCls}>Authors</label>
            <input type="text" className={inputCls} defaultValue={title.authors ?? ""} disabled={disabled}
              onBlur={(e) => saveData({ title: { ...title, authors: e.target.value } })} />
          </div>
        </div>
      </div>

      {/* Diagram Details */}
      <div className="mb-3">
        <div className="text-[9px] font-semibold text-gray-600 italic mb-1">Diagram Details</div>
        <label className={labelCls}>Purpose</label>
        <textarea className={`${inputCls} resize-none overflow-auto`} rows={2} defaultValue={data.purpose ?? ""} disabled={disabled}
          onBlur={(e) => saveData({ purpose: e.target.value || undefined })} placeholder="What this diagram is for…" />
        <label className={`${labelCls} mt-1`}>Description</label>
        {disabled ? (
          <div className="dgx-rich-desc text-[11px] border border-gray-200 rounded px-2 py-1 bg-gray-50 text-gray-600 min-h-[3rem]"
            dangerouslySetInnerHTML={{ __html: descHtml }} />
        ) : (
          <RichTextEditor
            key={`diag-desc-${diagram.id}`}
            value={data.description ?? ""}
            onChange={(html) => saveData({ description: html || undefined })}
          />
        )}
      </div>

      {/* Diagram Owner — read-only here (picker lives in the editor) */}
      <div className="mb-3">
        <div className="text-[9px] font-semibold text-gray-600 italic mb-1">Diagram Owner</div>
        {owner?.name || owner?.email ? (
          <div className="text-[11px] text-gray-700 leading-tight">
            {owner.name && <div>{owner.name}</div>}
            {owner.email && <div className="text-gray-400 text-[10px]">{owner.email}</div>}
          </div>
        ) : (
          <div className="text-[10px] text-gray-400">Not set — assign it in the diagram.</div>
        )}
      </div>

      {isBpmn && (
        <>
          {/* Process Owner */}
          <div className="mb-3">
            <div className="text-[9px] font-semibold text-gray-600 italic mb-1">Process Owner</div>
            <label className={labelCls}>Name</label>
            <input type="text" className={inputCls} defaultValue={po.name ?? ""} disabled={disabled}
              onBlur={(e) => saveData({ processOwner: { ...po, name: e.target.value } })} />
            <label className={`${labelCls} mt-1`}>Email</label>
            <input type="text" className={inputCls} defaultValue={po.email ?? ""} disabled={disabled}
              onBlur={(e) => saveData({ processOwner: { ...po, email: e.target.value } })} />
          </div>

          {/* Procedure Document */}
          <div className="mb-3">
            <div className="text-[9px] font-semibold text-gray-600 italic mb-1">Procedure Document</div>
            <label className={labelCls}>Link (URL)</label>
            <input type="text" className={inputCls} defaultValue={pd?.url ?? ""} disabled={disabled}
              onBlur={(e) => {
                const url = e.target.value.trim();
                saveData({ procedureDoc: url ? { url, name: pd?.name } : undefined });
              }} placeholder="https://…" />
            <label className={`${labelCls} mt-1`}>Label</label>
            <input type="text" className={inputCls} defaultValue={pd?.name ?? ""} disabled={disabled || !pd?.url}
              onBlur={(e) => { if (pd?.url) saveData({ procedureDoc: { url: pd.url, name: e.target.value } }); }} />
          </div>

          {/* Process Classification (PCF) — read-only here */}
          <div className="mb-1">
            <div className="text-[9px] font-semibold text-gray-600 italic mb-1">Process Classification (PCF)</div>
            {data.pcf ? (
              <div className="text-[11px] text-gray-700 leading-tight">
                <div>{data.pcf.name}</div>
                <div className="text-gray-400 text-[10px]">{data.pcf.hierarchyId} · {data.pcf.frameworkName ?? data.pcf.frameworkId}</div>
              </div>
            ) : (
              <div className="text-[10px] text-gray-400">Not classified — set it in the diagram.</div>
            )}
          </div>
        </>
      )}

      {readOnly && <div className="mt-2 text-[9px] text-gray-400">View-only share — fields are read-only.</div>}
    </aside>
  );
}
