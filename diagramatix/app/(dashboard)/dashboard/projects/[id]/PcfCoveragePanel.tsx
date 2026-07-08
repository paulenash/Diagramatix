"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface CovNode {
  id: string; pcfId: number; hierarchyId: string; name: string; level: number; parentId: string | null;
  modelled: boolean; subtreeTotal: number; subtreeModelled: number; diagrams: { id: string; name: string }[];
}
interface CovData {
  framework: { name: string; variant: string; version: string };
  root: { hierarchyId?: string; name?: string } | null;
  nodes: CovNode[];
  total: number; modelled: number;
  byLevel: { level: number; total: number; modelled: number }[];
  byCategory: { id: string; hierarchyId: string; name: string; total: number; modelled: number }[];
}

const LEVEL = ["", "Category", "Process Group", "Process", "Activity", "Task"];

function pct(m: number, t: number) { return t === 0 ? 0 : Math.round((m / t) * 100); }

function Bar({ m, t }: { m: number; t: number }) {
  const p = pct(m, t);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded bg-gray-100 overflow-hidden">
        <div className="h-full bg-emerald-500" style={{ width: `${p}%` }} />
      </div>
      <span className="text-[10px] text-gray-500 tabular-nums w-16 text-right">{m}/{t} · {p}%</span>
    </div>
  );
}

/**
 * APQC PCF Coverage (L4a) — of the PCF processes in the project's framework/branch,
 * which are modelled by a classified diagram. Headline % + per-category bars +
 * a drill-down tree with ✓ modelled / ◐ partial / ○ gap markers.
 */
export function PcfCoveragePanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<CovData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [gapsOnly, setGapsOnly] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/pcf/coverage`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? "Failed to load coverage"); return; }
      setData(j);
      // Collapse below level 2 by default so a whole-framework view is scannable.
      setCollapsed(new Set((j.nodes as CovNode[]).filter((n) => n.level >= 2 && n.subtreeTotal > 1).map((n) => n.id)));
    }).catch(() => setErr("Failed to load coverage"));
  }, [projectId]);

  const childrenOf = useMemo(() => {
    const m = new Map<string, CovNode[]>();
    for (const n of data?.nodes ?? []) {
      const k = n.parentId ?? "__root__";
      (m.get(k) ?? m.set(k, []).get(k)!).push(n);
    }
    return m;
  }, [data]);

  function toggle(id: string) {
    setCollapsed((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  function renderNode(n: CovNode, depth: number): React.ReactNode {
    const kids = childrenOf.get(n.id) ?? [];
    const hasKids = kids.length > 0;
    const isCollapsed = collapsed.has(n.id);
    const partial = !n.modelled && n.subtreeModelled > 0;
    // In gaps-only mode, hide fully-covered subtrees.
    if (gapsOnly && n.subtreeModelled === n.subtreeTotal) return null;
    const marker = n.modelled ? <span className="text-emerald-600">✓</span>
      : partial ? <span className="text-amber-500">◐</span>
      : <span className="text-gray-300">○</span>;
    return (
      <div key={n.id}>
        <div className="flex items-center gap-1.5 py-0.5 hover:bg-gray-50 rounded" style={{ paddingLeft: depth * 16 + 4 }}>
          <button onClick={() => hasKids && toggle(n.id)} className={`w-3 text-[9px] text-gray-400 ${hasKids ? "" : "invisible"}`}>{isCollapsed ? "▶" : "▼"}</button>
          <span className="w-3 text-center text-[11px]">{marker}</span>
          <span className="font-mono text-[10px] text-gray-500 shrink-0">{n.hierarchyId}</span>
          <span className={`text-[11px] flex-1 ${n.modelled ? "text-gray-900" : "text-gray-600"}`}>{n.name}</span>
          {hasKids && <span className="text-[9px] text-gray-400 tabular-nums shrink-0">{n.subtreeModelled}/{n.subtreeTotal}</span>}
          {n.diagrams.map((d) => (
            <button key={d.id} onClick={() => { onClose(); router.push(`/diagram/${d.id}`); }}
              className="text-[9px] text-blue-600 hover:text-blue-800 underline shrink-0 max-w-[120px] truncate" title={d.name}>
              {d.name}
            </button>
          ))}
        </div>
        {hasKids && !isCollapsed && kids.map((k) => renderNode(k, depth + 1))}
      </div>
    );
  }

  const roots = childrenOf.get("__root__") ?? [];

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 w-[720px] max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">APQC PCF Coverage</h2>
            {data && <p className="text-[11px] text-gray-500">{data.framework.variant} v{data.framework.version}{data.root?.hierarchyId ? ` · ${data.root.hierarchyId} ${data.root.name}` : " · whole framework"}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
        </div>

        {err && <div className="p-5 text-xs text-red-600">{err}</div>}
        {!data && !err && <div className="p-5 text-xs text-gray-400">Loading coverage…</div>}

        {data && (
          <>
            <div className="px-5 py-3 border-b border-gray-100">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-2xl font-semibold text-gray-900 tabular-nums">{pct(data.modelled, data.total)}%</span>
                <span className="text-[11px] text-gray-500">modelled — {data.modelled} of {data.total} PCF processes have a classified diagram</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {data.byLevel.map((l) => (
                  <span key={l.level} className="text-[10px] text-gray-500">{LEVEL[l.level] || `L${l.level}`}: <span className="text-gray-800 font-medium">{l.modelled}/{l.total}</span></span>
                ))}
              </div>
            </div>

            <div className="px-5 py-3 border-b border-gray-100 space-y-1.5 max-h-40 overflow-y-auto">
              <p className="text-[9px] uppercase tracking-wide text-gray-400 mb-1">By category</p>
              {data.byCategory.map((c) => (
                <div key={c.id} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-700 w-56 truncate" title={`${c.hierarchyId} ${c.name}`}>
                    <span className="font-mono text-gray-400">{c.hierarchyId}</span> {c.name}
                  </span>
                  <div className="flex-1"><Bar m={c.modelled} t={c.total} /></div>
                </div>
              ))}
            </div>

            <div className="px-4 py-2 flex-1 overflow-y-auto">
              <label className="flex items-center gap-1.5 mb-2 text-[10px] text-gray-500 cursor-pointer">
                <input type="checkbox" checked={gapsOnly} onChange={(e) => setGapsOnly(e.target.checked)} />
                Show gaps only (hide fully-modelled subtrees)
              </label>
              {roots.map((n) => renderNode(n, 0))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
