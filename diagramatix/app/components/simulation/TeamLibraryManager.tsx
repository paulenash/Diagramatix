"use client";

/**
 * Matrix-styled manager for a project's simulation Teams (shared resource
 * pools). Capacity is the number that drives contention. Reports the
 * name→capacity map up so the replay/run uses real capacities instead of
 * defaulting everything to 1.
 */

import { useCallback, useEffect, useState } from "react";
import { MatrixButton } from "./matrix/MatrixChrome";

interface Team { id: string; name: string; capacity: number; costPerHour: number | null; efficiency: number }

export function TeamLibraryManager({
  projectId,
  onCapacities,
}: {
  projectId: string | null;
  onCapacities?: (caps: Record<string, number>) => void;
}) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [newName, setNewName] = useState("");
  const [newCap, setNewCap] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const publish = useCallback((list: Team[]) => {
    // Keyed by NAME: tasks reference a team by the name typed in sim.teamId.
    onCapacities?.(Object.fromEntries(list.map((t) => [t.name, t.capacity])));
  }, [onCapacities]);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/simulation-teams`);
      if (!res.ok) return;
      const json = await res.json();
      setTeams(json.teams ?? []);
      publish(json.teams ?? []);
    } catch { /* ignore */ }
  }, [projectId, publish]);

  useEffect(() => { load(); }, [load]);

  async function addTeam() {
    if (!projectId || !newName.trim()) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/simulation-teams`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), capacity: newCap }),
      });
      if (!res.ok) { setErr((await res.json()).error ?? "Failed"); return; }
      setNewName(""); setNewCap(1);
      await load();
    } finally { setBusy(false); }
  }

  async function setCapacity(id: string, capacity: number) {
    setTeams((ts) => { const next = ts.map((t) => t.id === id ? { ...t, capacity } : t); publish(next); return next; });
    if (!projectId) return;
    await fetch(`/api/projects/${projectId}/simulation-teams/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ capacity }),
    });
  }

  async function remove(id: string) {
    if (!projectId) return;
    await fetch(`/api/projects/${projectId}/simulation-teams/${id}`, { method: "DELETE" });
    await load();
  }

  if (!projectId) return <p className="text-xs text-green-400/50">Open this diagram from a project to manage teams.</p>;

  return (
    <div className="flex flex-col gap-2 text-[11px]">
      {teams.length === 0 && <p className="text-green-400/50">No teams yet — add one below.</p>}
      {teams.map((t) => (
        <div key={t.id} className="flex items-center gap-2">
          <span className="flex-1 text-green-300 truncate">{t.name}</span>
          <span className="text-green-400/50">cap</span>
          <input
            type="number" min={1} value={t.capacity}
            onChange={(e) => setCapacity(t.id, Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="w-14 bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-300"
          />
          <button onClick={() => remove(t.id)} className="text-red-400/70 hover:text-red-300 px-1" title="Delete">✕</button>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1 border-t border-green-500/20">
        <input
          type="text" value={newName} placeholder="new team (e.g. analysts)"
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 bg-black border border-green-500/40 rounded px-1.5 py-0.5 text-green-300"
        />
        <input
          type="number" min={1} value={newCap}
          onChange={(e) => setNewCap(Math.max(1, parseInt(e.target.value, 10) || 1))}
          className="w-14 bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-300"
        />
        <MatrixButton onClick={addTeam}>{busy ? "…" : "+ Add"}</MatrixButton>
      </div>
      {err && <p className="text-red-400">{err}</p>}
      <p className="text-green-400/40 text-[10px]">Tasks reference a team by name in Properties → ◈ Simulation (or inherit their lane&rsquo;s team).</p>
    </div>
  );
}
