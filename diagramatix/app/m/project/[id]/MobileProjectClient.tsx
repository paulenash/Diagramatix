"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface DiagramRow { id: string; name: string; type: string }
const TYPE_BADGE: Record<string, string> = { bpmn: "BP", flowchart: "FC", archimate: "AR", "value-chain": "VC", "state-machine": "SM", "process-context": "PC" };

/**
 * Project screen: list this project's diagrams (tap to view) + Create Diagram
 * (name → BPMN). Step 4 creates an empty BPMN diagram and opens its viewer; the
 * prompt→generate flow arrives in slice 3.
 */
export function MobileProjectClient({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [name, setName] = useState<string>("Project");
  const [diagrams, setDiagrams] = useState<DiagramRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load project");
      const p = await res.json();
      setName(p.name ?? "Project");
      setDiagrams((p.diagrams ?? []).map((d: DiagramRow) => ({ id: d.id, name: d.name, type: d.type })));
    } catch (e) { setErr(e instanceof Error ? e.message : "Load failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);

  async function createDiagram() {
    const n = newName.trim();
    if (!n || busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/diagrams", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, type: "bpmn", projectId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Create failed");
      router.push(`/m/diagram/${j.id}`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Create failed"); setBusy(false); }
  }

  return (
    <div className="p-4">
      <button onClick={() => router.push("/m")} className="text-blue-600 text-sm mb-2">‹ Projects</button>
      <div className="flex items-start justify-between gap-2 mb-3">
        <h1 className="text-lg font-semibold text-gray-900 break-words min-w-0">{name}</h1>
        {!creating && (
          <button onClick={() => setCreating(true)}
            className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg active:bg-blue-700 shrink-0">+ Diagram</button>
        )}
      </div>

      {creating && (
        <div className="mb-4 p-3 bg-white rounded-xl shadow-sm">
          <label className="block text-xs text-gray-500 mb-1">Diagram name (BPMN)</label>
          <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void createDiagram(); }}
            placeholder="e.g. Validate Customer / Order"
            className="w-full text-base border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="flex gap-2 mt-3">
            <button onClick={createDiagram} disabled={!newName.trim() || busy}
              className="flex-1 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg active:bg-blue-700 disabled:opacity-50">
              {busy ? "Creating…" : "Create"}
            </button>
            <button onClick={() => { setCreating(false); setNewName(""); }}
              className="px-4 py-2.5 text-sm text-gray-600 border border-gray-300 rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {err && <p className="text-sm text-red-600 mb-2">{err}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : diagrams.length === 0 ? (
        <p className="text-sm text-gray-400 mt-6 text-center">No diagrams yet. Tap “+ Diagram”.</p>
      ) : (
        <ul className="space-y-2">
          {diagrams.map((d) => (
            <li key={d.id}>
              <button onClick={() => router.push(`/m/diagram/${d.id}`)}
                className="w-full text-left bg-white rounded-xl shadow-sm px-4 py-3.5 active:bg-gray-50 flex items-start gap-3">
                <span className="w-8 h-8 rounded bg-blue-100 text-blue-700 text-[11px] font-semibold flex items-center justify-center shrink-0">{TYPE_BADGE[d.type] ?? d.type.slice(0, 2).toUpperCase()}</span>
                <span className="flex-1 font-medium text-gray-900 break-words min-w-0">{d.name}</span>
                <span className="text-gray-400 shrink-0 mt-1.5">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
