"use client";

/**
 * Matrix-styled manager for a project's simulation Teams (shared resource
 * pools). Capacity is the number that drives contention. Reports the
 * name→capacity map up so the replay/run uses real capacities instead of
 * defaulting everything to 1.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { MatrixButton } from "./matrix/MatrixChrome";
import type { CalendarRow } from "./CalendarLibraryManager";

interface Team { id: string; name: string; capacity: number; costPerHour: number | null; efficiency: number; calendarId: string | null }

/** An org-master team this project can adopt as its own copy. */
interface OrgTeam {
  id: string; name: string; capacity: number; costPerHour: number | null; efficiency: number;
  alreadyInProject: boolean;
}

export function TeamLibraryManager({
  projectId,
  onCapacities,
  calendars = [],
  onTeamCalendars,
  usedNames,
}: {
  projectId: string | null;
  onCapacities?: (caps: Record<string, number>) => void;
  /** Available working calendars (for the per-team picker). */
  calendars?: CalendarRow[];
  /** Publishes team name → assigned calendarId so the console can resolve hours. */
  onTeamCalendars?: (map: Record<string, string>) => void;
  /** Team names actually referenced by the project's diagrams — a lane/pool name
   *  or a task's sim.teamId. Teams are matched by NAME, so a lane that is renamed
   *  or deleted leaves its old team row behind with nothing pointing at it.
   *  Undefined = don't mark anything (the diagrams haven't loaded yet). */
  usedNames?: Set<string>;
}) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [newName, setNewName] = useState("");
  const [newCap, setNewCap] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);
  const [matchMsg, setMatchMsg] = useState<string | null>(null);
  // Org-master adopt: the standing pools an OrgAdmin maintains, cloned into this
  // project as independent copies.
  const [orgTeams, setOrgTeams] = useState<OrgTeam[]>([]);
  const [orgName, setOrgName] = useState("");
  const [showAdopt, setShowAdopt] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [overwrite, setOverwrite] = useState(false);
  const [adoptBusy, setAdoptBusy] = useState(false);
  const [adoptMsg, setAdoptMsg] = useState<string | null>(null);

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

  // Which org masters are available (and which this project already has by
  // name). Cheap enough to load with the library so the button can hide itself
  // when the org maintains none.
  const loadOrgTeams = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/adopt-teams`);
      if (!res.ok) return;
      const json = await res.json();
      setOrgTeams(json.teams ?? []);
      setOrgName(json.orgName ?? "");
    } catch { /* ignore — adopting is optional */ }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadOrgTeams(); }, [loadOrgTeams]);

  async function adopt() {
    if (!projectId || picked.size === 0) return;
    setAdoptBusy(true); setAdoptMsg(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/adopt-teams`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamIds: [...picked], overwriteExisting: overwrite }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setAdoptMsg(json.error || "Failed"); return; }
      const bits = [json.created ? `${json.created} added` : "", json.updated ? `${json.updated} updated` : ""].filter(Boolean);
      const skipped = picked.size - (json.created ?? 0) - (json.updated ?? 0);
      setAdoptMsg(
        (bits.join(", ") || "Nothing changed") +
        (skipped > 0 ? ` · ${skipped} already in this project (tick Overwrite to replace)` : ""),
      );
      setPicked(new Set());
      await load();
      await loadOrgTeams();
    } finally { setAdoptBusy(false); }
  }

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

  // Compare case-insensitively: a team row and the lane it came from can drift
  // in casing without the link being "broken".
  const unused = useMemo(() => {
    if (!usedNames) return new Set<string>();
    const used = new Set([...usedNames].map((n) => n.trim().toLowerCase()));
    return new Set(teams.filter((t) => !used.has(t.name.trim().toLowerCase())).map((t) => t.name));
  }, [teams, usedNames]);

  if (!projectId) return <p className="text-xs text-green-400/50">Open this diagram from a project to manage teams.</p>;

  return (
    <div className="flex flex-col gap-2 text-[11px]">
      <div className="flex flex-col gap-0.5">
        {teams.length === 0 && <p className="text-green-400/50">No teams yet — add one below.</p>}
        {teams.length > 0 && (
          <div className="flex items-center gap-2 text-green-400/40 pb-0.5 border-b border-green-500/20 uppercase tracking-wide text-[10px]">
            <span className="w-52 shrink-0 text-left">Resource</span>
            <span className="w-16 shrink-0 text-left">Capacity</span>
            <span className="w-32 shrink-0 text-left">Calendar</span>
          </div>
        )}
        {teams.map((t) => (
          <div key={t.id} className="flex items-center gap-2 py-0.5">
            <span className="w-52 shrink-0 truncate flex items-center gap-1" title={t.name}>
              <span className={unused.has(t.name) ? "text-green-300/50 truncate" : "text-green-300 truncate"}>{t.name}</span>
              {unused.has(t.name) && (
                <span
                  className="shrink-0 text-[9px] uppercase tracking-wider text-amber-300/90 border border-amber-500/40 rounded px-1"
                  title="No lane or task in this project refers to this team — usually a lane that was renamed or deleted. Safe to delete with ✕ (nothing links to it by id; tasks match teams by NAME)."
                >unused</span>
              )}
            </span>
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
          type="text" value={newName} placeholder="new resource (e.g. analysts)"
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

      {/* Org-master adopt — only offered when the org actually maintains
          standing pools, so a solo project never sees a dead control. */}
      {orgTeams.length > 0 && (
        <div className="flex flex-col gap-1 pt-1 border-t border-green-500/20">
          <button
            onClick={() => setShowAdopt((v) => !v)}
            className="self-start text-[10px] text-green-400/60 hover:text-green-300"
            title={`Copy standing resource pools maintained by ${orgName || "your organisation"} into this project`}
          >
            {showAdopt ? "▾" : "▸"} ⬇ Adopt from {orgName || "organisation"} ({orgTeams.length})
          </button>
          {showAdopt && (
            <div className="flex flex-col gap-1 pl-2 border-l border-green-500/20">
              {orgTeams.map((t) => (
                <label key={t.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={picked.has(t.id)}
                    onChange={(e) => setPicked((s) => {
                      const next = new Set(s);
                      if (e.target.checked) next.add(t.id); else next.delete(t.id);
                      return next;
                    })}
                    className="accent-green-500"
                  />
                  <span className="w-44 shrink-0 text-green-300 truncate" title={t.name}>{t.name}</span>
                  <span className="w-16 shrink-0 text-green-400/50">cap {t.capacity}</span>
                  <span className="w-20 shrink-0 text-green-400/50">
                    {t.costPerHour != null ? `$${t.costPerHour}/h` : "—"}
                  </span>
                  {t.alreadyInProject && (
                    <span className="text-amber-400/70 text-[10px]" title="This project already has a team with this name">
                      already here
                    </span>
                  )}
                </label>
              ))}
              <div className="flex items-center gap-2 pt-0.5">
                <MatrixButton onClick={adopt}>{adoptBusy ? "…" : `Adopt ${picked.size || ""}`}</MatrixButton>
                <label className="flex items-center gap-1 text-green-400/60 cursor-pointer" title="Replace the settings of same-named teams already in this project">
                  <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="accent-green-500" />
                  Overwrite existing
                </label>
              </div>
              {adoptMsg && <p className="text-green-300 text-[10px]">{adoptMsg}</p>}
              <p className="text-green-400/40 text-[10px]">
                Adopted teams become this project&rsquo;s own copies — editing them never changes the organisation&rsquo;s masters.
              </p>
            </div>
          )}
        </div>
      )}

      <p className="text-green-400/40 text-[10px]">Tasks reference a team by name in Properties → ◈ Simulation (or inherit their lane&rsquo;s team).</p>
    </div>
  );
}
