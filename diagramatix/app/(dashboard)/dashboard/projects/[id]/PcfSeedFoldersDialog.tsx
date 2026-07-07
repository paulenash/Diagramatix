"use client";

import { useEffect, useState } from "react";

interface Framework { id: string; name: string; variant: string; version: string; kind: string; division: string | null }

const DEPTHS = [
  { level: 1, label: "Categories only" },
  { level: 2, label: "+ Process Groups" },
  { level: 3, label: "+ Processes" },
  { level: 4, label: "+ Activities" },
];

/**
 * Seed a project's folder structure from an APQC PCF branch (Level 2). Picks a
 * framework + depth and appends the folders server-side, then calls onDone to
 * reload the project. Purely additive — existing folders/diagrams are untouched.
 */
export function PcfSeedFoldersDialog({ projectId, onClose, onDone }: {
  projectId: string; onClose: () => void; onDone: () => void;
}) {
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [fw, setFw] = useState("");
  const [maxLevel, setMaxLevel] = useState(2);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/pcf`).then((r) => r.json()).then((j) => {
      setFrameworks(j.frameworks ?? []);
      setFw((p) => p || j.frameworks?.[0]?.id || "");
    }).catch(() => {});
  }, [projectId]);

  async function seed() {
    if (!fw) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/pcf/seed-folders`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frameworkId: fw, maxLevel }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(j.error ?? "Failed"); return; }
      onDone();
      onClose();
    } catch { setMsg("Failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-5 w-[380px]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Seed folders from APQC PCF</h2>
        <p className="text-xs text-gray-500 mb-4">Create a folder structure mirroring a Process Classification Framework branch. Existing folders and diagrams are kept.</p>

        <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">Framework</label>
        <select value={fw} onChange={(e) => setFw(e.target.value)} className="w-full text-xs border border-gray-300 rounded px-2 py-1 mb-3 bg-white">
          <optgroup label="APQC reference">
            {frameworks.filter((f) => f.kind === "reference").map((f) => <option key={f.id} value={f.id}>{f.variant} v{f.version}</option>)}
          </optgroup>
          {frameworks.some((f) => f.kind === "tailored") && (
            <optgroup label="Tailored">
              {frameworks.filter((f) => f.kind === "tailored").map((f) => <option key={f.id} value={f.id}>{f.name}{f.division ? ` · ${f.division}` : ""}</option>)}
            </optgroup>
          )}
        </select>

        <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">Depth</label>
        <select value={maxLevel} onChange={(e) => setMaxLevel(Number(e.target.value))} className="w-full text-xs border border-gray-300 rounded px-2 py-1 mb-1 bg-white">
          {DEPTHS.map((d) => <option key={d.level} value={d.level}>{d.label}</option>)}
        </select>
        <p className="text-[10px] text-gray-400 mb-4">Deeper levels create many more folders (Categories ≈ 13, + Groups ≈ 90, + Processes ≈ 450).</p>

        {msg && <p className="text-[11px] text-red-600 mb-2">{msg}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
          <button onClick={seed} disabled={busy || !fw} className="px-3 py-1 text-xs text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">
            {busy ? "Creating…" : "Create folders"}
          </button>
        </div>
      </div>
    </div>
  );
}
