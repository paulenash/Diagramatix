"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { SharePointPicker } from "@/app/components/SharePointPicker";
import {
  childLevelFor, isFlatKind, toSuggestions, FLAT_LEVEL_FOR,
  ENTITY_NODE_LEVEL_LABELS, idsWithChildren, visibleSuggestions,
  type EntityListDTO, type EntityNodeLevel,
} from "@/app/lib/entityLists/types";

/**
 * Reusable editor for ONE entity list. Flat (Participants / IT Systems) or
 * hierarchical (Org Structure) by `list.kind`. CRUDs nodes against
 * `${basePath}/${list.id}/nodes`, calling `onChange` to refresh the parent.
 * Read-only when `canEdit` is false.
 */
export function EntityListEditor({
  list, basePath, canEdit, onChange,
}: {
  list: EntityListDTO;
  basePath: string;            // /api/orgs/[id]/entity-lists or /api/projects/[id]/entity-lists
  canEdit: boolean;
  onChange: () => void;
}) {
  const flat = isFlatKind(list.kind);
  const flatLevel: EntityNodeLevel = FLAT_LEVEL_FOR[list.kind] ?? "Participant";
  const isDocuments = list.kind === "Document";
  const suggestions = toSuggestions(list.nodes);
  const nodeById = new Map(list.nodes.map((n) => [n.id, n]));

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [addParent, setAddParent] = useState<string | null | "top">(null); // node id, null=flat add, "top"=closed
  const [addVal, setAddVal] = useState("");
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);
  const [spNode, setSpNode] = useState<string | null>(null); // Document node being linked to SharePoint
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()); // hierarchy: collapsed node ids
  const toggleCollapse = (id: string) => setCollapsed((prev) => {
    const nx = new Set(prev); if (nx.has(id)) nx.delete(id); else nx.add(id); return nx;
  });

  const nodesUrl = `${basePath}/${list.id}/nodes`;

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error ?? "Action failed"); return false; }
      onChange();
      return true;
    } finally { setBusy(false); }
  }

  async function addNode(parentId: string | null, level: EntityNodeLevel) {
    const name = addVal.trim(); if (!name) return;
    if (await call(nodesUrl, "POST", { name, level, parentId })) { setAddVal(""); setAddParent("top"); }
  }
  async function rename(id: string) {
    const name = editVal.trim(); if (!name) { setEditId(null); return; }
    if (await call(`${nodesUrl}/${id}`, "PUT", { name })) setEditId(null);
  }

  // ── Flat list (Participants / IT Systems) ──────────────────────────
  if (flat) {
    return (
      <div className="space-y-1">
        {err && <p className="text-[10px] text-red-500">{err}</p>}
        {suggestions.length === 0 && <p className="text-xs text-gray-400 italic">No entries yet.</p>}
        {suggestions.map((n) => (
          <div key={n.id} className="flex items-center gap-1 text-xs">
            {editId === n.id ? (
              <input autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") rename(n.id); if (e.key === "Escape") setEditId(null); }}
                onBlur={() => rename(n.id)}
                className="flex-1 border border-blue-300 rounded px-1.5 py-0.5" />
            ) : (
              <span className="flex-1 text-gray-800">{n.name}</span>
            )}
            {isDocuments && editId !== n.id && (() => {
              const sp = nodeById.get(n.id);
              return sp?.spWebUrl ? (
                <a href={sp.spWebUrl} target="_blank" rel="noopener noreferrer" title={sp.spName ?? "Linked file"}
                  className="text-[10px] text-blue-600 hover:underline max-w-[10rem] truncate">📎 {sp.spName ?? "file"}</a>
              ) : (
                <span className="text-[10px] text-gray-400 italic">not linked</span>
              );
            })()}
            {canEdit && editId !== n.id && (
              <>
                {isDocuments && (
                  <button onClick={() => setSpNode(n.id)} className="text-blue-400 hover:text-blue-600 px-1">
                    {nodeById.get(n.id)?.spWebUrl ? "Change" : "Link file…"}
                  </button>
                )}
                {isDocuments && nodeById.get(n.id)?.spWebUrl && (
                  <button onClick={() => call(`${nodesUrl}/${n.id}`, "PUT", { spDriveId: null, spItemId: null, spName: null, spWebUrl: null })}
                    className="text-gray-400 hover:text-gray-700 px-1">Unlink</button>
                )}
                <button onClick={() => { setEditId(n.id); setEditVal(n.name); }} className="text-gray-400 hover:text-gray-700 px-1">Edit</button>
                <button onClick={() => setConfirm({ id: n.id, name: n.name })} className="text-red-400 hover:text-red-600 px-1">Delete</button>
              </>
            )}
          </div>
        ))}
        {spNode && (
          <SharePointPicker mode="file" title="Link a SharePoint file"
            onPick={(sel) => { const id = spNode; setSpNode(null); void call(`${nodesUrl}/${id}`, "PUT", { spDriveId: sel.driveId, spItemId: sel.itemId, spName: sel.name, spWebUrl: sel.webUrl }); }}
            onCancel={() => setSpNode(null)} />
        )}
        {canEdit && (
          <div className="flex items-center gap-1 pt-1">
            <input value={addParent === null ? addVal : ""} onFocus={() => setAddParent(null)}
              onChange={(e) => setAddVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addNode(null, flatLevel); }}
              placeholder={`Add ${ENTITY_NODE_LEVEL_LABELS[flatLevel]}…`} disabled={busy}
              className="flex-1 text-xs border border-gray-300 rounded px-1.5 py-0.5 placeholder:text-gray-500" />
            <button onClick={() => addNode(null, flatLevel)} disabled={busy || !addVal.trim()}
              className="text-xs text-blue-600 hover:text-blue-800 px-1 disabled:opacity-40">Add</button>
          </div>
        )}
        {confirm && (
          <ConfirmDialog title="Delete entry" message={`Delete "${confirm.name}"?`}
            onConfirm={() => { const c = confirm; setConfirm(null); call(`${nodesUrl}/${c.id}`, "DELETE"); }}
            onCancel={() => setConfirm(null)} />
        )}
      </div>
    );
  }

  // ── Hierarchy (Org Structure) ──────────────────────────────────────
  const withKids = idsWithChildren(suggestions);
  const visible = visibleSuggestions(suggestions, collapsed);
  return (
    <div className="space-y-0.5">
      {err && <p className="text-[10px] text-red-500">{err}</p>}
      {suggestions.length === 0 && <p className="text-xs text-gray-400 italic">No structure yet.</p>}
      {withKids.size > 0 && (
        <div className="flex items-center gap-2 pb-0.5">
          <button onClick={() => setCollapsed(new Set())} className="text-[10px] text-blue-600 hover:text-blue-800 inline-flex items-center gap-0.5"><span className="text-[18px] leading-none">⊞</span> Expand all</button>
          <span className="text-gray-300 text-[10px]">·</span>
          <button onClick={() => setCollapsed(new Set(withKids))} className="text-[10px] text-blue-600 hover:text-blue-800 inline-flex items-center gap-0.5"><span className="text-[18px] leading-none">⊟</span> Collapse all</button>
        </div>
      )}
      {visible.map((n) => (
        <div key={n.id} style={{ paddingLeft: n.depth * 14 }} className="flex items-center gap-1 text-xs group">
          {withKids.has(n.id) ? (
            <button onClick={() => toggleCollapse(n.id)} title={collapsed.has(n.id) ? "Expand" : "Collapse"}
              className="w-5 shrink-0 text-gray-400 hover:text-gray-700 text-[18px] leading-none">
              {collapsed.has(n.id) ? "▸" : "▾"}
            </button>
          ) : <span className="w-5 shrink-0" />}
          <span className="text-[9px] text-gray-500 w-14 shrink-0">{ENTITY_NODE_LEVEL_LABELS[n.level]}</span>
          {editId === n.id ? (
            <input autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") rename(n.id); if (e.key === "Escape") setEditId(null); }}
              onBlur={() => rename(n.id)} className="flex-1 border border-blue-300 rounded px-1.5 py-0.5" />
          ) : (
            <span className="flex-1 text-gray-800">{n.name}</span>
          )}
          {canEdit && editId !== n.id && (
            <span className="opacity-0 group-hover:opacity-100 flex gap-1">
              {n.level !== "Role" && (
                <button onClick={() => { setAddParent(n.id); setAddVal(""); setCollapsed((prev) => { const nx = new Set(prev); nx.delete(n.id); return nx; }); }} title="Add child"
                  className="text-blue-400 hover:text-blue-600 px-0.5">+{ENTITY_NODE_LEVEL_LABELS[childLevelFor(n.level)]}</button>
              )}
              <button onClick={() => { setEditId(n.id); setEditVal(n.name); }} className="text-gray-400 hover:text-gray-700 px-0.5">Edit</button>
              <button onClick={() => setConfirm({ id: n.id, name: n.name })} className="text-red-400 hover:text-red-600 px-0.5">Del</button>
            </span>
          )}
          {addParent === n.id && (
            <input autoFocus value={addVal} onChange={(e) => setAddVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addNode(n.id, childLevelFor(n.level)); if (e.key === "Escape") setAddParent("top"); }}
              onBlur={() => addVal.trim() ? addNode(n.id, childLevelFor(n.level)) : setAddParent("top")}
              placeholder={`New ${ENTITY_NODE_LEVEL_LABELS[childLevelFor(n.level)]}…`}
              className="flex-1 border border-green-300 rounded px-1.5 py-0.5 placeholder:text-gray-500" />
          )}
        </div>
      ))}
      {canEdit && (
        <div className="flex items-center gap-1 pt-1">
          <input value={addParent === null ? addVal : ""} onFocus={() => setAddParent(null)}
            onChange={(e) => setAddVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addNode(null, "Organisation"); }}
            placeholder="Add Organisation…" disabled={busy}
            className="flex-1 text-xs border border-gray-300 rounded px-1.5 py-0.5 placeholder:text-gray-500" />
          <button onClick={() => addNode(null, "Organisation")} disabled={busy || !addVal.trim()}
            className="text-xs text-blue-600 hover:text-blue-800 px-1 disabled:opacity-40">Add</button>
        </div>
      )}
      {confirm && (
        <ConfirmDialog title="Delete node" message={`Delete "${confirm.name}" and all its children?`}
          onConfirm={() => { const c = confirm; setConfirm(null); call(`${nodesUrl}/${c.id}`, "DELETE"); }}
          onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}
