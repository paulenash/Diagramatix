"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EntityListEditor } from "@/app/components/entityLists/EntityListEditor";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import {
  ENTITY_LIST_KIND_LABELS, type EntityListDTO, type EntityListKind,
} from "@/app/lib/entityLists/types";

export function EntityListsClient({
  orgId, orgName, isSuperAdmin, orgs, backHref,
}: {
  orgId: string;
  orgName: string;
  isSuperAdmin: boolean;
  orgs: { id: string; name: string }[];
  backHref: string;
}) {
  const router = useRouter();
  const basePath = `/api/orgs/${orgId}/entity-lists`;
  const [lists, setLists] = useState<EntityListDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmList, setConfirmList] = useState<EntityListDTO | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(basePath);
    const j = await res.json().catch(() => ({ lists: [] }));
    setLists(j.lists ?? []);
    setLoading(false);
  }, [basePath]);

  useEffect(() => { setLoading(true); refresh(); }, [refresh]);

  async function createList(kind: EntityListKind, name: string) {
    await fetch(basePath, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, kind }) });
    refresh();
  }
  async function deleteList(id: string) {
    await fetch(`${basePath}/${id}`, { method: "DELETE" });
    refresh();
  }

  const byKind = (k: EntityListKind) => lists.filter(l => l.kind === k);

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <Link href={backHref} className="text-xs text-gray-500 hover:text-gray-800">← Back</Link>
            <h1 className="text-lg font-semibold text-gray-900 mt-1">Entity Lists</h1>
            <p className="text-xs text-gray-500">Master library for {orgName} <span className="text-gray-400">·#{orgId.slice(-6)}</span> — used to name BPMN pools and lanes.</p>
          </div>
          {isSuperAdmin && orgs.length > 0 && (() => {
            // Disambiguate same-named orgs with a short id suffix so the
            // SuperAdmin can pick the exact one a project belongs to.
            const nameCounts = new Map<string, number>();
            for (const o of orgs) nameCounts.set(o.name, (nameCounts.get(o.name) ?? 0) + 1);
            const label = (o: { id: string; name: string }) =>
              (nameCounts.get(o.name) ?? 0) > 1 ? `${o.name} ·#${o.id.slice(-6)}` : o.name;
            return (
              <select value={orgId} onChange={(e) => router.push(`/dashboard/admin/entity-lists?orgId=${e.target.value}`)}
                className="text-xs border border-orange-300 rounded px-2 py-1 bg-white text-orange-700">
                {orgs.map(o => <option key={o.id} value={o.id}>{label(o)}</option>)}
              </select>
            );
          })()}
        </div>

        {loading ? <p className="text-xs text-gray-400">Loading…</p> : (
          <div className="space-y-4">
            {/* Flat lists: one per kind, auto-create on demand */}
            {(["Participant", "System"] as EntityListKind[]).map((kind) => {
              const list = byKind(kind)[0];
              return (
                <section key={kind} className="bg-white border border-orange-200 rounded-lg p-3">
                  <h2 className="text-sm font-medium text-orange-700 mb-2">{ENTITY_LIST_KIND_LABELS[kind]}</h2>
                  {list ? (
                    <EntityListEditor list={list} basePath={basePath} canEdit onChange={refresh} />
                  ) : (
                    <button onClick={() => createList(kind, ENTITY_LIST_KIND_LABELS[kind])}
                      className="text-xs text-blue-600 hover:text-blue-800">+ Create {ENTITY_LIST_KIND_LABELS[kind]} list</button>
                  )}
                </section>
              );
            })}

            {/* Org Structures: a named library — multiple allowed */}
            <section className="bg-white border border-orange-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-medium text-orange-700">{ENTITY_LIST_KIND_LABELS.OrgStructure}s</h2>
                <button onClick={() => createList("OrgStructure", `Structure ${byKind("OrgStructure").length + 1}`)}
                  className="text-xs text-blue-600 hover:text-blue-800">+ New structure</button>
              </div>
              {byKind("OrgStructure").length === 0 && <p className="text-xs text-gray-400 italic">No structures yet.</p>}
              <div className="space-y-3">
                {byKind("OrgStructure").map((list) => (
                  <div key={list.id} className="border border-gray-100 rounded p-2">
                    <div className="flex items-center justify-between mb-1">
                      <StructureName list={list} basePath={basePath} onChange={refresh} />
                      <button onClick={() => setConfirmList(list)} className="text-[10px] text-red-400 hover:text-red-600">Delete structure</button>
                    </div>
                    <EntityListEditor list={list} basePath={basePath} canEdit onChange={refresh} />
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
      {confirmList && (
        <ConfirmDialog title="Delete structure" message={`Delete "${confirmList.name}" and all its nodes?`}
          onConfirm={() => { const c = confirmList; setConfirmList(null); deleteList(c.id); }}
          onCancel={() => setConfirmList(null)} />
      )}
    </div>
  );
}

/** Inline-editable structure name. */
function StructureName({ list, basePath, onChange }: { list: EntityListDTO; basePath: string; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(list.name);
  async function save() {
    const name = val.trim();
    if (name && name !== list.name) {
      await fetch(`${basePath}/${list.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      onChange();
    }
    setEditing(false);
  }
  return editing ? (
    <input autoFocus value={val} onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }} onBlur={save}
      className="text-xs font-medium border border-blue-300 rounded px-1.5 py-0.5" />
  ) : (
    <button onClick={() => { setVal(list.name); setEditing(true); }} className="text-xs font-medium text-gray-800 hover:underline">{list.name}</button>
  );
}
