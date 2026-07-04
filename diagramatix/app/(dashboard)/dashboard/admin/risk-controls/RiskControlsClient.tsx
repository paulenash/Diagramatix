"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RiskControlEditor } from "@/app/components/riskControls/RiskControlEditor";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import type { RiskControlLibraryDTO } from "@/app/lib/riskControls/types";

/** Org-master Risk & Control catalog editor. OrgAdmin (orange) accent. */
export function RiskControlsClient({
  orgId, orgName, isSuperAdmin, orgs, backHref,
}: {
  orgId: string; orgName: string; isSuperAdmin: boolean;
  orgs: { id: string; name: string }[]; backHref: string;
}) {
  const router = useRouter();
  const basePath = `/api/orgs/${orgId}/risk-controls`;
  const [libraries, setLibraries] = useState<RiskControlLibraryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [confirmDel, setConfirmDel] = useState<{ id: string; name: string } | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(basePath);
    const j = await res.json().catch(() => ({ libraries: [] }));
    setLibraries(j.libraries ?? []);
    setLoading(false);
  }, [basePath]);
  useEffect(() => { refresh(); }, [refresh]);

  async function createLibrary() {
    const name = newName.trim() || "Risk & Control Library";
    await fetch(basePath, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    setNewName(""); refresh();
  }
  async function delLibrary(id: string) { await fetch(`${basePath}/${id}`, { method: "DELETE" }); refresh(); }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <button onClick={() => router.push(backHref)} className="text-xs text-gray-500 hover:text-gray-800">← Back</button>
          <h1 className="text-xl font-semibold text-gray-900">Risk &amp; Control Catalog</h1>
          <p className="text-sm text-gray-500">Master library for <span className="font-medium text-orange-700">{orgName}</span> — projects adopt a copy.</p>
        </div>
        {isSuperAdmin && orgs.length > 1 && (
          <select value={orgId} onChange={(e) => router.push(`/dashboard/admin/risk-controls?orgId=${e.target.value}`)}
            className="text-sm border border-gray-300 rounded px-2 py-1">
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
      </div>

      <div className="flex items-center gap-2 mb-5">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New library name" className="text-sm border border-gray-300 rounded px-2 py-1 flex-1 max-w-xs" />
        <button onClick={createLibrary} className="text-sm px-3 py-1 bg-orange-600 text-white rounded hover:bg-orange-700">+ New library</button>
      </div>

      {loading ? <p className="text-sm text-gray-400">Loading…</p> : libraries.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No libraries yet. Create one above; add Risks and Controls and link them, then projects can adopt it.</p>
      ) : (
        <div className="space-y-6">
          {libraries.map((lib) => (
            <section key={lib.id} className="border border-orange-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-medium text-gray-800">{lib.name}</h2>
                <button onClick={() => setConfirmDel({ id: lib.id, name: lib.name })} className="text-xs text-red-500 hover:text-red-700">Delete library</button>
              </div>
              <RiskControlEditor library={lib} basePath={basePath} canEdit onChange={refresh} />
            </section>
          ))}
        </div>
      )}

      {confirmDel && (
        <ConfirmDialog title="Delete library" message={`Delete "${confirmDel.name}" and all its risks/controls? Adopted project copies are unaffected.`} destructive
          onConfirm={() => { delLibrary(confirmDel.id); setConfirmDel(null); }} onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  );
}
