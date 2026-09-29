"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isMobileSupportedType } from "@/app/lib/diagram/mobileSupport";
import { MobileRenameSheet } from "@/app/components/mobile/MobileRenameSheet";
import { renameFailureText } from "@/app/lib/mobile/rename";

interface DiagramRow { id: string; name: string; type: string }
const TYPE_BADGE: Record<string, string> = { bpmn: "BP", flowchart: "FC", archimate: "AR", "value-chain": "VC", "state-machine": "SM", "process-context": "PC" };

/**
 * Project screen: list this project's diagrams (tap to view) + Create Diagram
 * (name → BPMN). Step 4 creates an empty BPMN diagram and opens its viewer; the
 * prompt→generate flow arrives in slice 3.
 *
 * Renaming (2026-09-29): the project's ✎ for its owner, each diagram's ✎ for
 * anyone who may edit its diagrams — what the project GET says the caller may
 * do (canRename / canEditDiagrams), by the rules the writes use.
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
  const [canRename, setCanRename] = useState(false);
  const [canEditDiagrams, setCanEditDiagrams] = useState(false);
  const [wasExample, setWasExample] = useState(false);
  // What is being renamed: the project, or one of its diagrams.
  const [renaming, setRenaming] = useState<{ kind: "project" } | { kind: "diagram"; row: DiagramRow } | null>(null);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load project");
      const p = await res.json();
      setName(p.name ?? "Project");
      setCanRename(p.canRename === true);
      setCanEditDiagrams(p.canEditDiagrams === true);
      setWasExample(!!(p.exampleType || p.sourceExampleId));
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

  /** Save a new name; what went wrong, or null when saved. */
  async function saveName(newValue: string): Promise<string | null> {
    if (!renaming) return null;
    const url = renaming.kind === "project" ? `/api/projects/${projectId}` : `/api/diagrams/${renaming.row.id}`;
    try {
      // A name only — no version: a rename never conflicts with the diagram's content.
      const res = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newValue }) });
      const j = await res.json().catch(() => ({})) as { name?: unknown; error?: unknown };
      if (!res.ok) return renameFailureText(res.status, typeof j.error === "string" ? j.error : null);
      const saved = typeof j.name === "string" ? j.name : newValue;
      if (saved !== newValue) return "You can’t rename this.";
      if (renaming.kind === "project") { setName(saved); setWasExample(false); }
      else { const id = renaming.row.id; setDiagrams((cur) => cur.map((d) => (d.id === id ? { ...d, name: saved } : d))); }
      return null;
    } catch {
      return renameFailureText(0, null);
    }
  }

  return (
    <div className="p-4">
      <button onClick={() => router.push("/m")} className="text-blue-600 text-sm mb-2">‹ Projects</button>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-start gap-1.5 min-w-0">
          <h1 className="text-lg font-semibold text-gray-900 break-words min-w-0">{name}</h1>
          {canRename && !loading && (
            <button onClick={() => setRenaming({ kind: "project" })} aria-label="Rename project"
              className="shrink-0 text-gray-500 text-base leading-none px-1.5 py-1 active:text-gray-800">✎</button>
          )}
        </div>
        {!creating && canEditDiagrams && (
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
        <p className="text-sm text-gray-400 mt-6 text-center">{canEditDiagrams ? "No diagrams yet. Tap “+ Diagram”." : "No diagrams yet."}</p>
      ) : (
        <ul className="space-y-2">
          {diagrams.map((d) => {
            const ok = isMobileSupportedType(d.type);
            if (!ok) {
              return (
                <li key={d.id}>
                  <div aria-disabled className="w-full text-left bg-white/60 rounded-xl shadow-sm px-4 py-3.5 flex items-start gap-3 opacity-50 cursor-not-allowed">
                    <span className="w-8 h-8 rounded bg-gray-200 text-gray-500 text-[11px] font-semibold flex items-center justify-center shrink-0">{TYPE_BADGE[d.type] ?? d.type.slice(0, 2).toUpperCase()}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium text-gray-500 break-words">{d.name}</span>
                      <span className="block text-[11px] text-gray-400">Not available on mobile</span>
                    </span>
                  </div>
                </li>
              );
            }
            return (
              <li key={d.id} className="flex items-stretch gap-1.5">
                <button onClick={() => router.push(`/m/diagram/${d.id}`)}
                  className="flex-1 min-w-0 text-left bg-white rounded-xl shadow-sm px-4 py-3.5 active:bg-gray-50 flex items-start gap-3">
                  <span className="w-8 h-8 rounded bg-blue-100 text-blue-700 text-[11px] font-semibold flex items-center justify-center shrink-0">{TYPE_BADGE[d.type] ?? d.type.slice(0, 2).toUpperCase()}</span>
                  <span className="flex-1 font-medium text-gray-900 break-words min-w-0">{d.name}</span>
                  <span className="text-gray-400 shrink-0 mt-1.5">›</span>
                </button>
                {canEditDiagrams && (
                  <button onClick={() => setRenaming({ kind: "diagram", row: d })} aria-label={`Rename ${d.name}`}
                    className="shrink-0 w-11 bg-white rounded-xl shadow-sm text-gray-500 text-base active:bg-gray-50">✎</button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {renaming && (
        <MobileRenameSheet
          title={renaming.kind === "project" ? "Rename project" : "Rename diagram"}
          label={renaming.kind === "project" ? "Project name" : "Diagram name"}
          initial={renaming.kind === "project" ? name : renaming.row.name}
          note={renaming.kind === "project" && wasExample ? "Renaming an example makes it your own project." : undefined}
          onSave={saveName}
          onClose={() => setRenaming(null)} />
      )}
    </div>
  );
}
