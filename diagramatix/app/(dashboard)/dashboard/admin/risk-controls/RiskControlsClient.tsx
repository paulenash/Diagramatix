"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RiskControlEditor } from "@/app/components/riskControls/RiskControlEditor";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { RISK_CONTROL_KINDS, KIND_LABEL, type RiskControlLibraryDTO, type RiskControlKind } from "@/app/lib/riskControls/types";

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
  // Org-wide renumber (per kind, or all). Rewrites codes across the whole org.
  const [confirmRenumber, setConfirmRenumber] = useState<{ kinds?: RiskControlKind[]; label: string } | null>(null);
  const [renumberBusy, setRenumberBusy] = useState(false);
  const [renumberMsg, setRenumberMsg] = useState<string | null>(null);

  async function runRenumber(kinds?: RiskControlKind[]) {
    setRenumberBusy(true); setRenumberMsg(null);
    try {
      const res = await fetch(`/api/orgs/${orgId}/risk-controls/renumber`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kinds ? { kinds } : {}),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setRenumberMsg(j.error ?? "Renumber failed"); return; }
      const scope = kinds ? kinds.map((k) => KIND_LABEL[k]).join(", ") : "all kinds";
      setRenumberMsg(`Renumbered ${scope}: ${j.items} item(s) across ${j.groups} code(s); ${j.diagrams} diagram(s) updated.`);
      refresh();
    } catch { setRenumberMsg("Renumber failed"); }
    finally { setRenumberBusy(false); }
  }

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

      {/* Org-wide renumber. Re-flows codes into one clean sequence per kind
          across the whole org (master + every project copy). Each kind can be
          renumbered separately. Only `code` fields change — every traceability
          link and on-model attachment is preserved. */}
      <section className="border border-orange-200 rounded-lg p-4 mb-6 bg-orange-50/40">
        <h2 className="text-sm font-semibold text-gray-800">Renumber codes</h2>
        <p className="text-xs text-gray-600 mt-1 mb-3 max-w-3xl">
          Re-flow this organisation’s Risk &amp; Control codes into one clean org-wide sequence per kind
          (<span className="font-mono">R-001</span>, <span className="font-mono">C-001</span>…) across the master library and every project copy.
          Renumber a single kind or all of them. Traceability links and on-model attachments are preserved — only the display codes change.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button disabled={renumberBusy}
            onClick={() => setConfirmRenumber({ label: "all Risk & Control kinds" })}
            className="text-xs px-3 py-1 rounded bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-40">
            Renumber all
          </button>
          <span className="text-gray-300">|</span>
          {RISK_CONTROL_KINDS.map((k) => (
            <button key={k} disabled={renumberBusy}
              onClick={() => setConfirmRenumber({ kinds: [k], label: `${KIND_LABEL[k]} codes` })}
              className="text-xs px-2.5 py-1 rounded border border-orange-300 text-orange-700 hover:bg-orange-100 disabled:opacity-40">
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        {renumberBusy && <p className="text-xs text-gray-500 mt-2">Renumbering…</p>}
        {renumberMsg && <p className="text-xs text-gray-700 mt-2">{renumberMsg}</p>}
      </section>

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

      {confirmRenumber && (
        <ConfirmDialog title="Renumber codes"
          message={`Renumber ${confirmRenumber.label} into a single org-wide sequence across ${orgName} — the master library and every project copy. Codes on diagrams update to match. Links and attachments are preserved. Continue?`}
          confirmLabel="Renumber"
          onConfirm={() => { const c = confirmRenumber; setConfirmRenumber(null); runRenumber(c.kinds); }}
          onCancel={() => setConfirmRenumber(null)} />
      )}
    </div>
  );
}
