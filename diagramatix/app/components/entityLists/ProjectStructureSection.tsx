"use client";

import { useCallback, useEffect, useState } from "react";
import { EntityListEditor } from "@/app/components/entityLists/EntityListEditor";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import {
  ENTITY_LIST_KIND_LABELS, STRUCTURE_LIST_KINDS,
  type EntityListDTO, type EntityListKind,
} from "@/app/lib/entityLists/types";

/**
 * Project-level Entity Structure: adopt a whole org structure (COPIES the project
 * edits independently), maintain the five lists, add your own entries, and pull
 * later master changes with "Sync updates" (keeps your additions). Owner-editable.
 */
export function ProjectStructureSection({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const projectBase = `/api/projects/${projectId}`;
  const basePath = `${projectBase}/entity-lists`;
  const [lists, setLists] = useState<EntityListDTO[]>([]);
  const [structures, setStructures] = useState<{ id: string; name: string }[]>([]);
  const [adopted, setAdopted] = useState(false);
  const [chosen, setChosen] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgId, setOrgId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [lRes, aRes] = await Promise.all([fetch(basePath), fetch(`${projectBase}/adopt-structure`)]);
    const lj = await lRes.json().catch(() => ({ lists: [] }));
    setLists(lj.lists ?? []);
    if (aRes.ok) {
      const aj = await aRes.json();
      setStructures((aj.structures ?? []) as { id: string; name: string }[]);
      setAdopted(!!aj.adopted); setOrgName(aj.orgName ?? ""); setOrgId(aj.orgId ?? "");
    }
    setLoading(false);
  }, [basePath, projectBase]);
  useEffect(() => { refresh(); }, [refresh]);

  async function adopt(replace: boolean) {
    if (!chosen) return;
    setBusy(true); setErr(null); setNote(null);
    try {
      const res = await fetch(`${projectBase}/adopt-structure${replace ? "?replace=true" : ""}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ structureId: chosen }),
      });
      if (res.status === 409) { setConfirmReplace(chosen); return; }
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error ?? "Adopt failed"); return; }
      setChosen(""); await refresh();
    } finally { setBusy(false); }
  }

  async function syncNow() {
    setBusy(true); setErr(null); setNote(null);
    try {
      const res = await fetch(`${projectBase}/sync-structure`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? "Sync failed"); return; }
      setNote(`Synced — ${j.added} added, ${j.updated} updated, ${j.removed} removed (your additions kept).`);
      await refresh();
    } finally { setBusy(false); }
  }

  const byKind = (k: EntityListKind) => lists.find((l) => l.kind === k);

  return (
    <div className="border-b border-gray-100">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-medium text-gray-700 hover:bg-gray-50">
        <span>Project Structure <span className="text-gray-400 ml-1">— names for pools, lanes, data objects &amp; stores</span></span>
        <span className="text-gray-400">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="space-y-3 px-3 pb-3">
          {err && <p className="text-[11px] text-red-500">{err}</p>}
          {note && <p className="text-[11px] text-green-600">{note}</p>}

          {canEdit && (
            <div className="space-y-1">
              <p className="text-[10px] text-gray-500">
                Adopt from <span className="font-medium text-gray-700">{orgName || "this project's org"}</span>
                {orgId && <span className="text-gray-400"> ·#{orgId.slice(-6)}</span>}
                <span className="text-gray-400"> — build structures under Admin → Entity Lists.</span>
              </p>
              {structures.length === 0 ? (
                <p className="text-[10px] text-amber-600">No Entity Structures available to adopt in this org.</p>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <select value={chosen} onChange={(e) => setChosen(e.target.value)} disabled={busy}
                    className="text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-700">
                    <option value="">Adopt a structure…</option>
                    {structures.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button onClick={() => adopt(false)} disabled={busy || !chosen}
                    className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40">Adopt</button>
                  {adopted && (
                    <button onClick={syncNow} disabled={busy} title="Pull the latest master changes into this project, keeping your additions"
                      className="text-xs px-2 py-1 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 disabled:opacity-40">Sync updates</button>
                  )}
                </div>
              )}
            </div>
          )}

          {loading ? <p className="text-xs text-gray-400">Loading…</p> : (
            <div className="space-y-3">
              {STRUCTURE_LIST_KINDS.map((kind) => {
                const list = byKind(kind);
                return (
                  <div key={kind} className="border border-gray-100 rounded p-2">
                    <h4 className="text-xs font-medium text-gray-700 mb-1">{ENTITY_LIST_KIND_LABELS[kind]}</h4>
                    {list ? (
                      <EntityListEditor list={list} basePath={basePath} canEdit={canEdit} onChange={refresh} />
                    ) : (
                      <p className="text-[11px] text-gray-400 italic">
                        Adopt a structure above to populate this.
                        {canEdit && (
                          <button onClick={async () => {
                            await fetch(basePath, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: ENTITY_LIST_KIND_LABELS[kind], kind }) });
                            refresh();
                          }} className="text-blue-600 hover:text-blue-800 ml-1">+ create empty</button>
                        )}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {confirmReplace && (
            <ConfirmDialog title="Replace adopted structure"
              message="This project has already adopted a structure. Replace it? Your existing project lists (including additions) are removed and re-cloned from the chosen structure."
              confirmLabel="Replace" onConfirm={() => { setConfirmReplace(null); adopt(true); }} onCancel={() => setConfirmReplace(null)} />
          )}
        </div>
      )}
    </div>
  );
}
