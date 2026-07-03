"use client";

/**
 * DiagramatixMINER Examples gallery — browse the published process-mining
 * examples and one-click "Load & open" any into a fresh project. Adopt lands you
 * on the dashboard with the ⛏ DiagramatixMINER console auto-opened on the new
 * project (via ?mining=<projectId>), the mined run already present so you can
 * Discover, check Conformance, and Calibrate & simulate immediately.
 *
 * Miner-skinned: an amber/brown digital-rain backdrop + stone/amber cards, to
 * match the DiagramatixMINER console you're about to enter.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MatrixRain } from "@/app/components/simulation/matrix/MatrixRain";

interface ExampleCard {
  id: string;
  slug: string;
  title: string;
  concept: string;
  description: string;
  difficulty: string;
  summary: { references: number; cases: number; variants: number; states: number };
}

const DIFF_STYLE: Record<string, string> = {
  intro: "border-amber-400/60 text-amber-300",
  core: "border-amber-500/60 text-amber-400",
  advanced: "border-orange-400/60 text-orange-300",
};

export function MiningExamplesGallery({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [examples, setExamples] = useState<ExampleCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [adopting, setAdopting] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mining-examples");
      if (res.ok) setExamples((await res.json()).examples ?? []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function adopt(id: string) {
    setAdopting(id); setErr(null);
    try {
      const res = await fetch(`/api/mining-examples/${id}/adopt`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error ?? "Could not load example"); return; }
      // Land on the dashboard with the miner console auto-opened on the new project.
      if (json.projectId) router.push(`/dashboard?mining=${json.projectId}&mp=${encodeURIComponent(json.projectName ?? "")}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load example");
    } finally { setAdopting(null); }
  }

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] bg-stone-950 text-amber-200 font-mono overflow-hidden">
      {/* Amber digital-rain backdrop */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <MatrixRain fontSize={18} color="#B45309" headColor="#FCD34D" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-semibold text-amber-300 tracking-wide">⛏ DiagramatixMINER Examples</h1>
          <a href="/dashboard" className="text-sm text-amber-200/60 hover:text-amber-200">← Dashboard</a>
        </div>
        <p className="text-sm text-amber-200/70 mb-6">
          Ready-made process-mining studies to explore or demo. <span className="text-amber-300">Load &amp; open</span> copies one
          into a new project and opens <span className="text-amber-300">⛏ DiagramatixMINER</span> on it — Discover the process,
          check Conformance against the reference lifecycle, then Calibrate &amp; simulate.
        </p>

        {err && <div className="mb-4 rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</div>}
        {loading && <p className="text-amber-200/50">Loading…</p>}
        {!loading && examples.length === 0 && (
          <p className="text-amber-200/50">No published examples yet{isAdmin ? " — seed or capture some, then publish." : "."}</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {examples.map((ex) => (
            <div key={ex.id} className="rounded-lg border border-amber-500/40 bg-stone-900/70 p-4 flex flex-col shadow-[0_0_18px_rgba(180,83,9,0.15)]">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-semibold text-amber-100">{ex.title}</h2>
                <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${DIFF_STYLE[ex.difficulty] ?? "border-amber-400/40 text-amber-200/70"}`}>
                  {ex.difficulty}
                </span>
              </div>
              {ex.concept && <p className="text-sm text-amber-200/80 mt-1">{ex.concept}</p>}
              <div className="text-xs text-amber-200/50 mt-2 flex gap-3 flex-wrap">
                <span>{ex.summary.cases} case{ex.summary.cases === 1 ? "" : "s"}</span>
                <span>{ex.summary.variants} variant{ex.summary.variants === 1 ? "" : "s"}</span>
                <span>{ex.summary.references} reference{ex.summary.references === 1 ? "" : "s"}</span>
              </div>
              <div className="flex-1" />
              <div className="mt-3">
                <button
                  onClick={() => adopt(ex.id)}
                  disabled={adopting !== null}
                  className="rounded border border-amber-500/60 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-500/20 disabled:opacity-50 shadow-[0_0_12px_rgba(180,83,9,0.25)]"
                >
                  {adopting === ex.id ? "◴ Loading…" : "▶ Load & open"}
                </button>
              </div>
            </div>
          ))}
        </div>

        {isAdmin && (
          <p className="mt-8 text-xs text-amber-200/40">
            Admin: manage the catalog at <a href="/dashboard/admin/mining-examples" className="underline hover:text-amber-200">Catalog manager</a>.
          </p>
        )}
      </div>
    </div>
  );
}
