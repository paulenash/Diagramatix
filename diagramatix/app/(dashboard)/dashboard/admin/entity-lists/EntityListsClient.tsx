"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EntityListEditor } from "@/app/components/entityLists/EntityListEditor";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import {
  ENTITY_LIST_KIND_LABELS, STRUCTURE_LIST_KINDS,
  type EntityStructureDTO, type EntityListDTO, type EntityListKind,
} from "@/app/lib/entityLists/types";

/**
 * SuperAdmin / OrgAdmin editor for an org's named Entity Structures. Each
 * structure bundles five lists — Organisation Hierarchy, External Participants,
 * IT Systems, Documents (SharePoint-linkable), Data Stores. Node CRUD goes to the
 * org-scoped /entity-lists/[listId]/nodes routes (any list by id).
 */
export function EntityListsClient({
  orgId, orgName, isSuperAdmin, orgs, backHref,
}: {
  orgId: string; orgName: string; isSuperAdmin: boolean;
  orgs: { id: string; name: string }[]; backHref: string;
}) {
  const router = useRouter();
  const structPath = `/api/orgs/${orgId}/entity-structures`;
  const listBase = `/api/orgs/${orgId}/entity-lists`;
  const [structures, setStructures] = useState<EntityStructureDTO[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDel, setConfirmDel] = useState<EntityStructureDTO | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch(structPath);
    const j = await res.json().catch(() => ({ structures: [] }));
    const list: EntityStructureDTO[] = j.structures ?? [];
    setStructures(list);
    setSelId((cur) => (cur && list.some((s) => s.id === cur) ? cur : (list[0]?.id ?? null)));
    setLoading(false);
  }, [structPath]);
  useEffect(() => { setLoading(true); refresh(); }, [refresh]);

  const selected = useMemo(() => structures.find((s) => s.id === selId) ?? null, [structures, selId]);
  const listOfKind = (kind: EntityListKind): EntityListDTO | undefined => selected?.lists.find((l) => l.kind === kind);

  async function createStructure() {
    const res = await fetch(structPath, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `Structure ${structures.length + 1}` }) });
    const j = await res.json().catch(() => ({}));
    await refresh();
    if (j.structure?.id) setSelId(j.structure.id);
  }
  async function renameStructure() {
    const name = renameVal.trim();
    if (selected && name && name !== selected.name) {
      await fetch(`${structPath}/${selected.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      await refresh();
    }
    setRenaming(false);
  }
  async function deleteStructure(s: EntityStructureDTO) {
    await fetch(`${structPath}/${s.id}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto max-w-5xl mx-auto px-4 py-6 w-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <Link href={backHref} className="text-xs text-gray-500 hover:text-gray-800">← Back</Link>
            <h1 className="text-lg font-semibold text-gray-900 mt-1">Entity Structures</h1>
            <p className="text-xs text-gray-500">Named structures for {orgName} <span className="text-gray-400">·#{orgId.slice(-6)}</span> — used to name BPMN pools/lanes, Data Objects and Data Stores.</p>
          </div>
          {isSuperAdmin && orgs.length > 0 && (() => {
            const nameCounts = new Map<string, number>();
            for (const o of orgs) nameCounts.set(o.name, (nameCounts.get(o.name) ?? 0) + 1);
            const label = (o: { id: string; name: string }) => (nameCounts.get(o.name) ?? 0) > 1 ? `${o.name} ·#${o.id.slice(-6)}` : o.name;
            return (
              <select value={orgId} onChange={(e) => router.push(`/dashboard/admin/entity-lists?orgId=${e.target.value}`)}
                className="text-xs border border-orange-300 rounded px-2 py-1 bg-white text-orange-700">
                {orgs.map((o) => <option key={o.id} value={o.id}>{label(o)}</option>)}
              </select>
            );
          })()}
        </div>

        {loading ? <p className="text-xs text-gray-400">Loading…</p> : (
          <div className="grid grid-cols-[220px_1fr] gap-4">
            {/* Structure list */}
            <nav className="bg-white border border-orange-200 rounded-lg p-2 h-fit">
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-[10px] font-semibold text-orange-700 uppercase tracking-wide">Structures</span>
                <button onClick={createStructure} className="text-xs text-blue-600 hover:text-blue-800">+ New</button>
              </div>
              {structures.length === 0 && <p className="text-xs text-gray-400 italic px-1 py-2">No structures yet.</p>}
              <ol className="space-y-0.5">
                {structures.map((s) => (
                  <li key={s.id}>
                    <button onClick={() => { setSelId(s.id); setRenaming(false); }}
                      className={`w-full text-left text-sm px-2 py-1 rounded truncate ${s.id === selId ? "bg-orange-50 text-orange-800 font-medium" : "text-gray-700 hover:bg-gray-50"}`}>
                      {s.name}
                    </button>
                  </li>
                ))}
              </ol>
            </nav>

            {/* Selected structure's five lists */}
            <main className="min-w-0">
              {!selected ? (
                <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-500">Create or select a structure.</div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    {renaming ? (
                      <input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") renameStructure(); if (e.key === "Escape") setRenaming(false); }} onBlur={renameStructure}
                        className="text-base font-semibold border border-blue-300 rounded px-2 py-0.5" />
                    ) : (
                      <button onClick={() => { setRenameVal(selected.name); setRenaming(true); }} className="text-base font-semibold text-gray-900 hover:underline">{selected.name}</button>
                    )}
                    <button onClick={() => setConfirmDel(selected)} className="text-[11px] text-red-400 hover:text-red-600">Delete structure</button>
                  </div>
                  <div className="space-y-4">
                    {STRUCTURE_LIST_KINDS.map((kind) => {
                      const list = listOfKind(kind);
                      return (
                        <section key={kind} className="bg-white border border-orange-200 rounded-lg p-3">
                          <h2 className="text-sm font-medium text-orange-700 mb-2">{ENTITY_LIST_KIND_LABELS[kind]}</h2>
                          {list
                            ? <EntityListEditor list={list} basePath={listBase} canEdit onChange={refresh} />
                            : <p className="text-xs text-gray-400 italic">List missing — recreate the structure.</p>}
                        </section>
                      );
                    })}
                  </div>
                </>
              )}
            </main>
          </div>
        )}
      </div>
      {confirmDel && (
        <ConfirmDialog title="Delete structure" message={`Delete "${confirmDel.name}" and all five of its lists?`} destructive
          confirmLabel="Delete" cancelLabel="Cancel"
          onConfirm={() => { const c = confirmDel; setConfirmDel(null); deleteStructure(c); }}
          onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  );
}
