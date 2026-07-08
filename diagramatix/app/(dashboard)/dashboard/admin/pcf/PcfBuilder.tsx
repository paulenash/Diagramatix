"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";

interface Node {
  id: string; pcfId: number; hierarchyId: string; name: string; description: string | null;
  level: number; parentId: string | null; active: boolean; isCustom: boolean; orgCode: string | null;
  sourceFrameworkId: string | null; sourcePcfId: number | null;
}
interface Framework { id: string; name: string; variant: string; version: string; kind: string; division: string | null; _count: { nodes: number } }

const LEVEL = ["", "Category", "Process Group", "Process", "Activity", "Task"];

/**
 * Tailored-framework builder (L5). Compose branches from reference frameworks
 * (with provenance), extend with custom nodes, and curate (rename / hide / org-
 * code / remove). Shown in place of the read-only tree when a tailored framework
 * is selected in the admin PCF screen.
 */
export function PcfBuilder({ orgId, frameworkId, frameworks, onChanged }: {
  orgId: string; frameworkId: string; frameworks: Framework[]; onChanged: () => void;
}) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [addingUnder, setAddingUnder] = useState<string | "__root__" | null>(null);
  const [addDraft, setAddDraft] = useState("");
  const [composeUnder, setComposeUnder] = useState<string | "__root__" | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const base = `/api/orgs/${orgId}/pcf/${frameworkId}`;
  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(base);
    const j = await r.json().catch(() => ({ nodes: [] }));
    setNodes(j.nodes ?? []);
    setLoading(false);
  }, [base]);
  useEffect(() => { load(); }, [load]);

  const childrenOf = useMemo(() => {
    const m = new Map<string, Node[]>();
    for (const n of nodes) { const k = n.parentId ?? "__root__"; (m.get(k) ?? m.set(k, []).get(k)!).push(n); }
    return m;
  }, [nodes]);
  const roots = childrenOf.get("__root__") ?? [];
  const toggle = (id: string) => setExpanded((e) => { const n = new Set(e); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function patchNode(nodeId: string, body: Record<string, unknown>) {
    await fetch(`${base}/nodes/${nodeId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await load();
  }
  async function addNode(parentId: string | null, name: string) {
    if (!name.trim()) return;
    await fetch(`${base}/nodes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parentId, name: name.trim() }) });
    setAddingUnder(null); setAddDraft("");
    await load(); onChanged();
  }
  async function deleteNode(nodeId: string) {
    await fetch(`${base}/nodes/${nodeId}`, { method: "DELETE" });
    await load(); onChanged();
  }

  function Row({ n, depth }: { n: Node; depth: number }) {
    const kids = childrenOf.get(n.id) ?? [];
    const open = expanded.has(n.id);
    const isEditing = editing === n.id;
    return (
      <>
        <div className={`group flex items-center gap-1.5 py-0.5 rounded hover:bg-orange-50/60 ${!n.active ? "opacity-45" : ""}`} style={{ paddingLeft: depth * 16 + 4 }}>
          <button onClick={() => kids.length && toggle(n.id)} className={`w-3 text-[9px] text-gray-400 ${kids.length ? "" : "invisible"}`}>{open ? "▾" : "▸"}</button>
          <span className="font-mono text-[10px] text-gray-500 shrink-0 w-16 truncate" title={n.hierarchyId}>{n.orgCode ?? n.hierarchyId}</span>
          {isEditing ? (
            <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
              onBlur={() => { if (draft.trim() && draft !== n.name) patchNode(n.id, { name: draft.trim() }); setEditing(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { if (draft.trim() && draft !== n.name) patchNode(n.id, { name: draft.trim() }); setEditing(null); } if (e.key === "Escape") setEditing(null); }}
              className="flex-1 text-[12px] border border-orange-300 rounded px-1 py-0.5 bg-white text-gray-800" />
          ) : (
            <span className="text-[12px] text-gray-800 flex-1" onDoubleClick={() => { setEditing(n.id); setDraft(n.name); }}>
              {n.name}
              {n.isCustom && <span className="ml-1 text-[8px] uppercase px-1 py-0.5 rounded bg-indigo-100 text-indigo-700">custom</span>}
              {!n.active && <span className="ml-1 text-[8px] uppercase px-1 py-0.5 rounded bg-gray-100 text-gray-500">hidden</span>}
              {n.sourcePcfId != null && <span className="ml-1 text-[8px] text-gray-300" title="Sourced from an APQC reference (provenance kept)">◆ apqc</span>}
              <span className="ml-1 text-[9px] text-gray-400">{LEVEL[n.level]}</span>
            </span>
          )}
          <span className="hidden group-hover:flex items-center gap-1 shrink-0 pr-1">
            <button onClick={() => { setEditing(n.id); setDraft(n.name); }} title="Rename" className="text-[11px] text-gray-400 hover:text-gray-700">✎</button>
            <button onClick={() => patchNode(n.id, { active: !n.active })} title={n.active ? "Hide" : "Show"} className="text-[11px] text-gray-400 hover:text-gray-700">{n.active ? "⊘" : "◎"}</button>
            <button onClick={() => { setAddingUnder(n.id); setAddDraft(""); setExpanded((e) => new Set(e).add(n.id)); }} title="Add custom child" className="text-[11px] text-emerald-500 hover:text-emerald-700">＋</button>
            <button onClick={() => setComposeUnder(n.id)} title="Compose a reference branch under this" className="text-[11px] text-blue-500 hover:text-blue-700">⧉</button>
            <button onClick={() => setConfirm({ title: "Remove node", message: `Remove "${n.name}"${kids.length ? ` and its ${kids.length} child item(s)` : ""}?`, onConfirm: () => { setConfirm(null); deleteNode(n.id); } })} title="Remove" className="text-[11px] text-gray-400 hover:text-red-600">×</button>
          </span>
        </div>
        {addingUnder === n.id && (
          <div className="flex items-center gap-1.5 py-0.5" style={{ paddingLeft: (depth + 1) * 16 + 20 }}>
            <input autoFocus value={addDraft} onChange={(e) => setAddDraft(e.target.value)} placeholder="New custom node name…"
              onKeyDown={(e) => { if (e.key === "Enter") addNode(n.id, addDraft); if (e.key === "Escape") setAddingUnder(null); }}
              className="text-[11px] border border-emerald-300 rounded px-1 py-0.5 bg-white text-gray-800 w-56" />
            <button onClick={() => addNode(n.id, addDraft)} className="text-[10px] text-emerald-700">Add</button>
            <button onClick={() => setAddingUnder(null)} className="text-[10px] text-gray-400">Cancel</button>
          </div>
        )}
        {open && kids.map((k) => <Row key={k.id} n={k} depth={depth + 1} />)}
      </>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <button onClick={() => { setAddingUnder("__root__"); setAddDraft(""); }} className="text-[11px] px-2 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50">＋ Custom node</button>
        <button onClick={() => setComposeUnder("__root__")} className="text-[11px] px-2 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50">⧉ Compose from reference…</button>
        <span className="text-[11px] text-gray-400">{nodes.length} nodes · double-click a name to rename</span>
      </div>

      {addingUnder === "__root__" && (
        <div className="flex items-center gap-1.5 py-1 mb-1">
          <input autoFocus value={addDraft} onChange={(e) => setAddDraft(e.target.value)} placeholder="New top-level custom node…"
            onKeyDown={(e) => { if (e.key === "Enter") addNode(null, addDraft); if (e.key === "Escape") setAddingUnder(null); }}
            className="text-[11px] border border-emerald-300 rounded px-1 py-0.5 bg-white text-gray-800 w-64" />
          <button onClick={() => addNode(null, addDraft)} className="text-[10px] text-emerald-700">Add</button>
          <button onClick={() => setAddingUnder(null)} className="text-[10px] text-gray-400">Cancel</button>
        </div>
      )}

      {loading ? <p className="text-sm text-gray-400">Loading…</p>
        : nodes.length === 0 ? <p className="text-xs text-gray-500 py-6 text-center">Empty framework. Compose a branch from a reference framework, or add a custom node.</p>
        : roots.map((n) => <Row key={n.id} n={n} depth={0} />)}

      {composeUnder !== null && (
        <ComposeModal orgId={orgId} frameworkId={frameworkId} frameworks={frameworks}
          targetParentId={composeUnder === "__root__" ? null : composeUnder}
          onClose={() => setComposeUnder(null)}
          onDone={() => { setComposeUnder(null); load(); onChanged(); }} />
      )}
      {confirm && <ConfirmDialog title={confirm.title} message={confirm.message} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} confirmLabel="Remove" destructive />}
    </div>
  );
}

/** Pick a source framework + a node in it, then graft its branch under the target. */
function ComposeModal({ orgId, frameworkId, frameworks, targetParentId, onClose, onDone }: {
  orgId: string; frameworkId: string; frameworks: Framework[]; targetParentId: string | null;
  onClose: () => void; onDone: () => void;
}) {
  const sources = frameworks.filter((f) => f.id !== frameworkId);
  const [src, setSrc] = useState(sources.find((f) => f.kind === "reference")?.id ?? sources[0]?.id ?? "");
  const [nodes, setNodes] = useState<{ id: string; hierarchyId: string; name: string; level: number }[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!src) return;
    fetch(`/api/orgs/${orgId}/pcf/${src}`).then((r) => r.json()).then((j) => setNodes(j.nodes ?? [])).catch(() => setNodes([]));
  }, [src, orgId]);

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = s ? nodes.filter((n) => n.name.toLowerCase().includes(s) || n.hierarchyId.includes(s)) : nodes;
    return base.slice(0, 60);
  }, [q, nodes]);

  async function compose(rootNodeId: string) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/orgs/${orgId}/pcf/${frameworkId}/compose`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceFrameworkId: src, rootNodeId, targetParentId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? "Compose failed"); return; }
      onDone();
    } catch { setErr("Compose failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/25 flex items-center justify-center z-50" onClick={busy ? undefined : onClose}>
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-[460px]" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Compose from reference</h3>
        <p className="text-[11px] text-gray-500 mb-3">Pick a branch to copy into this framework{targetParentId ? " under the selected node" : " at the top level"}. Provenance back to APQC is kept.</p>
        <select value={src} onChange={(e) => setSrc(e.target.value)} className="w-full text-xs border border-gray-300 rounded px-2 py-1 mb-2 bg-white text-gray-800">
          {sources.map((f) => <option key={f.id} value={f.id}>{f.kind === "reference" ? `${f.variant} v${f.version}` : f.name}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search branch to copy…" className="w-full text-xs border border-gray-300 rounded px-2 py-1 mb-2 bg-white text-gray-800" />
        <div className="max-h-64 overflow-y-auto border border-gray-100 rounded">
          {hits.map((n) => (
            <button key={n.id} disabled={busy} onClick={() => compose(n.id)} className="w-full text-left px-2 py-1 text-[11px] hover:bg-blue-50 flex items-baseline gap-1.5 disabled:opacity-50">
              <span className="font-mono text-gray-500 shrink-0">{n.hierarchyId}</span>
              <span className="flex-1 text-gray-800">{n.name}</span>
              <span className="text-[8px] text-gray-400">{LEVEL[n.level]}</span>
            </button>
          ))}
          {hits.length === 0 && <p className="text-[11px] text-gray-400 px-2 py-2">No nodes.</p>}
        </div>
        {err && <p className="text-[11px] text-red-600 mt-2">{err}</p>}
        {busy && <p className="text-[11px] text-blue-600 mt-2">Composing…</p>}
        <div className="flex justify-end mt-3"><button onClick={onClose} disabled={busy} className="px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Close</button></div>
      </div>
    </div>
  );
}
