"use client";

import { useEffect, useState } from "react";
import { childrenInSubtree, orderDeepestFirst, folderCode, folderCodeStrip, type BulkFolder } from "@/app/lib/pcf/bulkFolders";

interface Framework { id: string; name: string; variant: string; version: string; kind: string; division: string | null }
interface Hit { id: string; pcfId: number; hierarchyId: string; name: string; level: number }

const LEVEL = ["", "Category", "Process Group", "Process", "Activity", "Task"];

/**
 * Create APQC Process — pick an APQC PCF process (framework defaults to
 * Cross-Industry; the search pre-fills from the target folder name), then in one
 * click: AI-generate a BPMN model grounded on that standard process, tag the new
 * diagram with the PCF classification, and open it. Orchestrated over existing
 * endpoints (generate-bpmn → /api/diagrams).
 */
export interface CreatedPcf {
  frameworkId: string; frameworkName?: string; variant?: string; version?: string;
  rootHierarchyId?: string; rootName?: string;
}

export interface BulkContext {
  rootFolder: { id: string; name: string };
  subtree: BulkFolder[];
  /** folderId → an existing diagram id already in that folder (conflict). */
  existingByFolder?: Record<string, string>;
}

/** Hard cap on how many diagrams any one generation request may produce. */
export const MAX_BULK_DIAGRAMS = 50;

export function PcfCreateProcessDialog({ projectId, defaultQuery, defaultFrameworkId, isAdmin, bulk, onClose, onCreated, onBulkCreated }: {
  projectId: string; defaultQuery?: string; defaultFrameworkId?: string;
  isAdmin?: boolean; bulk?: BulkContext;
  onClose: () => void;
  onCreated: (diagramId: string, pcf: CreatedPcf) => void;
  onBulkCreated?: (assign: Record<string, string>, rootDiagramId: string | null, pcf: CreatedPcf) => void;
}) {
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [fw, setFw] = useState("");
  const [q, setQ] = useState(defaultQuery ?? "");
  const [hits, setHits] = useState<Hit[]>([]);
  const [picked, setPicked] = useState<Hit | null>(null);
  const [numbering, setNumbering] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  // Existing-diagram conflict: pause the bulk loop and ask Skip/Replace.
  const [conflict, setConflict] = useState<{ folderName: string; resolve: (a: "skip" | "replace", all: boolean) => void } | null>(null);
  const [conflictAll, setConflictAll] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/pcf`).then((r) => r.json()).then((j) => {
      const fws: Framework[] = j.frameworks ?? [];
      setFrameworks(fws);
      // Default to the project's own APQC framework (item #4) when it has one,
      // else Cross-Industry.
      const preferred = defaultFrameworkId && fws.some((f) => f.id === defaultFrameworkId) ? defaultFrameworkId : undefined;
      const xi = fws.find((f) => f.variant === "Cross-Industry" && f.kind === "reference");
      setFw((p) => p || preferred || xi?.id || fws[0]?.id || "");
    }).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    if (!fw) return;
    const t = setTimeout(() => {
      fetch(`/api/projects/${projectId}/pcf/search?framework=${fw}&q=${encodeURIComponent(q)}`)
        .then((r) => r.json()).then((j) => setHits(j.nodes ?? [])).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q, fw, projectId]);

  // Prefix a task/subprocess element's label with a sequential APQC sub-code
  // (e.g. "1.1.1.1", "1.1.1.2") derived from the chosen node's code. Used for
  // the AI (leaf) path — the decompose path already carries authoritative codes.
  function applyNumbering(diagramData: { elements?: { type: string; label?: string; properties?: Record<string, unknown> }[] }, rootCode: string) {
    let n = 0;
    for (const el of diagramData.elements ?? []) {
      if (el.type === "task" || el.type === "subprocess" || el.type === "subprocess-expanded") {
        n += 1;
        const code = `${rootCode}.${n}`;
        if (!(el.label ?? "").startsWith(code)) el.label = `${code} ${el.label ?? ""}`.trim();
        // Stamp element-level APQC attributes so the Properties Panel shows them.
        el.properties = { ...(el.properties ?? {}), pcfHierarchyId: code };
      }
    }
  }

  async function create() {
    if (!picked || !fw) return;
    const f = frameworks.find((x) => x.id === fw);
    const variant = f?.variant ?? "";
    setBusy(true); setErr(null);
    try {
      // R8.APQC / item #6: a node ABOVE Task level decomposes into Collapsed
      // Subprocesses (deterministic). A Task-level leaf falls back to AI detail.
      setStatus("Building the process from APQC…");
      const dec = await fetch(`/api/projects/${projectId}/pcf/decompose`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frameworkId: fw, nodeId: picked.id, numbering }),
      });
      const dj = await dec.json().catch(() => ({}));

      let diagramData: { elements?: unknown[] } | undefined;
      let generated: "decompose" | "ai" = "decompose";

      if (dec.ok && dj.diagramData?.elements) {
        diagramData = dj.diagramData;
      } else {
        // Leaf / no children → AI-generate a detailed task-level model.
        generated = "ai";
        setStatus("Generating the process with AI (15–30s)…");
        const gen = await fetch("/api/ai/generate-bpmn", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: `Generate a BPMN process model for the standard process "${picked.hierarchyId} ${picked.name}".`, pcfNodeId: picked.id }),
        });
        const gj = await gen.json().catch(() => ({}));
        if (!gen.ok || !gj.diagramData?.elements) { setErr(gj.error ?? "AI generation failed"); return; }
        diagramData = gj.diagramData;
        if (numbering) applyNumbering(diagramData as never, picked.hierarchyId);
      }

      const data = {
        ...diagramData,
        pcf: {
          nodeId: picked.id, pcfId: picked.pcfId, hierarchyId: picked.hierarchyId, name: picked.name,
          frameworkId: fw, variant, frameworkName: f?.name, version: f?.version,
          level: picked.level, numbered: numbering, generated,
        },
      };
      setStatus("Saving the diagram…");
      const cr = await fetch("/api/diagrams", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${picked.hierarchyId} ${picked.name}`, type: "bpmn", projectId, data }),
      });
      const cj = await cr.json().catch(() => ({}));
      if (!cr.ok || !cj.id) { setErr(cj.error ?? "Failed to create the diagram"); return; }
      onCreated(cj.id, {
        frameworkId: fw, frameworkName: f?.name, variant, version: f?.version,
        rootHierarchyId: picked.hierarchyId, rootName: picked.name,
      });
    } catch { setErr("Failed"); }
    finally { setBusy(false); setStatus(null); }
  }

  // SuperAdmin bulk: generate one diagram per folder in the selected subtree.
  // Structure is driven STRICTLY by the project's folders (not the full APQC
  // framework): a folder with child folders decomposes into a Collapsed
  // Subprocess per child (deterministic, no AI) with each subprocess pre-linked
  // to the child's diagram; a leaf folder is AI-generated grounded on its APQC
  // node. Processed deepest-first so children exist before their parent links.
  async function createBulk() {
    if (!bulk || !fw) { setErr("Choose a framework first."); return; }
    const f = frameworks.find((x) => x.id === fw);
    const variant = f?.variant ?? "";
    const subtree = bulk.subtree;
    setBusy(true); setErr(null);
    const assign: Record<string, string> = {};
    const createdByFolder: Record<string, string> = {};
    try {
      // Resolve every folder's APQC node once (for classification + grounding).
      const codes = [...new Set(subtree.map((s) => folderCode(s.name)).filter(Boolean))];
      const nodeByCode: Record<string, { nodeId: string; pcfId: number; name: string; level: number; description?: string | null }> =
        (await fetch(`/api/projects/${projectId}/pcf/resolve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ frameworkId: fw, codes }) }).then((r) => r.json()).catch(() => ({ nodes: {} }))).nodes ?? {};

      // Hard cap: never generate more than MAX_BULK_DIAGRAMS in one request.
      const ordered = orderDeepestFirst(subtree).slice(0, MAX_BULK_DIAGRAMS); // children before their parents
      const existingByFolder = bulk.existingByFolder ?? {};
      let applyToAll: "skip" | "replace" | null = null;

      for (let i = 0; i < ordered.length; i++) {
        const folder = ordered[i];
        setBulkProgress({ current: i + 1, total: ordered.length, label: folder.name });
        const code = folderCode(folder.name);
        const node = code ? nodeByCode[code] : undefined;
        const kids = childrenInSubtree(subtree, folder.id);
        const existingId = existingByFolder[folder.id];

        // Conflict: a diagram already exists in this folder → ask Skip / Replace.
        if (existingId) {
          let action: "skip" | "replace";
          if (applyToAll) action = applyToAll;
          else {
            const choice = await new Promise<{ action: "skip" | "replace"; all: boolean }>((resolve) =>
              setConflict({ folderName: folder.name, resolve: (a, all) => resolve({ action: a, all }) }));
            setConflict(null); setConflictAll(false);
            if (choice.all) applyToAll = choice.action;
            action = choice.action;
          }
          if (action === "skip") { createdByFolder[folder.id] = existingId; continue; } // link parents to the existing diagram
        }

        let diagramData: { elements?: unknown[] } | undefined;
        let generated: "decompose" | "ai" = "decompose";
        if (kids.length > 0) {
          const children = kids.map((cf) => { const cc = folderCode(cf.name); return { name: nodeByCode[cc]?.name ?? folderCodeStrip(cf.name), code: cc, pcfId: nodeByCode[cc]?.pcfId, linkedDiagramId: createdByFolder[cf.id] }; });
          const dec = await fetch(`/api/projects/${projectId}/pcf/decompose-folder`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ children, numbering, description: node?.description ?? "" }) });
          const dj = await dec.json().catch(() => ({}));
          if (!dec.ok || !dj.diagramData?.elements) { setErr(dj.error ?? "Decomposition failed"); break; }
          diagramData = dj.diagramData;
        } else {
          generated = "ai";
          const gen = await fetch("/api/ai/generate-bpmn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: `Generate a BPMN process model for the standard process "${folder.name}".`, pcfNodeId: node?.nodeId }) });
          const gj = await gen.json().catch(() => ({}));
          if (!gen.ok || !gj.diagramData?.elements) { setErr(gj.error ?? "AI generation failed"); break; }
          diagramData = gj.diagramData;
          if (numbering && code) applyNumbering(diagramData as never, code);
        }

        const data = { ...diagramData, pcf: { nodeId: node?.nodeId, pcfId: node?.pcfId, hierarchyId: code, name: node?.name ?? folder.name, frameworkId: fw, variant, frameworkName: f?.name, version: f?.version, level: node?.level, numbered: numbering, generated } };
        if (existingId) {
          // Replace: overwrite the existing diagram's content AND name in place
          // (keeps its id/folder, so links pointing at it stay valid).
          const up = await fetch(`/api/diagrams/${existingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data, name: folder.name }) });
          if (!up.ok) { setErr("Failed to replace a diagram"); break; }
          createdByFolder[folder.id] = existingId;
        } else {
          const cr = await fetch("/api/diagrams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: folder.name, type: "bpmn", projectId, data }) });
          const cj = await cr.json().catch(() => ({}));
          if (!cr.ok || !cj.id) { setErr(cj.error ?? "Failed to create a diagram"); break; }
          createdByFolder[folder.id] = cj.id;
          assign[cj.id] = folder.id;
        }
      }
    } catch { setErr("Bulk generation failed"); }
    finally {
      setBusy(false); setBulkProgress(null); setConflict(null); setConflictAll(false);
      // Hand back whatever was created so folders are assigned + links normalised.
      onBulkCreated?.(assign, createdByFolder[bulk.rootFolder.id] ?? null, { frameworkId: fw, frameworkName: f?.name, variant, rootName: bulk.rootFolder.name });
    }
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50" onClick={busy ? undefined : onClose}>
      <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 p-5 w-[440px]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Create APQC Process</h2>
        <p className="text-xs text-gray-500 mb-4">Pick a standard APQC process — we&rsquo;ll AI-generate a BPMN model for it, tag the diagram with the APQC reference, and open it.</p>

        <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">Framework</label>
        <select value={fw} onChange={(e) => setFw(e.target.value)} className="w-full text-xs border border-gray-300 rounded px-2 py-1 mb-3 bg-white text-gray-800">
          <optgroup label="APQC reference">
            {frameworks.filter((f) => f.kind === "reference").map((f) => <option key={f.id} value={f.id}>{f.variant} v{f.version}</option>)}
          </optgroup>
          {frameworks.some((f) => f.kind === "tailored") && (
            <optgroup label="Tailored">
              {frameworks.filter((f) => f.kind === "tailored").map((f) => <option key={f.id} value={f.id}>{f.name}{f.division ? ` · ${f.division}` : ""}</option>)}
            </optgroup>
          )}
        </select>

        <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">Process</label>
        <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setPicked(null); }} placeholder="Search APQC process / code…" className="w-full text-xs border border-gray-300 rounded px-2 py-1 mb-1 bg-white text-gray-800" />
        <div className="max-h-44 overflow-y-auto border border-gray-100 rounded mb-3">
          {hits.length === 0 ? <p className="text-[11px] text-gray-400 px-2 py-2">Type to search…</p> : hits.map((n) => (
            <button key={n.id} onClick={() => setPicked(n)} className={`w-full text-left px-2 py-1 text-[11px] flex items-baseline gap-1.5 ${picked?.id === n.id ? "bg-blue-100" : "hover:bg-blue-50"}`}>
              <span className="font-mono text-gray-600 shrink-0">{n.hierarchyId}</span>
              <span className="flex-1 text-gray-900">{n.name}</span>
              <span className="text-[8px] text-gray-500 shrink-0">{LEVEL[n.level]}</span>
            </button>
          ))}
        </div>

        <label className="flex items-start gap-2 mb-2 cursor-pointer">
          <input type="checkbox" checked={numbering} onChange={(e) => setNumbering(e.target.checked)} className="mt-0.5" />
          <span className="text-[11px] text-gray-700">
            <span className="font-medium">APQC numbering</span> — prefix each task / subprocess label with its APQC code.
          </span>
        </label>
        {picked && (
          <p className="text-[10px] text-gray-500 mb-2">
            {picked.level >= 5
              ? "Task-level process → AI generates a detailed model."
              : "Above Task level → each child activity becomes a Collapsed Subprocess."}
          </p>
        )}

        {status && <p className="text-[11px] text-blue-700 mb-2 flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />{status}</p>}
        {err && <p className="text-[11px] text-red-600 mb-2">{err}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button onClick={create} disabled={busy || !picked} className="px-3 py-1 text-xs text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">
            {busy ? "Working…" : "Create process"}
          </button>
        </div>

        {isAdmin && bulk && bulk.subtree.length > 1 && (() => {
          const total = bulk.subtree.length;
          const overLimit = total > MAX_BULK_DIAGRAMS;
          const existingCount = bulk.subtree.filter((s) => bulk.existingByFolder?.[s.id]).length;
          return (
          <div className="mt-4 pt-3 border-t border-gray-200">
            <p className="text-[11px] text-gray-700 mb-1">
              <span className="font-medium">Bulk generate</span> <span className="text-[9px] uppercase tracking-wide text-red-600">SuperAdmin</span> — one diagram per folder in <span className="font-mono text-gray-600">{bulk.rootFolder.name}</span> and its {total - 1} descendant folder{total - 1 === 1 ? "" : "s"}.
            </p>
            <p className="text-[10px] text-gray-500 mb-2">
              <span className="font-medium text-gray-700">{total} diagrams</span> will be generated, strictly from the project&rsquo;s seeded folders (not the full framework). Non-leaf folders decompose into linked sub-processes; leaf folders are AI-generated. Child diagrams are auto-linked to their parent sub-processes.
            </p>
            {existingCount > 0 && !overLimit && (
              <p className="text-[10px] text-amber-700 mb-2">{existingCount} folder{existingCount === 1 ? "" : "s"} already contain a diagram — you&rsquo;ll be asked to Skip or Replace each.</p>
            )}
            {overLimit && (
              <p className="text-[11px] text-red-600 mb-2">This subtree has {total} folders, over the {MAX_BULK_DIAGRAMS}-diagram limit per request. Select a smaller folder.</p>
            )}
            <div className="flex justify-end">
              <button onClick={createBulk} disabled={busy || !fw || overLimit} className="px-3 py-1 text-xs text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50">
                Create processes ({total})
              </button>
            </div>
          </div>
          );
        })()}

        {bulkProgress && (
          <div className="absolute inset-0 bg-white/95 rounded-lg flex flex-col items-center justify-center p-6 z-10">
            <p className="text-sm font-medium text-gray-800 mb-3">Generating diagrams…</p>
            <div className="w-full max-w-xs h-2 bg-gray-100 rounded overflow-hidden mb-2">
              <div className="h-full bg-red-500 transition-all" style={{ width: `${Math.round((bulkProgress.current / bulkProgress.total) * 100)}%` }} />
            </div>
            <p className="text-[11px] text-gray-500 tabular-nums">{bulkProgress.current} of {bulkProgress.total}</p>
            <p className="text-[10px] text-gray-400 mt-1 max-w-xs truncate" title={bulkProgress.label}>{bulkProgress.label}</p>
          </div>
        )}

        {conflict && (
          <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center p-4 z-20">
            <div className="bg-white rounded-lg border border-gray-200 shadow-xl p-4 w-[340px]">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Diagram already exists</h3>
              <p className="text-[11px] text-gray-600 mb-3">
                <span className="font-mono text-gray-700">{conflict.folderName}</span> already contains a diagram. Skip it (keep the existing one) or replace its contents?
              </p>
              <label className="flex items-center gap-2 mb-3 text-[11px] text-gray-700 cursor-pointer">
                <input type="checkbox" checked={conflictAll} onChange={(e) => setConflictAll(e.target.checked)} />
                Do this for all subsequent diagrams
              </label>
              <div className="flex justify-end gap-2">
                <button onClick={() => conflict.resolve("skip", conflictAll)} className="px-3 py-1 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50">Skip</button>
                <button onClick={() => conflict.resolve("replace", conflictAll)} className="px-3 py-1 text-xs text-white bg-red-600 rounded hover:bg-red-700">Replace</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
