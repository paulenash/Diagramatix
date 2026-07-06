"use client";

/**
 * Risk & Control (GRC) Examples gallery — browse the published GRC examples and
 * one-click "Load & open" any into a fresh project: the real process diagrams,
 * a risk/control catalog attached to the steps, and a mining run so control
 * operating-effectiveness lights up. Teal identity (the Risk & Control area).
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ExampleCard {
  id: string; slug: string; title: string; concept: string; description: string; difficulty: string;
  summary: { diagrams: number; risks: number; controls: number; items: number; links: number; hasMining: boolean };
}

const DIFF_STYLE: Record<string, string> = {
  intro: "bg-teal-100 text-teal-800 border-teal-200",
  core: "bg-teal-100 text-teal-800 border-teal-300",
  advanced: "bg-teal-700 text-white border-teal-700",
};

export function RiskControlExamplesGallery({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [examples, setExamples] = useState<ExampleCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [adopting, setAdopting] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/risk-control-examples");
      if (res.ok) setExamples((await res.json()).examples ?? []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function adopt(id: string) {
    setAdopting(id); setErr(null);
    try {
      const res = await fetch(`/api/risk-control-examples/${id}/adopt`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error ?? "Could not load example"); return; }
      // Land in the new project with the Risk & Control console open (the point
      // of a GRC example) rather than the bare project detail.
      if (json.projectId) router.push(`/dashboard/projects/${json.projectId}?rcm=1`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load example");
    } finally { setAdopting(null); }
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-b from-teal-50/60 to-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-semibold text-teal-800 tracking-tight">◆ Risk &amp; Control Examples</h1>
          <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-800">← Dashboard</a>
        </div>
        <p className="text-sm text-gray-700 mb-6 max-w-2xl">
          Ready-made governance studies to explore or demo. <span className="text-teal-800 font-semibold">Load &amp; open</span> copies one
          into a new project — the real process diagrams with Risks &amp; Controls attached to the steps, plus a mining run — then open
          <span className="text-teal-800 font-semibold"> ◆ Risk &amp; Controls</span> to see the Risk-Control Matrix and control operating-effectiveness.
        </p>

        {err && <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
        {loading && <p className="text-gray-500">Loading…</p>}
        {!loading && examples.length === 0 && (
          <p className="text-gray-600">No published examples yet{isAdmin ? " — seed or author some, then publish." : "."}</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {examples.map((ex) => (
            <div key={ex.id} className="rounded-xl border border-teal-200 bg-white p-4 flex flex-col shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-semibold text-gray-900">{ex.title}</h2>
                <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${DIFF_STYLE[ex.difficulty] ?? "border-gray-300 text-gray-500"}`}>{ex.difficulty}</span>
              </div>
              {ex.concept && <p className="text-sm text-gray-700 mt-1">{ex.concept}</p>}
              <div className="text-xs text-gray-600 mt-2 flex gap-3 flex-wrap">
                <span>{ex.summary.diagrams} diagram{ex.summary.diagrams === 1 ? "" : "s"}</span>
                <span>{ex.summary.risks} risk{ex.summary.risks === 1 ? "" : "s"}</span>
                <span>{ex.summary.controls} control{ex.summary.controls === 1 ? "" : "s"}</span>
                {ex.summary.hasMining && <span className="text-teal-800 font-medium">+ mining run</span>}
              </div>
              <div className="flex-1" />
              <div className="mt-3">
                <button onClick={() => adopt(ex.id)} disabled={adopting !== null}
                  className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50 shadow-sm">
                  {adopting === ex.id ? "◴ Loading…" : "▶ Load & open"}
                </button>
              </div>
            </div>
          ))}
        </div>

        {isAdmin && (
          <p className="mt-8 text-xs text-gray-500">
            Admin: manage the catalog at <a href="/dashboard/admin/risk-control-examples" className="text-teal-800 font-medium underline hover:text-teal-900">Catalog manager</a>.
          </p>
        )}
      </div>
    </div>
  );
}
