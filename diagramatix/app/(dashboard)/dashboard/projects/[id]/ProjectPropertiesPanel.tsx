"use client";

import { useEffect, useState } from "react";

/** APQC PCF association stored on the project (mirrors Project.pcf). */
export interface ProjectPcf {
  frameworkId: string;
  frameworkName?: string;
  variant?: string;
  version?: string;
  rootHierarchyId?: string;
  rootName?: string;
  seededAt?: string;
}

interface Framework { id: string; name: string; variant: string; version: string; kind: string; division: string | null }
interface Hit { id: string; pcfId: number; hierarchyId: string; name: string; level: number }

/**
 * Project-level Properties Panel — shown on the right of the project screen when
 * the top ("whole project") folder is selected. Edits the project's own
 * properties (name / description / owner) and its APQC PCF association, which is
 * set automatically when the project is generated/seeded from an APQC framework
 * and can be linked/changed here manually.
 */
export function ProjectPropertiesPanel({
  projectId, name, description, ownerName, pcf, readOnly,
  onName, onDescription, onOwner, onPcf, save,
}: {
  projectId: string;
  name: string; description: string; ownerName: string;
  pcf: ProjectPcf | null;
  readOnly: boolean;
  onName: (v: string) => void;
  onDescription: (v: string) => void;
  onOwner: (v: string) => void;
  onPcf: (v: ProjectPcf | null) => void;
  save: (fields: Record<string, string>) => void;
}) {
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [editingPcf, setEditingPcf] = useState(false);
  const [fw, setFw] = useState(pcf?.frameworkId ?? "");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/pcf`).then((r) => r.json()).then((j) => {
      const fws: Framework[] = j.frameworks ?? [];
      setFrameworks(fws);
      const xi = fws.find((f) => f.variant === "Cross-Industry" && f.kind === "reference");
      setFw((p) => p || pcf?.frameworkId || xi?.id || fws[0]?.id || "");
    }).catch(() => {});
  }, [projectId, pcf?.frameworkId]);

  useEffect(() => {
    if (!editingPcf || !fw) return;
    const t = setTimeout(() => {
      fetch(`/api/projects/${projectId}/pcf/search?framework=${fw}&q=${encodeURIComponent(q)}`)
        .then((r) => r.json()).then((j) => setHits(j.nodes ?? [])).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q, fw, editingPcf, projectId]);

  function savePcf(next: ProjectPcf | null) {
    onPcf(next);
    fetch(`/api/projects/${projectId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pcf: next ?? {} }),
    }).catch(() => {});
  }

  function linkFramework(rootNode?: Hit) {
    const f = frameworks.find((x) => x.id === fw);
    if (!f) return;
    savePcf({
      frameworkId: f.id, frameworkName: f.name, variant: f.variant, version: f.version,
      ...(rootNode ? { rootHierarchyId: rootNode.hierarchyId, rootName: rootNode.name } : {}),
    });
    setEditingPcf(false); setQ("");
  }

  const label = "block text-[10px] uppercase tracking-wide text-gray-400 mb-1";
  const field = "w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-800 disabled:bg-gray-50 disabled:text-gray-500";

  return (
    <aside className="w-72 border-l border-gray-200 bg-white overflow-y-auto shrink-0 p-3 space-y-4">
      <h2 className="text-sm font-semibold text-gray-900">Project Properties</h2>

      <div>
        <label className={label}>Name</label>
        <input className={field} value={name} disabled={readOnly}
          onChange={(e) => onName(e.target.value)}
          onBlur={() => name.trim() && save({ name: name.trim() })} />
      </div>

      <div>
        <label className={label}>Description</label>
        <textarea className={`${field} resize-y min-h-[3rem]`} value={description} disabled={readOnly}
          onChange={(e) => onDescription(e.target.value)}
          onBlur={() => save({ description })} />
      </div>

      <div>
        <label className={label}>Owner</label>
        <input className={field} value={ownerName} disabled={readOnly}
          onChange={(e) => onOwner(e.target.value)}
          onBlur={() => save({ ownerName })} />
      </div>

      <div className="border-t border-gray-100 pt-3">
        <label className={label}>APQC Framework</label>
        {pcf?.frameworkId ? (
          <div className="text-xs text-gray-800 space-y-0.5">
            <div className="font-medium">{pcf.variant ?? pcf.frameworkName}{pcf.version ? ` · v${pcf.version}` : ""}</div>
            {pcf.rootHierarchyId && (
              <div className="text-[11px] text-gray-600">
                <span className="font-mono text-gray-500">{pcf.rootHierarchyId}</span> {pcf.rootName}
              </div>
            )}
            {pcf.seededAt && <div className="text-[10px] text-gray-400">Seeded {new Date(pcf.seededAt).toLocaleDateString()}</div>}
            {!readOnly && (
              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditingPcf((o) => !o)} className="text-[11px] text-blue-600 hover:text-blue-800">Change</button>
                <button onClick={() => savePcf(null)} className="text-[11px] text-gray-400 hover:text-red-600">Unlink</button>
              </div>
            )}
          </div>
        ) : (
          !readOnly && !editingPcf && (
            <button onClick={() => setEditingPcf(true)} className="text-[11px] text-blue-600 hover:text-blue-800">＋ Link to an APQC framework…</button>
          )
        )}
        {pcf?.frameworkId && !readOnly && !editingPcf ? null : (frameworks.length === 0 && !pcf?.frameworkId && !editingPcf) && (
          <p className="text-[10px] text-gray-400 italic mt-1">No PCF frameworks loaded.</p>
        )}

        {editingPcf && (
          <div className="border border-gray-200 rounded p-2 space-y-1.5 bg-gray-50/60 mt-2">
            <select value={fw} onChange={(e) => setFw(e.target.value)} className="w-full text-[11px] border border-gray-300 rounded px-1.5 py-1 bg-white text-gray-800">
              <optgroup label="APQC reference">
                {frameworks.filter((f) => f.kind === "reference").map((f) => <option key={f.id} value={f.id}>{f.variant} v{f.version}</option>)}
              </optgroup>
              {frameworks.some((f) => f.kind === "tailored") && (
                <optgroup label="Tailored">
                  {frameworks.filter((f) => f.kind === "tailored").map((f) => <option key={f.id} value={f.id}>{f.name}{f.division ? ` · ${f.division}` : ""}</option>)}
                </optgroup>
              )}
            </select>
            <button onClick={() => linkFramework()} className="w-full text-[11px] text-white bg-blue-600 rounded px-2 py-1 hover:bg-blue-700">
              Link framework (whole framework)
            </button>
            <p className="text-[10px] text-gray-400">…or pick a root process to scope it to:</p>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search process / code…" className="w-full text-[11px] border border-gray-300 rounded px-1.5 py-1 bg-white text-gray-800" />
            <div className="max-h-40 overflow-y-auto">
              {hits.length === 0 ? <p className="text-[10px] text-gray-400 px-1 py-1">Type to search…</p> : hits.map((n) => (
                <button key={n.id} onClick={() => linkFramework(n)} className="w-full text-left px-1 py-0.5 text-[11px] hover:bg-blue-50 rounded flex items-baseline gap-1">
                  <span className="font-mono text-gray-500 shrink-0">{n.hierarchyId}</span>
                  <span className="flex-1 text-gray-800">{n.name}</span>
                </button>
              ))}
            </div>
            <button onClick={() => { setEditingPcf(false); setQ(""); }} className="text-[10px] text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        )}
      </div>
    </aside>
  );
}
