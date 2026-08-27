"use client";

/**
 * SuperAdmin — Create Project Diagrams from .md.
 *
 * Upload a Value-Chain markdown (the "Process Repository" format), pick one value
 * chain, and Diagramatix creates a new Project and generates every diagram in that
 * chain — driving the normal AI Generate + Auto Layout pipeline per diagram type.
 * Progress streams live (NDJSON) into a per-diagram status table.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type DiagKind = "value-chain" | "context" | "process-context" | "archimate" | "bpmn";
interface ChainDiagram { name: string; type: DiagKind }
interface Chain { code: string; title: string; diagrams: ChainDiagram[] }

type RowStatus = "pending" | "generating" | "done" | "error";
interface Row {
  index: number;
  name: string;
  type: DiagKind;
  status: RowStatus;
  message?: string;
  ms?: number;
  elements?: number;
  connectors?: number;
}

const TYPE_BADGE: Record<DiagKind, { label: string; cls: string }> = {
  "value-chain": { label: "Value Chain", cls: "bg-indigo-100 text-indigo-700" },
  context: { label: "Context", cls: "bg-sky-100 text-sky-700" },
  "process-context": { label: "Process Context", cls: "bg-teal-100 text-teal-700" },
  archimate: { label: "ArchiMate", cls: "bg-amber-100 text-amber-700" },
  bpmn: { label: "BPMN", cls: "bg-purple-100 text-purple-700" },
};

export function MdDiagramsClient() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [md, setMd] = useState<string>("");
  const [chains, setChains] = useState<Chain[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [projectName, setProjectName] = useState<string>("");
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ created: number; failed: number } | null>(null);
  /** The two tidy-up steps that run once the diagrams exist — see `finish()`. */
  const [finishing, setFinishing] = useState<string | null>(null);
  const [finished, setFinished] = useState<{ sorted: boolean; linked: number; probable: number; error?: string } | null>(null);

  const selectedChain = useMemo(() => chains.find((c) => c.code === selected) ?? null, [chains, selected]);
  const doneCount = rows.filter((r) => r.status === "done").length;
  const errorCount = rows.filter((r) => r.status === "error").length;

  const onPick = useCallback(async (file: File) => {
    setError(null); setChains([]); setSelected(""); setRows([]); setProjectId(null); setSummary(null);
    setFileName(file.name);
    if (!file.name.toLowerCase().endsWith(".md")) { setError("Please choose a .md file."); return; }
    const text = await file.text();
    setMd(text);
    setParsing(true);
    try {
      const res = await fetch("/api/admin/md-diagrams/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ md: text }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? "Could not parse the file"); return; }
      const cs: Chain[] = json.chains ?? [];
      setChains(cs);
      const firstReady = cs.find((c) => c.diagrams.length > 0);
      if (firstReady) { setSelected(firstReady.code); setProjectName(firstReady.title); }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not parse the file");
    } finally {
      setParsing(false);
    }
  }, []);

  const chooseChain = useCallback((c: Chain) => {
    if (c.diagrams.length === 0) return;
    setSelected(c.code);
    setProjectName(c.title);
  }, []);

  const run = useCallback(async () => {
    if (!selectedChain || running) return;
    setRunning(true); setError(null); setProjectId(null); setSummary(null);
    // Seed the table so every diagram shows as pending immediately.
    setRows(selectedChain.diagrams.map((d, i) => ({ index: i + 1, name: d.name, type: d.type, status: "pending" as RowStatus })));

    try {
      const res = await fetch("/api/admin/md-diagrams/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ md, chainCode: selectedChain.code, projectName: projectName.trim() || selectedChain.title }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `Run failed (${res.status})`);
        setRunning(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let msg: Record<string, unknown>;
          try { msg = JSON.parse(line); } catch { continue; }
          handleMessage(msg);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }, [selectedChain, running, md, projectName]);

  /**
   * The two things a freshly generated project always needs, done for you.
   *
   * Paul, 2026-08-27. Both were manual steps after every run:
   *   1. Set the project's diagram order to "type", so the eleven BPMN diagrams
   *      of a chain group together instead of interleaving with the four
   *      chain-level ones.
   *   2. Run "Scan Diagrams for Links", which finds a subprocess element whose
   *      label matches another diagram's name and links them — Value Chain and
   *      Process Context down to BPMN, and across the high-level group.
   *
   * ONLY DEFINITE MATCHES ARE APPLIED. The scan also returns fuzzy (edit-distance)
   * candidates; those are reported for review rather than adopted, because an
   * automatic run has nobody watching it and a wrong link is worse than a missing
   * one. Driven from the browser with the user's own session so it reuses exactly
   * the code path the manual button uses.
   */
  async function finish(newProjectId: string) {
    const out = { sorted: false, linked: 0, probable: 0 } as { sorted: boolean; linked: number; probable: number; error?: string };
    try {
      setFinishing("Setting the diagram order to type…");
      const r = await fetch(`/api/projects/${newProjectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagramSort: "type" }),
      });
      out.sorted = r.ok;

      setFinishing("Scanning the diagrams for links…");
      const scan = await fetch(`/api/projects/${newProjectId}/scan-links`);
      if (scan.ok) {
        const j = await scan.json() as {
          definiteCandidates?: { parentDiagramId: string; parentElementId: string; candidateDiagramId: string }[];
          probableCandidates?: unknown[];
        };
        const adds = (j.definiteCandidates ?? []).map((c) => ({
          parentDiagramId: c.parentDiagramId,
          parentElementId: c.parentElementId,
          candidateDiagramId: c.candidateDiagramId,
        }));
        out.probable = (j.probableCandidates ?? []).length;
        if (adds.length > 0) {
          const applied = await fetch(`/api/projects/${newProjectId}/scan-links`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ adds, removes: [] }),
          });
          if (applied.ok) out.linked = adds.length;
        }
      }
    } catch (e) {
      out.error = e instanceof Error ? e.message : String(e);
    } finally {
      setFinishing(null);
      setFinished(out);
    }
  }

  function handleMessage(msg: Record<string, unknown>) {
    const t = msg.t as string;
    if (t === "project") {
      setProjectId((msg.projectId as string) ?? null);
    } else if (t === "diagram") {
      const index = msg.index as number;
      setRows((prev) => prev.map((r) => r.index === index ? {
        ...r,
        status: (msg.status as RowStatus) ?? r.status,
        message: msg.message as string | undefined,
        ms: msg.ms as number | undefined,
        elements: msg.elements as number | undefined,
        connectors: msg.connectors as number | undefined,
      } : r));
    } else if (t === "done") {
      setSummary({ created: (msg.created as number) ?? 0, failed: (msg.failed as number) ?? 0 });
      // Only worth doing if something was actually created.
      const created = (msg.created as number) ?? 0;
      const pid = (msg.projectId as string) ?? null;
      if (created > 0 && pid) void finish(pid);
    } else if (t === "error") {
      setError((msg.message as string) ?? "Run failed");
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Link href="/dashboard/admin" className="text-sm text-gray-500 hover:text-gray-700">← SuperAdmin</Link>
      <h1 className="text-lg font-semibold text-gray-900 mt-2">Create Project Diagrams from .md</h1>
      <p className="text-sm text-gray-600 mt-1">
        Upload a Value-Chain markdown file (the Process Repository format). Pick one value chain and Diagramatix
        creates a new project, then generates every diagram in that chain — Value Chain, Context, Process Context,
        ArchiMate and each BPMN process — using AI Generate + Auto Layout per diagram type.
      </p>

      {/* Step 1 — upload */}
      <div className="mt-6 rounded-lg border border-red-200 bg-red-50/40 p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={running}
            className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
          >
            Choose .md file
          </button>
          <span className="text-sm text-gray-600">{fileName ?? "No file selected"}</span>
          {parsing && <span className="text-sm text-gray-400">Parsing…</span>}
          <input
            ref={fileRef}
            type="file"
            accept=".md,text/markdown"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPick(f); e.target.value = ""; }}
          />
        </div>
      </div>

      {error && <div className="mt-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* Step 2 — pick a value chain */}
      {chains.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-2">Value chains found</h2>
          <div className="space-y-1.5">
            {chains.map((c) => {
              const ready = c.diagrams.length > 0;
              const isSel = c.code === selected;
              return (
                <button
                  key={c.code}
                  onClick={() => chooseChain(c)}
                  disabled={!ready || running}
                  className={`w-full text-left rounded-md border px-3 py-2 text-sm flex items-center justify-between transition
                    ${isSel ? "border-red-400 bg-red-50" : "border-gray-200 hover:bg-gray-50"}
                    ${!ready ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <span className="font-medium text-gray-900">{c.code} — {c.title}</span>
                  <span className={`text-xs ${ready ? "text-gray-500" : "text-gray-400 italic"}`}>
                    {ready ? `${c.diagrams.length} diagram${c.diagrams.length === 1 ? "" : "s"}` : "no prompts yet"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 3 — project name + preview + run */}
      {selectedChain && (
        <div className="mt-6 rounded-lg border border-gray-200 p-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">New project name</label>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            disabled={running}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
          />
          <p className="text-xs text-gray-500 mt-2">
            Will generate <span className="font-semibold text-gray-700">{selectedChain.diagrams.length}</span> diagrams
            into a new project. This makes {selectedChain.diagrams.length} AI calls and can take a few minutes — keep this tab open.
          </p>
          <button
            onClick={() => void run()}
            disabled={running || !projectName.trim()}
            className="mt-3 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
          >
            {running ? "Generating…" : "▶ Create project & generate"}
          </button>
        </div>
      )}

      {/* Step 4 — progress */}
      {rows.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-800">
              Progress — {doneCount}/{rows.length} done{errorCount > 0 ? `, ${errorCount} failed` : ""}
            </h2>
            {projectId && (
              <button
                onClick={() => router.push(`/dashboard/projects/${projectId}`)}
                className="text-xs text-red-700 hover:underline"
              >
                Open project →
              </button>
            )}
          </div>
          <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
            {rows.map((r) => (
              <div key={r.index} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-6 text-right text-gray-400 tabular-nums">{r.index}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${TYPE_BADGE[r.type].cls}`}>{TYPE_BADGE[r.type].label}</span>
                <span className="flex-1 text-gray-800 truncate">{r.name}</span>
                {r.status === "pending" && <span className="text-gray-400">◦ waiting</span>}
                {r.status === "generating" && <span className="text-amber-600 animate-pulse">◴ generating…</span>}
                {r.status === "done" && (
                  <span className="text-green-600" title={`${r.ms ?? 0} ms`}>
                    ✓ {r.elements ?? 0}el / {r.connectors ?? 0}conn
                  </span>
                )}
                {r.status === "error" && <span className="text-red-600 truncate max-w-[45%]" title={r.message}>✗ {r.message}</span>}
              </div>
            ))}
          </div>

          {summary && (
            <div className="mt-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
              Done — created <b>{summary.created}</b> diagram{summary.created === 1 ? "" : "s"}
              {summary.failed > 0 ? <>, <b className="text-red-700">{summary.failed}</b> failed</> : ""}.
              {projectId && (
                <> <button onClick={() => router.push(`/dashboard/projects/${projectId}`)} className="ml-1 font-semibold underline hover:text-green-900">Open the new project →</button></>
              )}
            </div>
          )}

          {finishing && (
            <p className="mt-2 text-xs text-gray-600">{finishing}</p>
          )}
          {finished && (
            <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-700">
              {finished.sorted
                ? <>Diagram order set to <b>type</b>. </>
                : <><span className="text-amber-700">Could not set the diagram order.</span> </>}
              {finished.linked > 0
                ? <>Linked <b>{finished.linked}</b> diagram{finished.linked === 1 ? "" : "s"} by name.</>
                : <>No definite links found.</>}
              {finished.probable > 0 && (
                <> <b>{finished.probable}</b> near-match{finished.probable === 1 ? "" : "es"} left for you —
                  only exact name matches are linked automatically, since nobody is watching this run.
                  Use <i>Scan Diagrams for Links</i> on the project to review them.</>
              )}
              {finished.error && <span className="text-amber-700"> ({finished.error})</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
