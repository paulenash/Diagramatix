"use client";

/**
 * Matrix-styled manager for a project's simulation Teams (shared resource
 * pools). Capacity is the number that drives contention. Reports the
 * name→capacity map up so the replay/run uses real capacities instead of
 * defaulting everything to 1.
 */

import { useCallback, useEffect, useState } from "react";
import { MatrixButton } from "./matrix/MatrixChrome";
import type { CalendarRow } from "./CalendarLibraryManager";

interface Team { id: string; name: string; capacity: number; costPerHour: number | null; efficiency: number; calendarId: string | null }

export function TeamLibraryManager({
  projectId,
  onCapacities,
  calendars = [],
  onTeamCalendars,
}: {
  projectId: string | null;
  onCapacities?: (caps: Record<string, number>) => void;
  /** Available working calendars (for the per-team picker). */
  calendars?: CalendarRow[];
  /** Publishes team name → assigned calendarId so the console can resolve hours. */
  onTeamCalendars?: (map: Record<string, string>) => void;
}) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [newName, setNewName] = useState("");
  const [newCap, setNewCap] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);
  const [matchMsg, setMatchMsg] = useState<string | null>(null);

  const publish = useCallback((list: Team[]) => {
    // Keyed by NAME: tasks reference a team by the name typed in sim.teamId.
    onCapacities?.(Object.fromEntries(list.map((t) => [t.name, t.capacity])));
    onTeamCalendars?.(Object.fromEntries(list.filter((t) => t.calendarId).map((t) => [t.name, t.calendarId as string])));
  }, [onCapacities, onTeamCalendars]);

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

  async function setCalendar(id: string, calendarId: string | null) {
    setTeams((ts) => { const next = ts.map((t) => t.id === id ? { ...t, calendarId } : t); publish(next); return next; });
    if (!projectId) return;
    await fetch(`/api/projects/${projectId}/simulation-teams/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ calendarId }),
    });
  }

  async function remove(id: string) {
    if (!projectId) return;
    await fetch(`/api/projects/${projectId}/simulation-teams/${id}`, { method: "DELETE" });
    await load();
  }

  // Repair slug team names ("loan-assessment-team") to the exact lane names
  // ("Loan Assessment Team") — renames the library teams AND the task references
  // together across the project's diagrams.
  async function matchLanes() {
    if (!projectId) return;
    setMatching(true); setMatchMsg(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/simulation-teams/match-lanes`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMatchMsg(json.error || "Failed"); return; }
      const n = json.renamed?.length ?? 0;
      setMatchMsg(n ? `Renamed ${n} team(s) to lane names${json.diagramsUpdated ? ` · updated ${json.diagramsUpdated} diagram(s)` : ""}. Reopen the process to see task teams.` : "All team names already match the lanes.");
      await load();
    } finally { setMatching(false); }
  }

  if (!projectId) return <p className="text-xs text-green-400/50">Open this diagram from a project to manage teams.</p>;

  return (
    <div className="flex flex-col gap-2 text-[11px]">
      <div className="flex flex-col gap-0.5">
        {teams.length === 0 && <p className="text-green-400/50">No teams yet — add one below.</p>}
        {teams.length > 0 && (
          <div className="flex items-center gap-2 text-green-400/40 pb-0.5 border-b border-green-500/20 uppercase tracking-wide text-[10px]">
            <span className="w-52 shrink-0 text-left">Team Name</span>
            <span className="w-16 shrink-0 text-left">Capacity</span>
            <span className="w-32 shrink-0 text-left">Calendar</span>
          </div>
        )}
        {teams.map((t) => (
          <div key={t.id} className="flex items-center gap-2 py-0.5">
            <span className="w-52 shrink-0 text-green-300 truncate" title={t.name}>{t.name}</span>
            <input
              type="number" min={1} value={t.capacity}
              onChange={(e) => setCapacity(t.id, Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-16 bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-200 [color-scheme:dark]"
            />
            <select
              value={t.calendarId ?? ""}
              onChange={(e) => setCalendar(t.id, e.target.value || null)}
              title="Working hours for this team (from the Calendars panel)"
              className="w-32 shrink-0 bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-200 text-[10px] [color-scheme:dark]"
            >
              <option value="">24/7</option>
              {calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={() => remove(t.id)} className="text-red-400/70 hover:text-red-300 px-1" title="Delete">✕</button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1 border-t border-green-500/20">
        <input
          type="text" value={newName} placeholder="new team (e.g. analysts)"
          onChange={(e) => setNewName(e.target.value)}
          className="w-52 shrink-0 bg-black border border-green-500/40 rounded px-1.5 py-0.5 text-green-200 [color-scheme:dark]"
        />
        <input
          type="number" min={1} value={newCap}
          onChange={(e) => setNewCap(Math.max(1, parseInt(e.target.value, 10) || 1))}
          className="w-16 bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-200 [color-scheme:dark]"
        />
        <MatrixButton onClick={addTeam}>{busy ? "…" : "+ Add"}</MatrixButton>
      </div>
      {err && <p className="text-red-400">{err}</p>}
      {teams.length > 0 && (
        <button
          onClick={matchLanes}
          disabled={matching}
          className="self-start text-[10px] text-green-400/60 hover:text-green-300 disabled:opacity-50"
          title="Rename teams to the exact swim-lane names, and update the tasks that reference them"
        >
          {matching ? "matching…" : "⇄ Match names to lanes"}
        </button>
      )}
      {matchMsg && <p className="text-green-300 text-[10px]">{matchMsg}</p>}
      <p className="text-green-400/40 text-[10px]">Tasks reference a team by name in Properties → ◈ Simulation (or inherit their lane&rsquo;s team).</p>
    </div>
  );
}
