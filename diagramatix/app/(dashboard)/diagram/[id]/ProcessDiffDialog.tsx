"use client";

import { useEffect, useMemo, useState } from "react";
import type { DiagramData } from "@/app/lib/diagram/types";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { diffProcesses, type DiffStatus } from "@/app/lib/diagram/diff/processDiff";
import { diffToCsv } from "@/app/lib/diagram/diff/processDiffFormat";
import { mergeProcesses, type MergeDecision, type MergeKind } from "@/app/lib/diagram/diff/mergeProcess";

interface Sibling { id: string; name: string }

const STATUS_STYLE: Record<DiffStatus, string> = {
  added: "bg-green-50 text-green-700",
  removed: "bg-red-50 text-red-700",
  changed: "bg-amber-50 text-amber-800",
  unchanged: "text-gray-500",
};
const STATUS_LABEL: Record<DiffStatus, string> = {
  added: "Added", removed: "Removed", changed: "Changed", unchanged: "Same",
};

/** Before/after cell — shows a single value if unchanged, else "a → b". */
function Cell({ a, b, changed }: { a?: string; b?: string; changed: boolean }) {
  const A = a || "—", B = b || "—";
  if (!changed || A === B) return <span className="text-gray-600">{A}</span>;
  return (
    <span>
      <span className="text-gray-400 line-through">{A}</span>
      <span className="text-gray-400"> → </span>
      <span className="text-gray-900 font-medium">{B}</span>
    </span>
  );
}

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

  async function pickProject(pid: string) {
    setProjectId(pid); setOtherId(""); setOtherData(null); setAiSummary(null); setErr(null);
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
    setOtherId(id); setOtherData(null); setAiSummary(null); setErr(null);
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
    } catch (e) { setErr(e instanceof Error ? e.message : "Export failed"); }
    finally { setBusy(null); }
  }

  function exportCsv() {
    if (!diff) return;
    download(`${diff.a.title}-vs-${diff.b.title}.csv`, new Blob([diffToCsv(diff)], { type: "text/csv" }));
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
      setAiSummary(j.summary as string);
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
            <button onClick={() => setSwapped((s) => !s)} className="text-blue-600 hover:text-blue-800 underline"
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
            <>
              {/* Direction + summary */}
              <div className="text-xs text-gray-600 mb-2">
                <span className="font-medium">{diff.a.title}</span> (before) →{" "}
                <span className="font-medium">{diff.b.title}</span> (after)
              </div>
              <div className="flex flex-wrap gap-2 mb-3 text-[11px]">
                <span className="px-2 py-0.5 rounded bg-green-50 text-green-700">{diff.summary.added} added</span>
                <span className="px-2 py-0.5 rounded bg-red-50 text-red-700">{diff.summary.removed} removed</span>
                <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800">{diff.summary.changed} changed</span>
                <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600">{diff.summary.unchanged} unchanged</span>
              </div>
              {(diff.roleDiff.added.length > 0 || diff.roleDiff.removed.length > 0 || diff.systemDiff.added.length > 0 || diff.systemDiff.removed.length > 0) && (
                <div className="text-[11px] text-gray-600 mb-3 space-y-0.5">
                  {(diff.roleDiff.added.length > 0 || diff.roleDiff.removed.length > 0) && (
                    <div><span className="font-medium">Roles:</span>{" "}
                      {diff.roleDiff.added.map((r) => <span key={r} className="text-green-700">+{r} </span>)}
                      {diff.roleDiff.removed.map((r) => <span key={r} className="text-red-600">−{r} </span>)}
                    </div>
                  )}
                  {(diff.systemDiff.added.length > 0 || diff.systemDiff.removed.length > 0) && (
                    <div><span className="font-medium">Systems:</span>{" "}
                      {diff.systemDiff.added.map((r) => <span key={r} className="text-green-700">+{r} </span>)}
                      {diff.systemDiff.removed.map((r) => <span key={r} className="text-red-600">−{r} </span>)}
                    </div>
                  )}
                </div>
              )}

              {/* Table */}
              <div className="overflow-x-auto border border-gray-200 rounded">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600 text-left">
                      {mergeMode && <th className="px-2 py-1.5 font-medium w-8" title="Include this change in the merge">Take</th>}
                      <th className="px-2 py-1.5 font-medium">Activity</th>
                      <th className="px-2 py-1.5 font-medium">Change</th>
                      <th className="px-2 py-1.5 font-medium">Who (role)</th>
                      <th className="px-2 py-1.5 font-medium">Type</th>
                      <th className="px-2 py-1.5 font-medium">Systems</th>
                      <th className="px-2 py-1.5 font-medium">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.rows.map((r, i) => (
                      <tr key={i} className="border-t border-gray-100 align-top">
                        {mergeMode && (
                          <td className="px-2 py-1.5">
                            {r.status !== "unchanged" && (
                              <input type="checkbox" checked={accepted.has(i)} onChange={() => toggleRow(i)}
                                title="Include this change in the merged diagram" />
                            )}
                          </td>
                        )}
                        <td className="px-2 py-1.5 text-gray-900">{r.activity}</td>
                        <td className="px-2 py-1.5"><span className={`px-1.5 py-0.5 rounded ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
                        <td className="px-2 py-1.5"><Cell a={r.who.a} b={r.who.b} changed={r.who.changed} /></td>
                        <td className="px-2 py-1.5"><Cell a={r.taskType.a} b={r.taskType.b} changed={r.taskType.changed} /></td>
                        <td className="px-2 py-1.5"><Cell a={(r.systems.a ?? []).join(", ")} b={(r.systems.b ?? []).join(", ")} changed={r.systems.changed} /></td>
                        <td className="px-2 py-1.5"><Cell a={(r.data.a ?? []).join(", ")} b={(r.data.b ?? []).join(", ")} changed={r.data.changed} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {aiSummary && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded text-[11px] text-gray-800 whitespace-pre-wrap">
                  <div className="font-medium text-blue-800 mb-1">AI summary</div>
                  {aiSummary}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        {diff && (
          <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-200">
            <div className="flex items-center gap-2">
              {!canMerge ? (
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
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={exportCsv} className="text-xs text-gray-700 border border-gray-300 rounded px-3 py-1 hover:bg-gray-50">Export CSV</button>
              <button onClick={exportDocx} disabled={busy === "docx"} className="text-xs text-gray-700 border border-gray-300 rounded px-3 py-1 hover:bg-gray-50 disabled:opacity-50">
                {busy === "docx" ? "Exporting…" : "Export Word"}
              </button>
              <button onClick={generateAi} disabled={busy === "ai"} className="text-xs text-white bg-blue-600 rounded px-3 py-1 hover:bg-blue-700 disabled:opacity-50">
                {busy === "ai" ? "Summarising…" : "AI Summary"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
