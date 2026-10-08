"use client";

/**
 * Create Project from Process Repository — the USER-facing counterpart of the SuperAdmin "Create Project Diagrams from .md" (Paul, 2026-10-08).
 *
 * Pick a value chain, tick the diagrams you want, answer up to ten short questions about how the processes should be drawn, and a project is
 * created and the diagrams generated into it. No `.md` upload and no "only what I just generated" option — those stay with SuperAdmin.
 *
 * What a person may pick comes from their Process Repository feature (Restricted: Order to Cash only; Complete: every chain): the server marks each
 * diagram allowed or not and the server enforces it again when it runs, so the dialog's tick boxes are a convenience, not the control. Every
 * diagram generated is one AI attempt against the person's limit.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RefineQuestionsDialog } from "@/app/components/RefineQuestionsDialog";
import type { RefineQuestion } from "@/app/lib/ai/refineQuestions";

interface RepoDiagram { key: string; name: string; type: string; processCode: string; allowed: boolean; reason: string | null }
interface RepoChain { code: string; title: string; group: string; diagrams: RepoDiagram[]; available: number }
interface Listing { mode: "complete" | "restricted" | "none"; levelId: string | null; chains: RepoChain[] }
type RowStatus = "pending" | "generating" | "done" | "error";
interface Row { name: string; type: string; status: RowStatus; message?: string }

const TYPE_LABEL: Record<string, string> = {
  "value-chain": "Value Chain", context: "Context", "process-context": "Process Context", archimate: "ArchiMate", bpmn: "BPMN",
};

export function CreateFromRepositoryDialog({ onClose, currentProjectId }: { onClose: () => void; currentProjectId?: string }) {
  const router = useRouter();
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [nameDirty, setNameDirty] = useState(false);
  const [target, setTarget] = useState<"new" | "existing">("new");
  const [asking, setAsking] = useState(false);
  const [questions, setQuestions] = useState<RefineQuestion[] | null>(null);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/repository/chains")
      .then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) }))
      .then(({ ok, j }) => {
        if (!live) return;
        if (!ok) { setError(j.error ?? "The Process Repository is not available."); return; }
        setListing(j as Listing);
        const first = (j as Listing).chains.find((c) => c.available > 0) ?? (j as Listing).chains[0];
        if (first) selectChain(first, j as Listing);
      })
      .catch(() => { if (live) setError("Could not load the Process Repository."); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectChain(c: RepoChain, l: Listing | null = listing) {
    setCode(c.code);
    // Everything the person may have is ticked to start with; they untick what they do not want.
    setPicked(new Set(c.diagrams.filter((d) => d.allowed).map((d) => d.key)));
    if (!nameDirty) setName(c.title);
    void l;
  }

  const chain = useMemo(() => listing?.chains.find((c) => c.code === code) ?? null, [listing, code]);
  const chosen = useMemo(() => (chain?.diagrams ?? []).filter((d) => d.allowed && picked.has(d.key)), [chain, picked]);

  const toggle = (k: string) => setPicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  /** The two tidy-up steps once the diagrams exist: order a NEW project by type, and apply the definite subprocess links. */
  const finish = useCallback(async (pid: string, createdIds: string[], sortByType: boolean) => {
    try {
      if (sortByType) {
        await fetch(`/api/projects/${pid}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ diagramSort: "type" }) });
      }
      const scan = await fetch(`/api/projects/${pid}/scan-links`);
      if (!scan.ok) return;
      const j = await scan.json() as { definiteCandidates?: { parentDiagramId: string; parentElementId: string; candidateDiagramId: string }[] };
      const fresh = new Set(createdIds);
      const adds = (j.definiteCandidates ?? [])
        .filter((c) => fresh.has(c.parentDiagramId) || fresh.has(c.candidateDiagramId))
        .map((c) => ({ parentDiagramId: c.parentDiagramId, parentElementId: c.parentElementId, candidateDiagramId: c.candidateDiagramId }));
      if (adds.length > 0) {
        await fetch(`/api/projects/${pid}/scan-links`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adds, removes: [] }) });
      }
    } catch { /* tidy-up is best-effort: the diagrams exist either way */ }
  }, []);

  const run = useCallback(async (answers?: { label: string; answer: string }[]) => {
    if (!chain || chosen.length === 0) return;
    setRunning(true); setError(null); setDone(false); setNote(null); setProjectId(null);
    setRows(chosen.map((d) => ({ name: d.name, type: d.type, status: "pending" as RowStatus })));
    const createdIds: string[] = [];
    let pid: string | null = null;
    try {
      const res = await fetch("/api/repository/create-project", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "library", chainCode: chain.code, projectName: name.trim() || chain.title,
          ...(target === "existing" && currentProjectId ? { projectId: currentProjectId } : {}),
          ...(chosen.length < chain.diagrams.length ? { diagramKeys: chosen.map((d) => d.key) } : {}),
          ...(answers && answers.length > 0 ? { answers } : {}),
        }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setError(j.message ?? j.error ?? `The run failed (${res.status})`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line) continue;
          let m: Record<string, unknown>;
          try { m = JSON.parse(line); } catch { continue; }
          if (m.t === "project") { pid = String(m.projectId); setProjectId(pid); }
          else if (m.t === "diagram") {
            const nm = String(m.name);
            setRows((r) => r.map((x) => x.name === nm ? { ...x, status: m.status as RowStatus, message: (m.message as string | undefined) ?? x.message } : x));
            if (m.status === "done" && m.diagramId) createdIds.push(String(m.diagramId));
          } else if (m.t === "halted") setNote(String(m.message ?? "The run stopped."));
          else if (m.t === "error") setError(String(m.message ?? "The run failed."));
        }
      }
      if (pid && createdIds.length > 0) await finish(pid, createdIds, target === "new" || !currentProjectId);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The run failed.");
    } finally { setRunning(false); }
  }, [chain, chosen, name, target, currentProjectId, finish]);

  /** Create: ask the questions first (the same engine as the SuperAdmin tools), then run. Skipping every question runs with the stored prompts. */
  const start = useCallback(async () => {
    if (!chain || chosen.length === 0 || running || asking) return;
    const bpmn = chosen.filter((d) => d.type === "bpmn");
    if (bpmn.length === 0) { void run(); return; }
    setAsking(true); setError(null);
    try {
      const res = await fetch("/api/repository/questions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: chain.code, processCode: bpmn.length === 1 ? bpmn[0].processCode : undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(j.questions)) { setError(j.error ?? "Could not prepare the questions"); return; }
      if (j.questions.length === 0) { void run(); return; }
      setQuestions(j.questions as RefineQuestion[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not prepare the questions");
    } finally { setAsking(false); }
  }, [chain, chosen, running, asking, run]);

  const busy = running || asking;
  const modeNote = listing?.mode === "restricted"
    ? "Your subscription includes the Order to Cash value chain (V01)" + (listing.levelId === "free" ? ": its Value Chain diagram and processes V01.01 and V01.02." : ".") + " Everything else is shown but disabled."
    : listing?.mode === "complete" ? "Every value chain is available." : null;

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50" onClick={busy ? undefined : onClose}>
      {questions && (
        <RefineQuestionsDialog
          questions={questions}
          onCancel={() => setQuestions(null)}
          onSubmit={(answers) => { setQuestions(null); void run(answers); }}
        />
      )}
      <div
        className="bg-white rounded-lg shadow-xl border border-gray-200 w-[660px] max-w-[94vw] max-h-[88vh] flex flex-col"
        role="dialog" aria-modal="true" aria-labelledby="repo-create-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 pb-3 border-b border-gray-100 shrink-0">
          <h2 id="repo-create-title" className="text-lg font-semibold text-gray-900">Create Project from Process Repository</h2>
          <p className="text-xs text-gray-500 mt-1">
            Pick a value chain and the diagrams you want. Diagramatix creates the project and generates each diagram from the Repository&apos;s prompts.
            Each diagram generated counts as one AI attempt.
          </p>
          {modeNote && <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-2 py-1 mt-2">{modeNote}</p>}
        </div>

        <div className="p-5 overflow-y-auto min-h-0 flex-1">
          {!listing && !error && <p className="text-sm text-gray-500">Loading the Process Repository…</p>}
          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5 mb-3" role="alert">{error}</p>}

          {listing && (
            <>
              <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1" htmlFor="repo-chain">Value chain</label>
              <select
                id="repo-chain" value={code} disabled={busy}
                onChange={(e) => { const c = listing.chains.find((x) => x.code === e.target.value); if (c) selectChain(c); }}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 mb-3 bg-white text-gray-800"
              >
                {listing.chains.map((c) => (
                  <option key={c.code} value={c.code} disabled={c.available === 0}>
                    {c.code} — {c.title}{c.available === 0 ? "  (not in your subscription)" : ""}
                  </option>
                ))}
              </select>

              <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1" htmlFor="repo-name">Project name</label>
              <input
                id="repo-name" value={name} disabled={busy}
                onChange={(e) => { setName(e.target.value); setNameDirty(true); }}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 mb-3 bg-white text-gray-800"
              />

              {currentProjectId && (
                <div className="flex items-center gap-4 mb-3 text-xs text-gray-700">
                  <label className="flex items-center gap-1"><input type="radio" checked={target === "new"} disabled={busy} onChange={() => setTarget("new")} /> A new project</label>
                  <label className="flex items-center gap-1"><input type="radio" checked={target === "existing"} disabled={busy} onChange={() => setTarget("existing")} /> This project</label>
                </div>
              )}

              {chain && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase tracking-wide text-gray-400">Diagrams ({chosen.length} of {chain.available} available ticked)</span>
                    <span className="text-[11px]">
                      <button type="button" disabled={busy} className="text-blue-600 hover:underline mr-3"
                        onClick={() => setPicked(new Set(chain.diagrams.filter((d) => d.allowed).map((d) => d.key)))}>Select all available</button>
                      <button type="button" disabled={busy} className="text-blue-600 hover:underline" onClick={() => setPicked(new Set())}>None</button>
                    </span>
                  </div>
                  <ul className="border border-gray-200 rounded divide-y divide-gray-100">
                    {chain.diagrams.map((d) => (
                      <li key={d.key} className={`flex items-center gap-2 px-2 py-1 text-xs ${d.allowed ? "text-gray-800" : "text-gray-400 bg-gray-50"}`}>
                        <input type="checkbox" checked={d.allowed && picked.has(d.key)} disabled={!d.allowed || busy} onChange={() => toggle(d.key)} aria-label={d.name} />
                        <span className="flex-1 truncate" title={d.name}>{d.name}</span>
                        <span className="text-[10px] text-gray-400 shrink-0">{TYPE_LABEL[d.type] ?? d.type}</span>
                        {!d.allowed && <span className="text-[10px] text-amber-700 shrink-0">{d.reason}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {rows.length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Progress</p>
              <ul className="border border-gray-200 rounded divide-y divide-gray-100 text-xs">
                {rows.map((r) => (
                  <li key={r.name} className="flex items-center gap-2 px-2 py-1">
                    <span className="w-4 shrink-0">{r.status === "done" ? "✓" : r.status === "error" ? "✗" : r.status === "generating" ? "…" : "·"}</span>
                    <span className="flex-1 truncate" title={r.name}>{r.name}</span>
                    {r.message && <span className={`text-[10px] truncate max-w-[220px] ${r.status === "error" ? "text-red-700" : "text-gray-500"}`} title={r.message}>{r.message}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {note && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-2">{note}</p>}
        </div>

        <div className="p-4 border-t border-gray-100 flex items-center justify-end gap-2 shrink-0">
          {done && projectId && (
            <button type="button" onClick={() => { router.push(`/dashboard/projects/${projectId}`); onClose(); }}
              className="px-3 py-1.5 text-sm rounded-md bg-green-600 text-white hover:bg-green-700">Open the project</button>
          )}
          <button type="button" onClick={onClose} disabled={busy}
            className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">{done ? "Close" : "Cancel"}</button>
          {!done && (
            <button type="button" onClick={() => { void start(); }} disabled={busy || chosen.length === 0 || !listing}
              className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {asking ? "Preparing questions…" : running ? "Creating…" : `Create ${chosen.length} diagram${chosen.length === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
