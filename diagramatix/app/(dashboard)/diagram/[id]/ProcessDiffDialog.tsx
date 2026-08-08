"use client";

import { useEffect, useMemo, useState } from "react";
import type { DiagramData } from "@/app/lib/diagram/types";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { diffProcesses } from "@/app/lib/diagram/diff/processDiff";
import { diffToCsv } from "@/app/lib/diagram/diff/processDiffFormat";
import { mergeProcesses, type MergeDecision, type MergeKind } from "@/app/lib/diagram/diff/mergeProcess";
import { ProcessDiffResults } from "@/app/components/diff/ProcessDiffResults";

interface Sibling { id: string; name: string }

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Diff Processes — compare the current BPMN diagram with another version and show
 * a tabular difference report (who does what / which systems / what is done).
 * The comparison + CSV are computed client-side; .docx and the AI narrative go
 * through /api/diagrams/diff.
 */
export function ProcessDiffDialog({
  onClose, currentId, currentName, currentData, currentProjectId, siblings, canMerge = false,
}: {
  onClose: () => void;
  currentId: string;
  currentName: string;
  currentData: DiagramData;
  currentProjectId: string | null;
  siblings: Sibling[];
  /** Merge is SuperAdmin-only for now (still being finished). */
  canMerge?: boolean;
}) {
  const [otherId, setOtherId] = useState<string>("");
  const [otherData, setOtherData] = useState<DiagramData | null>(null);
  const [otherName, setOtherName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Direction: false = current is "before" (A); true = swapped.
  const [swapped, setSwapped] = useState(false);
  const [busy, setBusy] = useState<null | "docx" | "ai">(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  // Merge: cherry-pick which changed/added/removed rows to fold into a new diagram.
  const [mergeMode, setMergeMode] = useState(false);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [merging, setMerging] = useState(false);
  const [mergeDone, setMergeDone] = useState<{ id: string } | null>(null);
  // Persisted run for the CURRENT comparison. Created on explicit Save or auto on
  // AI Summary / Export; reset whenever the compared pair or direction changes.
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [savingRun, setSavingRun] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Project scope. Defaults to the current project (its BPMN diagrams arrive as
  // `siblings`). Selecting another project fetches that project's BPMN diagrams.
  const CURRENT = currentProjectId ?? "__current__";
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState<string>(CURRENT);
  const [projectDiagrams, setProjectDiagrams] = useState<Sibling[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  useEffect(() => {
    fetch("/api/projects", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((arr) => setProjects(Array.isArray(arr) ? arr.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })) : []))
      .catch(() => { /* leave just the current project */ });
  }, []);

  // The BPMN diagrams to choose from: `siblings` for the current project, else
  // the picked project's BPMN diagrams (fetched, current diagram excluded).
  const diagramOptions = projectId === CURRENT ? siblings : projectDiagrams;

  // A new comparison invalidates the saved-run handle + saved message.
  function resetRun() { setCurrentRunId(null); setSavedMsg(null); }

  async function pickProject(pid: string) {
    setProjectId(pid); setOtherId(""); setOtherData(null); setAiSummary(null); setErr(null); resetRun();
    if (pid === CURRENT) { setProjectDiagrams([]); return; }
    setLoadingList(true);
    try {
      const res = await fetch(`/api/projects/${pid}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load that project");
      const p = await res.json();
      const diags = (Array.isArray(p.diagrams) ? p.diagrams : [])
        .filter((d: { type: string; id: string }) => d.type === "bpmn" && d.id !== currentId)
        .map((d: { id: string; name: string }) => ({ id: d.id, name: d.name }));
      setProjectDiagrams(diags);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
      setProjectDiagrams([]);
    } finally {
      setLoadingList(false);
    }
  }

  async function pickOther(id: string) {
    setOtherId(id); setOtherData(null); setAiSummary(null); setErr(null); resetRun();
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/diagrams/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load that diagram");
      const d = await res.json();
      setOtherData((d.data ?? { elements: [], connectors: [] }) as DiagramData);
      setOtherName(d.name ?? "Other version");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  const diff = useMemo(() => {
    if (!otherData) return null;
    const A = swapped
      ? { data: otherData, name: otherName }
      : { data: currentData, name: currentName };
    const B = swapped
      ? { data: currentData, name: currentName }
      : { data: otherData, name: otherName };
    return diffProcesses(A.data, A.name, B.data, B.name);
  }, [otherData, swapped, currentData, currentName, otherName]);

  const aId = swapped ? otherId : currentId;
  const bId = swapped ? currentId : otherId;

  /** Ensure a saved run exists for this comparison (create once), returning its
   *  id. `explicit` shows the "Saved" confirmation. Used by Save + auto-save. */
  async function ensureRunSaved(explicit = false): Promise<string | null> {
    if (currentRunId) { if (explicit) setSavedMsg("Saved"); return currentRunId; }
    if (!diff || !otherId) return null;
    setSavingRun(true); setErr(null);
    try {
      const res = await fetch("/api/diagrams/diff/runs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aId, bId, aiSummary: aiSummary ?? undefined }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Save failed");
      setCurrentRunId(j.id); if (explicit) setSavedMsg("Saved");
      return j.id as string;
    } catch (e) { setErr(e instanceof Error ? e.message : "Save failed"); return null; }
    finally { setSavingRun(false); }
  }

  async function exportDocx() {
    setBusy("docx"); setErr(null);
    try {
      const res = await fetch("/api/diagrams/diff", {
        method: "POST", headers: { "Content-Type": "application/json" },
        // Include the AI narrative in the Word report when it's been generated.
        body: JSON.stringify({ aId, bId, mode: "docx", aiSummary: aiSummary ?? undefined }),
      });
      if (!res.ok) throw new Error("Export failed");
      download(`${diff!.a.title}-vs-${diff!.b.title}.docx`, await res.blob());
      void ensureRunSaved(); // auto-save on export
    } catch (e) { setErr(e instanceof Error ? e.message : "Export failed"); }
    finally { setBusy(null); }
  }

  function exportCsv() {
    if (!diff) return;
    download(`${diff.a.title}-vs-${diff.b.title}.csv`, new Blob([diffToCsv(diff)], { type: "text/csv" }));
    void ensureRunSaved(); // auto-save on export
  }

  function toggleRow(i: number) {
    setAccepted((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }
  function selectAllChanges() {
    if (!diff) return;
    const all = new Set<number>();
    diff.rows.forEach((r, i) => { if (r.status !== "unchanged") all.add(i); });
    setAccepted(all);
  }

  async function createMerge() {
    if (!diff || !otherData) return;
    const aData = swapped ? otherData : currentData;
    const bData = swapped ? currentData : otherData;
    const decisions: MergeDecision[] = [];
    diff.rows.forEach((r, i) => {
      if (!accepted.has(i)) return;
      const kind: MergeKind | null =
        r.status === "added" ? "add" : r.status === "removed" ? "remove" : r.status === "changed" ? "change" : null;
      if (kind) decisions.push({ activity: r.activity, kind });
    });
    if (!decisions.length) { setErr("Select at least one change to merge."); return; }
    setMerging(true); setErr(null); setMergeDone(null);
    try {
      const { model } = mergeProcesses(aData, bData, decisions);
      const data = layoutBpmnDiagram(model.elements, model.connections);
      const name = `${diff.a.title} + ${diff.b.title} (merged)`.slice(0, 120);
      const res = await fetch("/api/diagrams", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type: "bpmn", projectId: currentProjectId ?? undefined, data }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Merge failed");
      setMergeDone({ id: j.id });
    } catch (e) { setErr(e instanceof Error ? e.message : "Merge failed"); }
    finally { setMerging(false); }
  }

  async function generateAi() {
    setBusy("ai"); setErr(null); setAiSummary(null);
    try {
      const res = await fetch("/api/diagrams/diff", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aId, bId, mode: "ai" }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Summary failed");
      const summary = j.summary as string;
      setAiSummary(summary);
      // Auto-save on AI: create the run (carrying the summary), or attach the
      // summary to an already-saved run.
      if (currentRunId) {
        void fetch(`/api/diagrams/diff/runs/${currentRunId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aiSummary: summary, aiModel: j.model }),
        });
      } else {
        const res2 = await fetch("/api/diagrams/diff/runs", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aId, bId, aiSummary: summary, aiModel: j.model }),
        });
        if (res2.ok) setCurrentRunId((await res2.json()).id);
      }
    } catch (e) { setErr(e instanceof Error ? e.message : "Summary failed"); }
    finally { setBusy(null); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col" onMouseDown={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Diff Processes</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        {/* Picker */}
        <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-gray-600">Compare</span>
          <span className="font-medium text-gray-900 px-2 py-1 bg-gray-100 rounded">{currentName}</span>
          <span className="text-gray-500">with</span>
          {/* Project scope — defaults to the current project; pick another to
              compare against a BPMN diagram in a different project. */}
          <select
            value={projectId}
            onChange={(e) => pickProject(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            title="Project to pick the other version from"
          >
            <option value={CURRENT}>This project</option>
            {projects.filter((p) => p.id !== currentProjectId).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={otherId}
            onChange={(e) => pickOther(e.target.value)}
            disabled={loadingList}
            className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[14rem] disabled:opacity-50"
          >
            <option value="">{loadingList ? "Loading…" : "Select a BPMN diagram…"}</option>
            {diagramOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {diff && (
            <button onClick={() => { setSwapped((s) => !s); resetRun(); }} className="text-blue-600 hover:text-blue-800 underline"
              title="Swap which version is treated as 'before'">⇄ Swap before/after</button>
          )}
          {!loadingList && diagramOptions.length === 0 && (
            <span className="text-gray-400">No other BPMN diagrams {projectId === CURRENT ? "in this project" : "in that project"}.</span>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-5 py-3">
          {loading && <p className="text-xs text-gray-500">Loading…</p>}
          {err && <p className="text-xs text-red-600 mb-2">{err}</p>}
          {!diff && !loading && <p className="text-xs text-gray-400">Pick a diagram to compare.</p>}

          {diff && (
            <ProcessDiffResults diff={diff} aiSummary={aiSummary}
              merge={{ mergeMode, accepted, onToggleRow: toggleRow }} />
          )}
        </div>

        {/* Footer actions — Cancel always available; the rest once a diff exists. */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-200">
          <div className="flex items-center gap-2">
            {diff && (!canMerge ? (
                <span />
              ) : !mergeMode ? (
                <button onClick={() => { setMergeMode(true); selectAllChanges(); setMergeDone(null); }}
                  className="text-xs text-emerald-700 border border-emerald-300 rounded px-3 py-1 hover:bg-emerald-50"
                  title="Cherry-pick differences into a new merged diagram (SuperAdmin — in progress)">Merge… <span className="text-[9px] text-emerald-500">(beta)</span></button>
              ) : (
                <>
                  <button onClick={createMerge} disabled={merging || accepted.size === 0}
                    className="text-xs text-white bg-emerald-600 rounded px-3 py-1 hover:bg-emerald-700 disabled:opacity-50">
                    {merging ? "Merging…" : `Create Merged Diagram (${accepted.size})`}
                  </button>
                  <button onClick={selectAllChanges} className="text-xs text-gray-600 underline">All</button>
                  <button onClick={() => setAccepted(new Set())} className="text-xs text-gray-600 underline">None</button>
                  <button onClick={() => { setMergeMode(false); setMergeDone(null); }} className="text-xs text-gray-500">Cancel</button>
                  {mergeDone && (
                    <a href={`/diagram/${mergeDone.id}`} className="text-xs text-emerald-700 underline font-medium">Open merged diagram →</a>
                  )}
                </>
              ))}
          </div>
          <div className="flex items-center gap-2">
            {diff && (<>
              {savedMsg && <span className="text-[11px] text-green-600">{savedMsg}</span>}
              <button onClick={() => void ensureRunSaved(true)} disabled={savingRun || !!currentRunId}
                className="text-xs text-gray-700 border border-gray-300 rounded px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
                title="Save this comparison to the diagram's Diff Process Results history">
                {savingRun ? "Saving…" : currentRunId ? "Saved ✓" : "Save run"}
              </button>
              <button onClick={exportCsv} className="text-xs text-gray-700 border border-gray-300 rounded px-3 py-1 hover:bg-gray-50">Export CSV</button>
              <button onClick={exportDocx} disabled={busy === "docx"} className="text-xs text-gray-700 border border-gray-300 rounded px-3 py-1 hover:bg-gray-50 disabled:opacity-50">
                {busy === "docx" ? "Exporting…" : "Export Word"}
              </button>
              <button onClick={generateAi} disabled={busy === "ai"} className="text-xs text-white bg-blue-600 rounded px-3 py-1 hover:bg-blue-700 disabled:opacity-50">
                {busy === "ai" ? "Summarising…" : "AI Summary"}
              </button>
            </>)}
            <button onClick={onClose} className="text-xs text-gray-700 border border-gray-300 rounded px-3 py-1 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
