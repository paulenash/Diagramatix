"use client";

/**
 * DiagramatixMINER console — ingest an event log, discover the implied BPMN + a
 * candidate state machine, check conformance against a reference state machine,
 * and calibrate a digital twin. Amber/brown "mining" skin, styled like the
 * Simulator console.
 *
 * Phase 0.2 reduced this file from 1,183 lines to a shell. It now owns only what
 * genuinely spans the screen — the run list, which run is selected, and deletion
 * — and composes `console/ImportPanel`, `console/RunList` and `console/RunDetail`.
 * Each of those keeps its own state; nothing is lifted here that only one of them
 * needs.
 *
 * The single-scroll layout is deliberately UNCHANGED. An earlier draft of the
 * plan said "behind a tab shell", but `e2e/mining-examples.spec.ts` — the Miner's
 * only route-level coverage — selects a run and expects the conformance controls
 * to be visible immediately. Tabs would have broken it, and a refactor phase is
 * the wrong place to change what a user sees.
 */

import { useCallback, useEffect, useState } from "react";
import { MiningSourcesPanel } from "./MiningSourcesPanel";
import { LiveDemoPanel } from "./LiveDemoPanel";
import { ImportPanel } from "./console/ImportPanel";
import { RunList } from "./console/RunList";
import { RunDetail } from "./console/RunDetail";
import type { RunRow } from "./console/shared";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";

export function ProcessMiningConsole({ projectId, projectName, isAdmin, onClose, onOpenSimulator }: { projectId: string; projectName?: string; isAdmin?: boolean; onClose: () => void; onOpenSimulator?: (studyId?: string | null) => void }) {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<RunRow | null>(null);
  const [deletingStudy, setDeletingStudy] = useState<{ groupId: string; name: string; count: number } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/mining/runs`);
    if (res.ok) setRuns((await res.json()).runs ?? []);
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  // Persist a field on a run. Optimistic — the panel that asked has already moved
  // its own UI on, and a failed PATCH re-reads the truth.
  const patchRun = useCallback((runId: string, patch: { excludeFromCompliance?: boolean; referenceSmId?: string | null }) => {
    setRuns((rs) => rs.map((r) => (r.id === runId ? { ...r, ...patch } : r)));
    void fetch(`/api/projects/${projectId}/mining/runs/${runId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    }).catch(() => { void load(); });
  }, [projectId, load]);

  // Restore the run that was open before viewing a diagram (return-to-exact-screen).
  useEffect(() => {
    try {
      const rid = sessionStorage.getItem(`mining-return:${projectId}`);
      if (rid) { sessionStorage.removeItem(`mining-return:${projectId}`); setSelectedId(rid); }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function remove(id: string) {
    setDeleting(null);
    await fetch(`/api/projects/${projectId}/mining/runs/${id}`, { method: "DELETE" });
    if (selectedId === id) setSelectedId(null);
    await load();
  }

  // Delete a whole OCEL import (every object-type run in the study).
  async function removeStudy(groupId: string) {
    const ids = runs.filter((r) => r.ocelGroupId === groupId).map((r) => r.id);
    setDeletingStudy(null);
    for (const id of ids) await fetch(`/api/projects/${projectId}/mining/runs/${id}`, { method: "DELETE" }).catch(() => {});
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    await load();
  }

  const selected = runs.find((r) => r.id === selectedId) ?? null;
  // Open a discovered diagram with a back-link that returns to the MINER console
  // (via the ?mining deep-link) instead of the owning project.
  const openDiagram = useCallback((id: string) =>
    `/diagram/${id}?from=${encodeURIComponent(`/dashboard?mining=${projectId}&mp=${encodeURIComponent(projectName ?? "")}&pmnoi=1`)}`,
    [projectId, projectName]);
  // Remember which run was open so returning from a diagram restores the exact
  // screen (the selected-run panel) instead of the top of the console.
  const stashReturn = useCallback(() => {
    try { if (selectedId) sessionStorage.setItem(`mining-return:${projectId}`, selectedId); } catch { /* ignore */ }
  }, [projectId, selectedId]);

  return (
    <div className="fixed inset-0 z-[60] bg-stone-950 text-stone-200 overflow-auto font-mono">
      <header className="flex items-center justify-between px-5 py-3 border-b border-amber-900/50 sticky top-0 bg-stone-950/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="text-amber-300 tracking-[0.25em] text-sm">⛏ DiagramatixMINER</span>
          {projectName && <span className="text-stone-400 text-xs">{projectName}</span>}
        </div>
        <div className="flex items-center gap-2">
          <a href="/help?c=process-mining" target="_blank" rel="noopener noreferrer"
            title="Open the Process Mining section of the User Guide"
            className="px-3 py-1.5 text-xs text-amber-200 border border-amber-500/40 hover:bg-amber-500/10 rounded">📖 User Guide</a>
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-white bg-stone-700 hover:bg-stone-600 rounded">✕ Exit</button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 grid gap-4 md:grid-cols-3">
        <ImportPanel
          projectId={projectId}
          openDiagram={openDiagram}
          stashReturn={stashReturn}
          onImported={async (runId) => { await load(); setSelectedId(runId); }}
        />

        {/* Live-source polling DEMO — appears after adopting the "Order Processing —
            live" example; ingests poll batches into a real webhook source. */}
        <LiveDemoPanel projectId={projectId} onPolled={(runId) => { void load(); if (runId) setSelectedId(runId); }} />

        {/* Live sources — push (webhook) / pull (watched folder) auto-refresh */}
        <MiningSourcesPanel projectId={projectId} />

        <RunList
          runs={runs}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onDeleteRun={setDeleting}
          onDeleteStudy={setDeletingStudy}
        />

        {selected && (
          <RunDetail
            projectId={projectId}
            run={selected}
            runs={runs}
            isAdmin={isAdmin}
            onSelect={setSelectedId}
            reload={load}
            patchRun={patchRun}
            openDiagram={openDiagram}
            stashReturn={stashReturn}
            onOpenSimulator={onOpenSimulator}
          />
        )}
      </main>

      {deleting && (
        <ConfirmDialog title="Delete mining run" message={`Delete "${deleting.name}"? (Discovered diagrams are kept.)`} destructive
          onConfirm={() => remove(deleting.id)} onCancel={() => setDeleting(null)} />
      )}
      {deletingStudy && (
        <ConfirmDialog title="Delete import" message={`Delete the whole "${deletingStudy.name}" import — all ${deletingStudy.count} object-type run${deletingStudy.count === 1 ? "" : "s"}? (Discovered diagrams are kept.)`} destructive
          onConfirm={() => removeStudy(deletingStudy.groupId)} onCancel={() => setDeletingStudy(null)} />
      )}
    </div>
  );
}
