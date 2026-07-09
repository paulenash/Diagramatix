"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePcfLevelColors } from "@/app/lib/pcf/usePcfLevelColors";
import { pcfLevelStyle } from "@/app/lib/pcf/levelColors";

interface Framework { id: string; name: string; variant: string; version: string; kind: string; division: string | null }
interface Hit { id: string; pcfId: number; hierarchyId: string; name: string; level: number }

/**
 * Create APQC Project — a project pre-seeded with a folder structure mirroring a
 * chosen APQC PCF branch. Replaces the in-project "Seed folders from APQC PCF":
 * pick a framework, optionally a root process, and a depth; we create the
 * project, seed its folders, and record the APQC settings on the project so the
 * Create APQC Process (diagram) dialog can default from them.
 */
export function PcfCreateProjectDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const pcfColors = usePcfLevelColors();
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [fw, setFw] = useState("");
  const [name, setName] = useState("");
  const [nameDirty, setNameDirty] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [root, setRoot] = useState<Hit | null>(null);
  const [depth, setDepth] = useState(2);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pcf/frameworks`).then((r) => r.json()).then((j) => {
      const fws: Framework[] = j.frameworks ?? [];
      setFrameworks(fws);
      const xi = fws.find((f) => f.variant === "Cross-Industry" && f.kind === "reference");
      setFw((p) => p || xi?.id || fws[0]?.id || "");
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!fw || root) return;
    const t = setTimeout(() => {
      fetch(`/api/pcf/search?framework=${fw}&q=${encodeURIComponent(q)}`)
        .then((r) => r.json()).then((j) => setHits(j.nodes ?? [])).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q, fw, root]);

  function pickRoot(n: Hit) {
    setRoot(n);
    // Default name: "APQC: <FrameworkName> - <LevelNumber> <LevelName>".
    // FrameworkName = the framework's variant/name (already the human label, so
    // the "APQC:" prefix isn't doubled up with the "APQC PCF — …" full name).
    const f = frameworks.find((x) => x.id === fw);
    const frameworkName = f?.variant || f?.name || "";
    if (!nameDirty) setName(`APQC: ${frameworkName} - ${n.hierarchyId} ${n.name}`);
  }

  const wholeLabels = ["", "Categories only", "+ Process Groups", "+ Processes", "+ Activities"];

  async function create() {
    if (!fw || !name.trim()) { setErr("Enter a project name"); return; }
    const f = frameworks.find((x) => x.id === fw);
    setBusy(true); setErr(null);
    try {
      setStatus("Creating the project…");
      const pr = await fetch("/api/projects", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const project = await pr.json().catch(() => ({}));
      if (!pr.ok || !project.id) { setErr(project.error ?? "Failed to create the project"); return; }

      setStatus("Seeding folders from APQC…");
      await fetch(`/api/projects/${project.id}/pcf/seed-folders`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frameworkId: fw, rootNodeId: root?.id ?? null, depth }),
      });

      await fetch(`/api/projects/${project.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pcf: {
            frameworkId: fw, frameworkName: f?.name, variant: f?.variant, version: f?.version,
            rootHierarchyId: root?.hierarchyId, rootName: root?.name, rootNodeId: root?.id,
            depth, seededAt: new Date().toISOString(),
          },
        }),
      });

      router.push(`/dashboard/projects/${project.id}`);
    } catch { setErr("Failed"); }
    finally { setBusy(false); setStatus(null); }
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50" onClick={busy ? undefined : onClose}>
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-5 w-[460px]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Create APQC Project</h2>
        <p className="text-xs text-gray-500 mb-4">A new project with folders mirroring an APQC PCF branch. The APQC settings are saved on the project and become the defaults for Create APQC Process.</p>

        <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">Project name</label>
        <input autoFocus value={name} onChange={(e) => { setName(e.target.value); setNameDirty(true); }}
          placeholder="Project name" className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 mb-3 bg-white text-gray-800" />

        <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">Framework</label>
        <select value={fw} onChange={(e) => { setFw(e.target.value); setRoot(null); }} className="w-full text-xs border border-gray-300 rounded px-2 py-1 mb-3 bg-white text-gray-800">
          <optgroup label="APQC reference">
            {frameworks.filter((f) => f.kind === "reference").map((f) => <option key={f.id} value={f.id}>{f.variant} v{f.version}</option>)}
          </optgroup>
          {frameworks.some((f) => f.kind === "tailored") && (
            <optgroup label="Tailored">
              {frameworks.filter((f) => f.kind === "tailored").map((f) => <option key={f.id} value={f.id}>{f.name}{f.division ? ` · ${f.division}` : ""}</option>)}
            </optgroup>
          )}
        </select>

        <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">Root process (optional — blank = whole framework)</label>
        {root ? (
          <div className="flex items-center gap-2 mb-3 text-xs text-gray-800">
            <span className="font-mono font-semibold" style={{ color: pcfLevelStyle(root.level, pcfColors).main }}>{root.hierarchyId}</span>
            <span className="flex-1">{root.name}</span>
            <button onClick={() => setRoot(null)} className="text-[11px] text-gray-400 hover:text-red-600">Clear</button>
          </div>
        ) : (
          <>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search process / code…" className="w-full text-xs border border-gray-300 rounded px-2 py-1 mb-1 bg-white text-gray-800" />
            <div className="max-h-36 overflow-y-auto border border-gray-100 rounded mb-3">
              {hits.length === 0 ? <p className="text-[11px] text-gray-400 px-2 py-1.5">Type to search, or leave blank for the whole framework.</p> : hits.map((n) => (
                <button key={n.id} onClick={() => pickRoot(n)} className="w-full text-left px-2 py-1 text-[11px] hover:bg-blue-50 flex items-baseline gap-1.5">
                  <span className="font-mono shrink-0 font-semibold" style={{ color: pcfLevelStyle(n.level, pcfColors).main }}>{n.hierarchyId}</span>
                  <span className="flex-1 text-gray-800">{n.name}</span>
                  {(() => { const st = pcfLevelStyle(n.level, pcfColors); return (
                    <span className="text-[8px] px-1 rounded shrink-0 font-medium" style={{ background: st.main, color: st.textOnMain }}>{["", "Category", "Process Group", "Process", "Activity", "Task"][n.level]}</span>
                  ); })()}
                </button>
              ))}
            </div>
          </>
        )}

        <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">Depth</label>
        <select value={depth} onChange={(e) => setDepth(Number(e.target.value))} className="w-full text-xs border border-gray-300 rounded px-2 py-1 mb-1 bg-white text-gray-800">
          {[1, 2, 3, 4].map((d) => (
            <option key={d} value={d}>{root ? `${d} level${d > 1 ? "s" : ""} below the root` : wholeLabels[d]}</option>
          ))}
        </select>
        <p className="text-[10px] text-gray-400 mb-4">{root ? "Folders are created for the root and its descendants, this many levels deep." : "Deeper levels create many more folders (Categories ≈ 13, + Groups ≈ 90, + Processes ≈ 450)."}</p>

        {status && <p className="text-[11px] text-blue-700 mb-2 flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />{status}</p>}
        {err && <p className="text-[11px] text-red-600 mb-2">{err}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button onClick={create} disabled={busy || !name.trim() || !fw} className="px-3 py-1 text-xs text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50">
            {busy ? "Working…" : "Create project"}
          </button>
        </div>
      </div>
    </div>
  );
}
