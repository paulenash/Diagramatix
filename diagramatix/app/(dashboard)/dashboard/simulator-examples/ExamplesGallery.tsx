"use client";

/**
 * Simulator Examples gallery — browse the published example simulations and
 * one-click "Load & open" any into a fresh project, landing on its diagram so
 * you can open the ◈ Simulator and Run / Replay immediately.
 *
 * Matrix-themed: a digital-rain backdrop + green-phosphor cards/buttons, so the
 * gallery already feels like the Simulator you're about to enter.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MatrixRain } from "@/app/components/simulation/matrix/MatrixRain";
import { MatrixButton } from "@/app/components/simulation/matrix/MatrixChrome";

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
  intro: "border-green-400/60 text-green-300",
  core: "border-emerald-400/60 text-emerald-300",
  advanced: "border-lime-400/60 text-lime-300",
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
      // Always land on the new project (not straight into a diagram) so the
      // user sees the whole adopted example — its diagrams, study and library.
      if (json.projectId) router.push(`/dashboard/projects/${json.projectId}`);
      else if (json.openDiagramId) router.push(`/diagram/${json.openDiagramId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load example");
    } finally { setAdopting(null); }
  }

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] bg-black text-green-400 font-mono overflow-hidden">
      {/* Matrix digital-rain backdrop */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <MatrixRain fontSize={18} />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-semibold text-green-300 tracking-wide">◈ Simulator Examples</h1>
          <a href="/dashboard" className="text-sm text-green-400/60 hover:text-green-300">← Dashboard</a>
        </div>
        <p className="text-sm text-green-400/70 mb-6">
          Ready-made simulations to explore or demo. <span className="text-green-300">Load</span> copies one into a
          new project of your own; open a diagram there and launch the <span className="text-green-300">◈ Simulator</span> to Run, Replay, and compare scenarios.
        </p>

        {err && <div className="mb-4 rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</div>}
        {loading && <p className="text-green-400/50">Loading…</p>}
        {!loading && examples.length === 0 && (
          <p className="text-green-400/50">No published examples yet{isAdmin ? " — seed or capture some, then publish." : "."}</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {examples.map((ex) => (
            <div key={ex.id} className="rounded-lg border border-green-500/40 bg-black/60 p-4 flex flex-col shadow-[0_0_18px_rgba(34,197,94,0.12)]">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-semibold text-green-200">{ex.title}</h2>
                <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${DIFF_STYLE[ex.difficulty] ?? "border-green-400/40 text-green-400/70"}`}>
                  {ex.difficulty}
                </span>
              </div>
              {ex.concept && <p className="text-sm text-green-400/80 mt-1">{ex.concept}</p>}
              <div className="text-xs text-green-400/50 mt-2 flex gap-3">
                <span>{ex.summary.diagrams} diagram{ex.summary.diagrams === 1 ? "" : "s"}</span>
                <span>{ex.summary.teams} team{ex.summary.teams === 1 ? "" : "s"}</span>
                <span>{ex.summary.scenarios} scenario{ex.summary.scenarios === 1 ? "" : "s"}</span>
              </div>
              <div className="flex-1" />
              <div className="mt-3">
                <MatrixButton onClick={() => adopt(ex.id)}>
                  {adopting === ex.id ? "◴ Loading…" : "▶ Load"}
                </MatrixButton>
              </div>
            </div>
          ))}
        </div>

        {isAdmin && (
          <p className="mt-8 text-xs text-green-400/40">
            Admin: manage the catalog at <a href="/dashboard/admin/simulator-examples" className="underline hover:text-green-300">Catalog manager</a>.
          </p>
        )}
      </div>
    </div>
  );
}
