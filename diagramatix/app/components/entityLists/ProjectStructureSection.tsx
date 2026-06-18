"use client";

import { useCallback, useEffect, useState } from "react";
import { EntityListEditor } from "@/app/components/entityLists/EntityListEditor";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import {
  ENTITY_LIST_KIND_LABELS, type EntityListDTO, type EntityListKind,
} from "@/app/lib/entityLists/types";

/**
 * Project-level Entity Structure: adopt an org master structure (a COPY the
 * project edits independently) and maintain the project's own Participants,
 * IT Systems and Org Structure. Owner-editable; read-only otherwise.
 */
export function ProjectStructureSection({
  projectId, canEdit,
}: {
  projectId: string;
  canEdit: boolean;
}) {
  const basePath = `/api/projects/${projectId}/entity-lists`;
  const [lists, setLists] = useState<EntityListDTO[]>([]);
  const [orgStructures, setOrgStructures] = useState<{ id: string; name: string }[]>([]);
  const [chosen, setChosen] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(basePath);
    const j = await res.json().catch(() => ({ lists: [] }));
    setLists(j.lists ?? []);
    setLoading(false);
  }, [basePath]);

  const [orgName, setOrgName] = useState("");
  const [orgId, setOrgId] = useState("");
  useEffect(() => {
    refresh();
    fetch(`/api/projects/${projectId}/adopt-structure`)
      .then(r => r.ok ? r.json() : { lists: [] })
      .then(j => { setOrgStructures((j.lists ?? []) as { id: string; name: string }[]); setOrgName(j.orgName ?? ""); setOrgId(j.orgId ?? ""); })
      .catch(() => {});
  }, [refresh, projectId]);

  async function adopt(replace: boolean) {
    if (!chosen) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`${basePath.replace("/entity-lists", "")}/adopt-structure${replace ? "?replace=true" : ""}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgListId: chosen }),
      });
      if (res.status === 409) { setConfirmReplace(chosen); return; }
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error ?? "Adopt failed"); return; }
      setChosen(""); refresh();
    } finally { setBusy(false); }
  }

  const byKind = (k: EntityListKind) => lists.find(l => l.kind === k);
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-gray-100">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-medium text-gray-700 hover:bg-gray-50">
        <span>Project Structure <span className="text-gray-400 ml-1">— names for pools &amp; lanes</span></span>
        <span className="text-gray-400">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
    <div className="space-y-3 px-3 pb-3">
      {err && <p className="text-[11px] text-red-500">{err}</p>}

      {canEdit && (
        <div className="space-y-1">
          <p className="text-[10px] text-gray-500">
            Adopt from <span className="font-medium text-gray-700">{orgName || "this project's org"}</span>
            {orgId && <span className="text-gray-400"> ·#{orgId.slice(-6)}</span>}
            <span className="text-gray-400"> — build masters in this org under Admin → Entity Lists.</span>
          </p>
          {orgStructures.length === 0 ? (
            <p className="text-[10px] text-amber-600">
              No org structures available to adopt in this org. (If you built one in a different same-named org, switch to this org and build it there.)
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <select value={chosen} onChange={(e) => setChosen(e.target.value)} disabled={busy}
                className="text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-700">
                <option value="">Adopt an org structure…</option>
                {orgStructures.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <button onClick={() => adopt(false)} disabled={busy || !chosen}
                className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40">Adopt</button>
            </div>
          )}
        </div>
      )}

      {loading ? <p className="text-xs text-gray-400">Loading…</p> : (
        <div className="space-y-3">
          {(["OrgStructure", "Participant", "System"] as EntityListKind[]).map((kind) => {
            const list = byKind(kind);
            return (
              <div key={kind} className="border border-gray-100 rounded p-2">
                <h4 className="text-xs font-medium text-gray-700 mb-1">{ENTITY_LIST_KIND_LABELS[kind]}</h4>
                {list ? (
                  <EntityListEditor list={list} basePath={basePath} canEdit={canEdit} onChange={refresh} />
                ) : (
                  <p className="text-[11px] text-gray-400 italic">
                    {kind === "OrgStructure" ? "Adopt an org structure above, or create one here. " : "none yet "}
                    {canEdit ? (
                      <button onClick={async () => {
                        await fetch(basePath, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: ENTITY_LIST_KIND_LABELS[kind], kind }) });
                        refresh();
                      }} className="text-blue-600 hover:text-blue-800 ml-1">+ create empty</button>
                    ) : null}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {confirmReplace && (
        <ConfirmDialog title="Replace existing structure"
          message="This project already has a structure of that kind. Replace it with the adopted copy? Existing nodes are removed."
          confirmLabel="Replace"
          onConfirm={() => { setConfirmReplace(null); adopt(true); }}
          onCancel={() => setConfirmReplace(null)} />
      )}
    </div>
      )}
    </div>
  );
}
