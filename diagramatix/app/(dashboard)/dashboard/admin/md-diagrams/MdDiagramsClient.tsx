"use client";

/**
 * SuperAdmin — Create Project Diagrams from .md.
 *
 * Upload a Value-Chain markdown (the "Process Repository" format), pick one value
 * chain, and Diagramatix creates a new Project and generates every diagram in that
 * chain — driving the normal AI Generate + Auto Layout pipeline per diagram type.
 * Progress streams live (NDJSON) into a per-diagram status table.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  /** Anything the layout could not take at face value on this diagram. */
  diagnostics?: { kind: string; label: string; field?: string; detail: string }[];
  /** Set only when the name clashed and the diagram was saved as "… (2)". */
  savedName?: string;
}

/** A diagram's identity within a chain — matches the key the runner filters on. */
const keyOf = (d: ChainDiagram) => `${d.type}::${d.name}`;

interface ProjectOption { id: string; name: string }

/** What the post-run link scan is allowed to touch. */
type LinkScope = "generated" | "all" | "none";

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

  /**
   * Where the chains come from.
   *
   * "library" is the normal path — published chains straight out of the Process
   * Repository, no file handling at all. "upload" stays for a chain not yet
   * imported, and for trying a file against what is live. Both feed the same
   * runner, so nothing downstream differs.
   */
  const [source, setSource] = useState<"library" | "upload">("library");
  const [fileName, setFileName] = useState<string | null>(null);
  const [md, setMd] = useState<string>("");
  const [chains, setChains] = useState<Chain[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [projectName, setProjectName] = useState<string>("");
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Where the diagrams land, and which of them are generated.
   *
   * Paul, 2026-08-29: regenerating one diagram used to mean regenerating the
   * whole chain into a whole new project — fifteen AI calls to look at one
   * layout fix. So: pick the diagrams, and send them to a NEW project or into
   * one that already exists. A name that is already taken there gets " (2)"
   * rather than overwriting, because the reason for regenerating into an
   * existing project is usually to compare the new against the old.
   */
  const [target, setTarget] = useState<"new" | "existing">("new");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [targetProjectId, setTargetProjectId] = useState<string>("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [linkScope, setLinkScope] = useState<LinkScope>("generated");

  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ created: number; failed: number } | null>(null);
  /** The two tidy-up steps that run once the diagrams exist — see `finish()`. */
  const [finishing, setFinishing] = useState<string | null>(null);
  const [finished, setFinished] = useState<{ sorted: boolean; linked: number; probable: number; skipped: number; error?: string } | null>(null);

  const selectedChain = useMemo(() => chains.find((c) => c.code === selected) ?? null, [chains, selected]);

  // The published library. Only PUBLISHED chains appear: a draft is one somebody
  // is still working on, and generating 15 diagrams from a half-regenerated chain
  // is exactly what the draft/published split exists to prevent.
  useEffect(() => {
    if (source !== "library") return;
    let live = true;
    setParsing(true); setError(null); setChains([]); setSelected("");
    void fetch("/api/admin/value-chain-library")
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!live) return;
        if (!r.ok) { setError(j.error ?? "Could not load the library"); return; }
        type LibChain = { code: string; title: string; published: boolean; prompts: { name: string; type: DiagKind }[] };
        const cs: Chain[] = ((j.chains ?? []) as LibChain[])
          .filter((c) => c.published)
          .map((c) => ({ code: c.code, title: c.title, diagrams: c.prompts.map((p) => ({ name: p.name, type: p.type })) }));
        setChains(cs);
        const first = cs.find((c) => c.diagrams.length > 0);
        if (first) { setSelected(first.code); setProjectName(first.title); setPicked(new Set(first.diagrams.map(keyOf))); }
        if (cs.length === 0) setError("No published value chains yet — publish one in the Process Repository first.");
      })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load the library"); })
      .finally(() => { if (live) setParsing(false); });
    return () => { live = false; };
  }, [source]);
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
      if (firstReady) { setSelected(firstReady.code); setProjectName(firstReady.title); setPicked(new Set(firstReady.diagrams.map(keyOf))); }
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
    // Whole chain by default — the original behaviour, one click from a subset.
    setPicked(new Set(c.diagrams.map(keyOf)));
  }, []);

  // Projects to regenerate into. Loaded once, on demand.
  useEffect(() => {
    if (target !== "existing" || projects.length > 0) return;
    let live = true;
    void fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((j: unknown) => {
        if (!live) return;
        const list = Array.isArray(j) ? j : (j as { projects?: unknown[] })?.projects ?? [];
        setProjects(
          (list as { id?: unknown; name?: unknown }[])
            .filter((p): p is ProjectOption => typeof p.id === "string" && typeof p.name === "string")
            .map((p) => ({ id: p.id, name: p.name }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      })
      .catch(() => { if (live) setError("Could not load your projects"); });
    return () => { live = false; };
  }, [target, projects.length]);

  const toggle = useCallback((k: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }, []);

  const run = useCallback(async () => {
    if (!selectedChain || running) return;
    const chosen = selectedChain.diagrams.filter((d) => picked.has(keyOf(d)));
    if (chosen.length === 0) return;
    setRunning(true); setError(null); setProjectId(null); setSummary(null); setFinished(null);
    // Seed the table so every diagram shows as pending immediately.
    setRows(chosen.map((d, i) => ({ index: i + 1, name: d.name, type: d.type, status: "pending" as RowStatus })));

    try {
      const res = await fetch("/api/admin/md-diagrams/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source, md, chainCode: selectedChain.code,
          projectName: projectName.trim() || selectedChain.title,
          ...(target === "existing" ? { projectId: targetProjectId } : {}),
          // Omitted when the whole chain is picked, so a full run is byte-for-byte
          // the request it always was.
          ...(chosen.length < selectedChain.diagrams.length ? { diagramKeys: chosen.map(keyOf) } : {}),
        }),
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
  }, [selectedChain, running, md, projectName, source, picked, target, targetProjectId]);

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
  async function finish(newProjectId: string, createdIds: string[], sortByType: boolean) {
    const out = { sorted: false, linked: 0, probable: 0, skipped: 0 } as
      { sorted: boolean; linked: number; probable: number; skipped: number; error?: string };
    try {
      // Only worth imposing on a project this run created. An existing project
      // has an order somebody chose, and silently changing it is not what
      // "regenerate one diagram" asked for.
      if (sortByType) {
        setFinishing("Setting the diagram order to type…");
        const r = await fetch(`/api/projects/${newProjectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ diagramSort: "type" }),
        });
        out.sorted = r.ok;
      }

      if (linkScope === "none") return;

      setFinishing("Scanning the diagrams for links…");
      const scan = await fetch(`/api/projects/${newProjectId}/scan-links`);
      if (scan.ok) {
        const j = await scan.json() as {
          definiteCandidates?: { parentDiagramId: string; parentElementId: string; candidateDiagramId: string }[];
          probableCandidates?: unknown[];
        };
        const all = j.definiteCandidates ?? [];
        // SELECTIVE RE-LINK. The scan is project-wide by nature, so scoping it
        // means filtering its results: with "generated", a link is applied only
        // if one of its two ends is a diagram this run just created. Otherwise
        // regenerating one diagram would quietly rewire links between diagrams
        // nobody touched.
        const fresh = new Set(createdIds);
        const chosen = linkScope === "generated"
          ? all.filter((c) => fresh.has(c.parentDiagramId) || fresh.has(c.candidateDiagramId))
          : all;
        out.skipped = all.length - chosen.length;
        const adds = chosen.map((c) => ({
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
        diagnostics: msg.diagnostics as Row["diagnostics"],
        savedName: msg.savedName as string | undefined,
      } : r));
    } else if (t === "done") {
      setSummary({ created: (msg.created as number) ?? 0, failed: (msg.failed as number) ?? 0 });
      // Only worth doing if something was actually created.
      const created = (msg.created as number) ?? 0;
      const pid = (msg.projectId as string) ?? null;
      const ids = Array.isArray(msg.createdIds) ? (msg.createdIds as string[]) : [];
      if (created > 0 && pid) void finish(pid, ids, msg.existing !== true);
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

      {/* Step 1 — where the chains come from */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50/60 p-4">
        <div className="flex items-center gap-1.5 mb-2">
          {([["library", "The Process Repository"], ["upload", "A .md file"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => { setSource(k); setRows([]); setProjectId(null); setSummary(null); }}
              disabled={running}
              className={`rounded-md border px-3 py-1.5 text-sm transition disabled:opacity-50
                ${source === k ? "border-red-400 bg-red-50 text-red-800 font-medium" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}>
              {label}
            </button>
          ))}
          {parsing && <span className="ml-2 text-sm text-gray-400">Loading…</span>}
        </div>

        {source === "library" ? (
          <p className="text-xs text-gray-600">
            Published value chains from the{" "}
            <Link href="/dashboard/admin/value-chain-library" className="text-blue-600 underline hover:text-blue-800">
              Process Repository
            </Link>. A chain only appears here once it has been published — a draft is one still being
            worked on, and generating a whole project from a half-regenerated chain is what publishing
            exists to prevent.
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={running}
              className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
            >
              Choose .md file
            </button>
            <span className="text-sm text-gray-600">{fileName ?? "No file selected"}</span>
            <span className="text-xs text-gray-500">for a chain not in the library yet</span>
            <input
              ref={fileRef}
              type="file"
              accept=".md,text/markdown"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPick(f); e.target.value = ""; }}
            />
          </div>
        )}
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

      {/* Step 3 — where it goes, which diagrams, and run */}
      {selectedChain && (
        <div className="mt-6 rounded-lg border border-gray-200 p-4">
          {/* Target project */}
          <div className="flex items-center gap-1.5 mb-3">
            {([["new", "A new project"], ["existing", "An existing project"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTarget(k)} disabled={running}
                className={`rounded-md border px-3 py-1.5 text-sm transition disabled:opacity-50
                  ${target === k ? "border-red-400 bg-red-50 text-red-800 font-medium" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}>
                {label}
              </button>
            ))}
          </div>

          {target === "new" ? (
            <>
              <label className="block text-xs font-medium text-gray-600 mb-1">New project name</label>
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                disabled={running}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
              />
            </>
          ) : (
            <>
              <label className="block text-xs font-medium text-gray-600 mb-1">Regenerate into</label>
              <select
                value={targetProjectId}
                onChange={(e) => setTargetProjectId(e.target.value)}
                disabled={running}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-red-400"
              >
                <option value="">Choose a project…</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <p className="text-xs text-gray-500 mt-1.5">
                A diagram whose name is already there is saved as <i>&ldquo;… (2)&rdquo;</i> — the existing one
                is never overwritten, so you can compare the two.
              </p>
            </>
          )}

          {/* Which diagrams */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-600">
                Diagrams to generate — {picked.size}/{selectedChain.diagrams.length}
              </label>
              <div className="flex gap-2 text-xs">
                <button disabled={running} onClick={() => setPicked(new Set(selectedChain.diagrams.map(keyOf)))}
                  className="text-blue-600 hover:underline disabled:opacity-50">All</button>
                <span className="text-gray-300">|</span>
                <button disabled={running} onClick={() => setPicked(new Set())}
                  className="text-blue-600 hover:underline disabled:opacity-50">None</button>
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto rounded-md border border-gray-200 divide-y divide-gray-100">
              {selectedChain.diagrams.map((d) => {
                const k = keyOf(d);
                return (
                  <label key={k} className="flex items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={picked.has(k)} disabled={running}
                      onChange={() => toggle(k)}
                      className="rounded border-gray-300 text-red-700 focus:ring-red-400" />
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${TYPE_BADGE[d.type].cls}`}>{TYPE_BADGE[d.type].label}</span>
                    <span className="text-gray-800 truncate">{d.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Re-link scope */}
          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Re-link after generating</label>
            <div className="flex flex-wrap items-center gap-1.5">
              {([
                ["generated", "Only what I just generated"],
                ["all", "The whole project"],
                ["none", "Don't re-link"],
              ] as const).map(([k, label]) => (
                <button key={k} onClick={() => setLinkScope(k)} disabled={running}
                  className={`rounded-md border px-2.5 py-1 text-xs transition disabled:opacity-50
                    ${linkScope === k ? "border-red-400 bg-red-50 text-red-800 font-medium" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"}`}>
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1.5">
              Links a subprocess element to the diagram its label names. Only exact name matches are
              applied automatically; near-matches are reported for you to review.
            </p>
          </div>

          <p className="text-xs text-gray-500 mt-4">
            <span className="font-semibold text-gray-700">{picked.size}</span> AI call{picked.size === 1 ? "" : "s"} —
            this can take a few minutes, so keep this tab open.
          </p>
          <button
            onClick={() => void run()}
            disabled={
              running || picked.size === 0 ||
              (target === "new" ? !projectName.trim() : !targetProjectId)
            }
            className="mt-3 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
          >
            {running
              ? "Generating…"
              : target === "new" ? "▶ Create project & generate" : "▶ Generate into this project"}
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
                <span className="flex-1 text-gray-800 truncate">
                  {r.name}
                  {r.savedName && (
                    <span className="ml-1.5 text-xs text-amber-700" title={`A diagram called "${r.name}" was already in this project`}>
                      → saved as &ldquo;{r.savedName}&rdquo;
                    </span>
                  )}
                </span>
                {r.status === "pending" && <span className="text-gray-400">◦ waiting</span>}
                {r.status === "generating" && <span className="text-amber-600 animate-pulse">◴ generating…</span>}
                {r.status === "done" && (
                  <span className="text-green-600" title={`${r.ms ?? 0} ms`}>
                    ✓ {r.elements ?? 0}el / {r.connectors ?? 0}conn
                  </span>
                )}
                {r.status === "error" && <span className="text-red-600 truncate max-w-[45%]" title={r.message}>✗ {r.message}</span>}
                {/* Anything the layout could not take at face value. A diagram
                    used to come back "✓ 39el / 46conn" with three activities
                    stranded outside every pool and an empty subprocess. */}
                {!!r.diagnostics?.length && (
                  <span className="text-amber-700 shrink-0"
                    title={r.diagnostics.map((d) => `${d.kind}: ${d.label}${d.field ? ` .${d.field}` : ""} — ${d.detail}`).join("\n")}>
                    ⚠ {r.diagnostics.length}
                  </span>
                )}
              </div>
            ))}
          </div>

          {rows.some((r) => r.diagnostics?.length) && (
            <details className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <summary className="cursor-pointer font-medium">
                {rows.reduce((t, r) => t + (r.diagnostics?.length ?? 0), 0)} thing(s) the layout could not take at face value
              </summary>
              <ul className="mt-2 space-y-1">
                {rows.flatMap((r) => (r.diagnostics ?? []).map((d, k) => (
                  <li key={`${r.index}-${k}`}>
                    <span className="font-medium">{r.name}</span> — <span className="uppercase text-[10px]">{d.kind}</span>{" "}
                    {d.label && <span className="italic">&ldquo;{d.label}&rdquo;</span>}
                    {d.field && <span className="text-amber-700">.{d.field}</span>} — {d.detail}
                  </li>
                )))}
              </ul>
              <p className="mt-2 text-[11px] text-amber-800">
                These do not fail the run — the diagram was still generated and saved. They are
                the difference between a diagram that is wrong and one you know is wrong.
              </p>
            </details>
          )}

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
              {finished.sorted && <>Diagram order set to <b>type</b>. </>}
              {linkScope === "none"
                ? <>Re-linking skipped.</>
                : finished.linked > 0
                  ? <>Linked <b>{finished.linked}</b> diagram{finished.linked === 1 ? "" : "s"} by name.</>
                  : <>No definite links found.</>}
              {finished.skipped > 0 && (
                <> <b>{finished.skipped}</b> other definite link{finished.skipped === 1 ? " was" : "s were"} left
                  alone — they are between diagrams this run did not touch.</>
              )}
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
