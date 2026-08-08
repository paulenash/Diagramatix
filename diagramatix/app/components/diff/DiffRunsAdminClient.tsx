"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DiffRunViewer } from "./DiffRunViewer";

interface AdminRun {
  id: string; aName: string; bName: string; createdAt: string; hasAiSummary: boolean;
  aDiagramId: string | null; bDiagramId: string | null;
  userId: string | null; userName: string | null; userEmail: string | null;
  orgId?: string | null; orgName?: string;
}

function fmt(iso: string): string {
  try { return new Date(iso).toLocaleString("en-AU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true }); }
  catch { return iso; }
}

/**
 * Diff Process Runs management — OrgAdmin (grouped by user) or SuperAdmin
 * (grouped by org → user). Lists runs, opens the read-only viewer, and deletes.
 */
export function DiffRunsAdminClient({ scope }: { scope: "org" | "super" }) {
  const router = useRouter();
  const [runs, setRuns] = useState<AdminRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewId, setViewId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const res = await fetch(scope === "super" ? "/api/admin/diff-runs" : "/api/org-admin/diff-runs", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load runs");
      setRuns((await res.json()).runs ?? []);
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [scope]);

  async function remove(id: string) {
    setPendingDelete(null);
    const res = await fetch(`/api/diagrams/diff/runs/${id}`, { method: "DELETE" });
    if (res.ok) setRuns((prev) => prev.filter((r) => r.id !== id));
    else setErr("Delete failed");
  }

  const userLabel = (r: AdminRun) => r.userName || r.userEmail || "(unknown user)";

  // Opening a diagram from here returns to THIS screen (Back link top-left).
  const backPath = scope === "super" ? "/dashboard/admin/diff-runs" : "/dashboard/org-admin/diff-runs";
  const openDiagram = (id: string) => router.push(`/diagram/${id}?from=${encodeURIComponent(backPath)}`);

  // Group: super = org → user → runs; org = user → runs.
  const grouped = useMemo(() => {
    const byOrg = new Map<string, { orgName: string; byUser: Map<string, AdminRun[]> }>();
    for (const r of runs) {
      const orgKey = scope === "super" ? (r.orgId ?? "none") : "org";
      const orgName = scope === "super" ? (r.orgName ?? "(no org)") : "";
      if (!byOrg.has(orgKey)) byOrg.set(orgKey, { orgName, byUser: new Map() });
      const g = byOrg.get(orgKey)!;
      const uKey = r.userId ?? "none";
      (g.byUser.get(uKey) ?? g.byUser.set(uKey, []).get(uKey)!).push(r);
    }
    return byOrg;
  }, [runs, scope]);

  const RunRow = ({ r }: { r: AdminRun }) => (
    <div className="flex items-center gap-2 py-1 border-b border-gray-50 text-[11px]">
      <span className="text-gray-500 w-32 shrink-0">{fmt(r.createdAt)}</span>
      <span className="flex-1 text-gray-800 truncate">{r.aName} → {r.bName}{r.hasAiSummary ? " · AI" : ""}</span>
      <button onClick={() => r.aDiagramId && openDiagram(r.aDiagramId)} disabled={!r.aDiagramId}
        title={r.aDiagramId ? "Open the 'before' process" : "Before diagram no longer exists"}
        className="text-blue-600 hover:text-blue-800 underline disabled:text-gray-300 disabled:no-underline">View Before</button>
      <button onClick={() => r.bDiagramId && openDiagram(r.bDiagramId)} disabled={!r.bDiagramId}
        title={r.bDiagramId ? "Open the 'after' process" : "After diagram no longer exists"}
        className="text-blue-600 hover:text-blue-800 underline disabled:text-gray-300 disabled:no-underline">View After</button>
      <button onClick={() => setViewId(r.id)} className="text-blue-600 hover:text-blue-800 underline">View Diff</button>
      {pendingDelete === r.id ? (
        <>
          <button onClick={() => remove(r.id)} className="text-red-700 font-medium underline">Confirm</button>
          <button onClick={() => setPendingDelete(null)} className="text-gray-500 underline">Cancel</button>
        </>
      ) : (
        <button onClick={() => setPendingDelete(r.id)} className="text-red-600 hover:text-red-800 underline">Remove</button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <button onClick={() => router.push(scope === "super" ? "/dashboard/admin" : "/dashboard/org-admin")}
          className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1">
          <span style={{ fontSize: "1.5em", lineHeight: 1 }}>←</span>
          <span className="underline">{scope === "super" ? "SuperAdmin" : "OrgAdmin"}</span>
        </button>
        <h1 className="font-semibold text-gray-900">Diff Process Runs</h1>
      </header>

      <div className="p-6 max-w-4xl mx-auto">
        {err && <p className="text-xs text-red-600 mb-2">{err}</p>}
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-gray-400">No saved Diff Process runs.</p>
        ) : (
          [...grouped.entries()].map(([orgKey, g]) => (
            <div key={orgKey} className="mb-6">
              {scope === "super" && <h2 className="text-sm font-semibold text-gray-800 mb-2">{g.orgName}</h2>}
              {[...g.byUser.entries()].map(([uKey, urs]) => (
                <div key={uKey} className="mb-3 border border-gray-200 rounded">
                  <div className="px-3 py-1.5 bg-gray-50 text-xs font-medium text-gray-700 border-b border-gray-100">
                    {userLabel(urs[0])} <span className="text-gray-400">({urs.length})</span>
                  </div>
                  <div className="px-3">{urs.map((r) => <RunRow key={r.id} r={r} />)}</div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {viewId && <DiffRunViewer runId={viewId} onClose={() => setViewId(null)} />}
    </div>
  );
}
