"use client";

/**
 * Simulator Examples gallery — browse the published example simulations and
 * one-click "Load & open" any of them into a fresh project, landing straight on
 * its diagram so you can open the ◈ Simulator and Run / Replay immediately.
 * Normal dashboard styling (the Matrix drama starts inside the Simulator).
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ExampleCard {
  id: string;
  slug: string;
  title: string;
  concept: string;
  description: string;
  difficulty: string;
  summary: { diagrams: number; teams: number; scenarios: number; roots: number };
}

const DIFF_STYLE: Record<string, string> = {
  intro: "bg-green-100 text-green-700",
  core: "bg-blue-100 text-blue-700",
  advanced: "bg-purple-100 text-purple-700",
};

export function ExamplesGallery({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [examples, setExamples] = useState<ExampleCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [adopting, setAdopting] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/simulation-examples");
      if (res.ok) setExamples((await res.json()).examples ?? []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function adopt(id: string) {
    setAdopting(id); setErr(null);
    try {
      const res = await fetch(`/api/simulation-examples/${id}/adopt`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error ?? "Could not load example"); return; }
      if (json.openDiagramId) router.push(`/diagram/${json.openDiagramId}`);
      else if (json.projectId) router.push(`/dashboard/projects/${json.projectId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load example");
    } finally { setAdopting(null); }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold text-gray-900">Simulator Examples</h1>
        <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">← Dashboard</a>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Ready-made simulations to explore or demo. <span className="font-medium">Load &amp; open</span> copies one into a new
        project of your own; open the <span className="font-mono">◈ Simulator</span> on its diagram to Run, Replay, and compare scenarios.
      </p>

      {err && <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      {loading && <p className="text-gray-400">Loading…</p>}
      {!loading && examples.length === 0 && (
        <p className="text-gray-400">No published examples yet{isAdmin ? " — seed or capture some, then publish." : "."}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {examples.map((ex) => (
          <div key={ex.id} className="rounded-lg border border-gray-200 bg-white p-4 flex flex-col">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold text-gray-900">{ex.title}</h2>
              <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${DIFF_STYLE[ex.difficulty] ?? "bg-gray-100 text-gray-600"}`}>
                {ex.difficulty}
              </span>
            </div>
            {ex.concept && <p className="text-sm text-gray-600 mt-1">{ex.concept}</p>}
            <div className="text-xs text-gray-400 mt-2 flex gap-3">
              <span>{ex.summary.diagrams} diagram{ex.summary.diagrams === 1 ? "" : "s"}</span>
              <span>{ex.summary.teams} team{ex.summary.teams === 1 ? "" : "s"}</span>
              <span>{ex.summary.scenarios} scenario{ex.summary.scenarios === 1 ? "" : "s"}</span>
            </div>
            <div className="flex-1" />
            <button
              onClick={() => adopt(ex.id)}
              disabled={adopting !== null}
              className="mt-3 self-start rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {adopting === ex.id ? "Loading…" : "Load & open"}
            </button>
          </div>
        ))}
      </div>

      {isAdmin && (
        <p className="mt-8 text-xs text-gray-400">
          Admin: manage the catalog at <a href="/dashboard/admin/simulator-examples" className="underline hover:text-gray-600">Catalog manager</a>.
        </p>
      )}
    </div>
  );
}
