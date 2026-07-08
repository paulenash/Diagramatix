"use client";

import { useEffect, useState } from "react";

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

export function PcfCreateProcessDialog({ projectId, defaultQuery, onClose, onCreated }: {
  projectId: string; defaultQuery?: string; onClose: () => void; onCreated: (diagramId: string, pcf: CreatedPcf) => void;
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

  useEffect(() => {
    fetch(`/api/projects/${projectId}/pcf`).then((r) => r.json()).then((j) => {
      const fws: Framework[] = j.frameworks ?? [];
      setFrameworks(fws);
      const xi = fws.find((f) => f.variant === "Cross-Industry" && f.kind === "reference");
      setFw((p) => p || xi?.id || fws[0]?.id || "");
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
  function applyNumbering(diagramData: { elements?: { type: string; label?: string }[] }, rootCode: string) {
    let n = 0;
    for (const el of diagramData.elements ?? []) {
      if (el.type === "task" || el.type === "subprocess" || el.type === "subprocess-expanded") {
        n += 1;
        const code = `${rootCode}.${n}`;
        if (!(el.label ?? "").startsWith(code)) el.label = `${code} ${el.label ?? ""}`.trim();
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

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50" onClick={busy ? undefined : onClose}>
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-5 w-[440px]" onClick={(e) => e.stopPropagation()}>
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
      </div>
    </div>
  );
}
