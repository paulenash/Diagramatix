"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PcfBuilder } from "./PcfBuilder";
import { PcfUpgradeModal } from "./PcfUpgradeModal";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";

interface FrameworkSummary {
  id: string; name: string; variant: string; version: string;
  kind: string; division: string | null; attributionNote: string;
  _count: { nodes: number };
}
interface PcfNode {
  id: string; pcfId: number; hierarchyId: string; name: string; description: string | null;
  level: number; parentId: string | null; changeType: string | null; metricsAvailable: boolean;
  active: boolean; isCustom: boolean; orgCode: string | null;
}

const LEVEL_LABEL = ["", "Category", "Process Group", "Process", "Activity", "Task"];

/** Browse APQC PCF reference + tailored frameworks. OrgAdmin (orange) accent. */
export function PcfClient({
  orgId, orgName, isSuperAdmin, orgs, backHref,
}: {
  orgId: string; orgName: string; isSuperAdmin: boolean;
  orgs: { id: string; name: string }[]; backHref: string;
}) {
  const router = useRouter();
  const [frameworks, setFrameworks] = useState<FrameworkSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [nodes, setNodes] = useState<PcfNode[]>([]);
  const [attribution, setAttribution] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingTree, setLoadingTree] = useState(false);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showImport, setShowImport] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDivision, setCreateDivision] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmDeleteFw, setConfirmDeleteFw] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameErr, setRenameErr] = useState<string | null>(null);

  async function renameFramework() {
    if (!renameValue.trim() || !selectedId) return;
    setRenaming(true); setRenameErr(null);
    try {
      const res = await fetch(`/api/orgs/${orgId}/pcf/${selectedId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setRenameErr(j.error ?? "Rename failed"); return; }
      setShowRename(false);
      await loadFrameworks();
    } finally { setRenaming(false); }
  }

  async function createTailored() {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/pcf`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName.trim(), division: createDivision.trim() || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.framework?.id) {
        setShowCreate(false); setCreateName(""); setCreateDivision("");
        await loadFrameworks();
        setSelectedId(j.framework.id);
      }
    } finally { setCreating(false); }
  }

  async function deleteFramework() {
    setConfirmDeleteFw(false);
    await fetch(`/api/orgs/${orgId}/pcf/${selectedId}`, { method: "DELETE" });
    setSelectedId("");
    await loadFrameworks();
  }

  const loadFrameworks = useCallback(async () => {
    const res = await fetch(`/api/orgs/${orgId}/pcf`);
    const j = await res.json().catch(() => ({ frameworks: [] }));
    setFrameworks(j.frameworks ?? []);
    setSelectedId((prev) => prev || j.frameworks?.[0]?.id || "");
    setLoading(false);
  }, [orgId]);
  useEffect(() => { loadFrameworks(); }, [loadFrameworks]);

  async function submitImport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (!(form.get("file") instanceof File) || !(form.get("file") as File).name) { setImportMsg("Choose a .xlsx file"); return; }
    setImporting(true); setImportMsg(null);
    try {
      const res = await fetch("/api/admin/pcf/import", { method: "POST", body: form });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setImportMsg(j.error ?? "Import failed"); return; }
      setImportMsg(j.skipped ? "That version is already loaded." : `Imported ${j.nodeCount} elements.`);
      await loadFrameworks();
    } catch { setImportMsg("Import failed"); }
    finally { setImporting(false); }
  }

  const loadTree = useCallback(async (fid: string) => {
    if (!fid) return;
    setLoadingTree(true); setExpanded(new Set()); setQ("");
    const res = await fetch(`/api/orgs/${orgId}/pcf/${fid}`);
    const j = await res.json().catch(() => ({ nodes: [] }));
    setNodes(j.nodes ?? []);
    setAttribution(j.framework?.attributionNote ?? "");
    setLoadingTree(false);
  }, [orgId]);
  useEffect(() => { if (selectedId) loadTree(selectedId); }, [selectedId, loadTree]);

  const childrenByParent = useMemo(() => {
    const m = new Map<string, PcfNode[]>();
    for (const n of nodes) {
      const k = n.parentId ?? "__root__";
      (m.get(k) ?? m.set(k, []).get(k)!).push(n);
    }
    return m;
  }, [nodes]);
  const roots = childrenByParent.get("__root__") ?? [];

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return null;
    return nodes.filter((n) => n.name.toLowerCase().includes(s) || n.hierarchyId.includes(s) || String(n.pcfId).includes(s)).slice(0, 300);
  }, [q, nodes]);

  const toggle = (id: string) => setExpanded((e) => { const n = new Set(e); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function Row({ n, depth }: { n: PcfNode; depth: number }) {
    const kids = childrenByParent.get(n.id) ?? [];
    const open = expanded.has(n.id);
    return (
      <>
        <div className="flex items-start gap-2 py-1 hover:bg-orange-50/60 rounded" style={{ paddingLeft: depth * 16 + 4 }}>
          <button onClick={() => kids.length && toggle(n.id)} className={`w-4 text-gray-400 shrink-0 ${kids.length ? "hover:text-gray-700" : "opacity-0"}`}>{open ? "▾" : "▸"}</button>
          <span className="font-mono text-[11px] text-gray-600 shrink-0 w-20">{n.orgCode ?? n.hierarchyId}</span>
          <span className="text-[12px] text-gray-800 flex-1">
            {n.name}
            {n.changeType && <span className="ml-1 text-[9px] uppercase px-1 py-0.5 rounded bg-emerald-100 text-emerald-700">{n.changeType}</span>}
            {n.metricsAvailable && <span className="ml-1 text-[8px] uppercase tracking-wide px-1 py-0.5 rounded bg-gray-100 text-gray-400" title="APQC OSB benchmark metrics available for this element (separate APQC licence)">metrics</span>}
            {n.description && <span className="block text-[10px] text-gray-600 leading-snug">{n.description}</span>}
          </span>
          <span className="text-[9px] text-gray-600 shrink-0">{LEVEL_LABEL[n.level]}</span>
        </div>
        {open && kids.map((k) => <Row key={k.id} n={k} depth={depth + 1} />)}
      </>
    );
  }

  const selected = frameworks.find((f) => f.id === selectedId);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <button onClick={() => router.push(backHref)} className="text-xs text-gray-500 hover:text-gray-800">← Back</button>
          <h1 className="text-xl font-semibold text-gray-900">Process Classification Framework <span className="text-gray-400 text-sm">(APQC PCF®)</span></h1>
          <p className="text-sm text-gray-500">Reference taxonomy for <span className="font-medium text-orange-700">{orgName}</span> — browse the standard, classify processes, build a tailored framework.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCreate(true)} className="text-xs px-3 py-1.5 rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50">
            ＋ New tailored framework
          </button>
          {isSuperAdmin && (
            <button onClick={() => setShowImport((v) => !v)} className="text-xs px-3 py-1.5 rounded border border-orange-300 text-orange-700 hover:bg-orange-50">
              ⭱ Import workbook
            </button>
          )}
          {isSuperAdmin && orgs.length > 1 && (
            <select value={orgId} onChange={(e) => router.push(`/dashboard/admin/pcf?orgId=${e.target.value}`)} className="text-sm border border-gray-300 rounded px-2 py-1 bg-white text-gray-800">
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
        </div>
      </div>

      {isSuperAdmin && showImport && (
        <form onSubmit={submitImport} className="bg-white border border-orange-200 rounded-lg p-4 mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">Workbook (.xlsx)</label>
            <input type="file" name="file" accept=".xlsx"
              className="text-xs text-gray-600 file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:bg-orange-100 file:text-orange-700 hover:file:bg-orange-200 file:cursor-pointer" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">Variant</label>
            <input name="variant" placeholder="Cross-Industry / Retail…" className="text-xs border border-gray-300 rounded px-2 py-1 w-44 bg-white text-gray-800" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">Version</label>
            <input name="version" placeholder="8.0" className="text-xs border border-gray-300 rounded px-2 py-1 w-24 bg-white text-gray-800" />
          </div>
          <button type="submit" disabled={importing} className="text-xs px-3 py-1.5 rounded bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50">
            {importing ? "Importing…" : "Import as global reference"}
          </button>
          {importMsg && (
            <span className={`text-[11px] font-medium ${/^Imported/.test(importMsg) ? "text-emerald-700" : /already/.test(importMsg) ? "text-gray-600" : "text-red-600"}`}>
              {importMsg}
            </span>
          )}
          <p className="w-full text-[10px] text-gray-400">Imports an APQC PCF workbook as a global reference framework (all orgs). A newer version of the same variant supersedes the previous. Convert .xls to .xlsx first.</p>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : frameworks.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 max-w-xl">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">No frameworks yet</h2>
          <p className="text-xs text-gray-500">A SuperAdmin imports the APQC PCF workbooks (or runs <span className="font-mono">scripts/seed-pcf-frameworks.ts</span>). Once loaded, the Cross-Industry framework and your industry variants appear here.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="text-sm border border-gray-300 rounded px-2 py-1 bg-white text-gray-800 max-w-md">
              <optgroup label="APQC reference">
                {frameworks.filter((f) => f.kind === "reference").map((f) => <option key={f.id} value={f.id}>{f.variant} — v{f.version} ({f._count.nodes})</option>)}
              </optgroup>
              {frameworks.some((f) => f.kind === "tailored") && (
                <optgroup label="Tailored (this org)">
                  {frameworks.filter((f) => f.kind === "tailored").map((f) => <option key={f.id} value={f.id}>{f.name}{f.division ? ` · ${f.division}` : ""}</option>)}
                </optgroup>
              )}
            </select>
            {selected?.kind !== "tailored" && (
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / code…" className="text-sm border border-gray-300 rounded px-2 py-1 flex-1 min-w-[180px] max-w-xs bg-white text-gray-800" />
            )}
            {selected && <span className="text-[11px] text-gray-400">{selected._count.nodes} elements · {selected.kind}</span>}
            <div className="ml-auto flex items-center gap-2">
              {selected && (selected.kind === "tailored" || isSuperAdmin) && (
                <button onClick={() => { setRenameValue(selected.kind === "tailored" ? selected.name : selected.variant); setShowRename(true); }}
                  className="text-[11px] px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                  title={selected.kind === "reference" ? "Rename this global reference framework (SuperAdmin)" : "Rename this tailored framework"}>✎ Rename</button>
              )}
              {selected?.kind === "reference" && (
                <button onClick={() => setShowUpgrade(true)} className="text-[11px] px-2 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50" title="Diff vs the previous version + re-point your usage">⭫ Version upgrade…</button>
              )}
              {selected?.kind === "tailored" && (
                <button onClick={() => setConfirmDeleteFw(true)} className="text-[11px] px-2 py-1 rounded border border-gray-300 text-gray-500 hover:border-red-300 hover:text-red-600">Delete framework</button>
              )}
            </div>
          </div>

          {selected?.kind === "tailored" ? (
            <div className="bg-white border border-indigo-200 rounded-lg p-3 min-h-[300px]">
              <PcfBuilder orgId={orgId} frameworkId={selectedId} frameworks={frameworks}
                onChanged={() => { loadFrameworks(); }} />
            </div>
          ) : (
          <div className="bg-white border border-orange-200 rounded-lg p-3 min-h-[300px]">
            {loadingTree ? (
              <p className="text-sm text-gray-400">Loading tree…</p>
            ) : matches ? (
              <div>
                <p className="text-[11px] text-gray-400 mb-1">{matches.length} match{matches.length === 1 ? "" : "es"}{matches.length === 300 ? " (showing first 300)" : ""}</p>
                {matches.map((n) => (
                  <div key={n.id} className="flex items-baseline gap-2 py-0.5">
                    <span className="font-mono text-[11px] text-gray-600 w-24 shrink-0">{n.hierarchyId}</span>
                    <span className="text-[12px] text-gray-800">{n.name} <span className="text-[9px] text-gray-600">{LEVEL_LABEL[n.level]}</span></span>
                  </div>
                ))}
              </div>
            ) : (
              roots.map((n) => <Row key={n.id} n={n} depth={0} />)
            )}
          </div>
          )}

          {attribution && selected?.kind !== "tailored" && (
            <p className="text-[10px] text-gray-400 mt-3 leading-snug border-t border-gray-100 pt-2">{attribution}</p>
          )}
        </>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50" onClick={() => !creating && setShowCreate(false)}>
          <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-5 w-[400px]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-gray-900 mb-1">New tailored framework</h2>
            <p className="text-[11px] text-gray-500 mb-4">An org-owned framework you compose from reference branches and extend with custom nodes. Carries the APQC attribution notice.</p>
            <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">Name</label>
            <input autoFocus value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="e.g. Acme — Retail Division"
              onKeyDown={(e) => { if (e.key === "Enter") createTailored(); }}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 mb-3 bg-white text-gray-800" />
            <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">Division (optional)</label>
            <input value={createDivision} onChange={(e) => setCreateDivision(e.target.value)} placeholder="e.g. Retail"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 mb-4 bg-white text-gray-800" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} disabled={creating} className="px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
              <button onClick={createTailored} disabled={creating || !createName.trim()} className="px-3 py-1 text-xs text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50">{creating ? "Creating…" : "Create"}</button>
            </div>
          </div>
        </div>
      )}

      {showRename && selected && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50" onClick={() => !renaming && setShowRename(false)}>
          <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-5 w-[400px]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Rename framework</h2>
            <p className="text-[11px] text-gray-500 mb-4">
              {selected.kind === "reference"
                ? "Renames this global reference framework's label (shown in pickers and APQC project names). Applies to every org — SuperAdmin only."
                : "Renames this tailored framework."}
            </p>
            <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">Name</label>
            <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") renameFramework(); if (e.key === "Escape") setShowRename(false); }}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 mb-2 bg-white text-gray-800" />
            {renameErr && <p className="text-[11px] text-red-600 mb-2">{renameErr}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowRename(false)} disabled={renaming} className="px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
              <button onClick={renameFramework} disabled={renaming || !renameValue.trim()} className="px-3 py-1 text-xs text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50">{renaming ? "Renaming…" : "Rename"}</button>
            </div>
          </div>
        </div>
      )}

      {showUpgrade && selected?.kind === "reference" && (
        <PcfUpgradeModal orgId={orgId} frameworkId={selectedId}
          onClose={() => setShowUpgrade(false)}
          onApplied={() => { loadTree(selectedId); }} />
      )}

      {confirmDeleteFw && (
        <ConfirmDialog title="Delete tailored framework"
          message={`Delete "${selected?.name ?? "this framework"}" and all its nodes? Diagrams classified against it keep their stored code but lose the link.`}
          confirmLabel="Delete" destructive onConfirm={deleteFramework} onCancel={() => setConfirmDeleteFw(false)} />
      )}
    </div>
  );
}
