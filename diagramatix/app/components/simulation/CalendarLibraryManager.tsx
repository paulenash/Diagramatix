"use client";

/**
 * Matrix-styled manager for a project's working Calendars (reusable weekly shift
 * patterns). A calendar is a set of open windows per weekday; teams staffed by it
 * only work during those windows and sources only arrive then. Reports the loaded
 * calendars up so the Teams panel + source pickers can reference them, and so the
 * replay/heatmap honour working hours. Mirrors TeamLibraryManager.
 */

import { useCallback, useEffect, useState } from "react";
import { MatrixButton } from "./matrix/MatrixChrome";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { PromptDialog } from "@/app/components/PromptDialog";
import type { WorkCalendar, CalendarInterval } from "@/app/lib/simulation/types";

export interface CalendarRow { id: string; name: string; pattern: WorkCalendar }

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Preset patterns (24/7 = empty intervals ≙ always open).
const PRESETS: { label: string; make: () => WorkCalendar }[] = [
  { label: "Mon–Fri 9–5", make: () => ({ intervals: [0, 1, 2, 3, 4].map((day) => ({ day, start: "09:00", end: "17:00" })) }) },
  { label: "9–5 w/ lunch", make: () => ({ intervals: [0, 1, 2, 3, 4].flatMap((day) => [{ day, start: "09:00", end: "12:00" }, { day, start: "13:00", end: "17:00" }]) }) },
  { label: "24/7", make: () => ({ intervals: [] }) },
];

/** A short human summary of a pattern for the list row. */
function summarise(p: WorkCalendar): string {
  if (!p.intervals?.length) return "Always open (24/7)";
  const byDay = new Map<number, CalendarInterval[]>();
  for (const iv of p.intervals) (byDay.get(iv.day) ?? byDay.set(iv.day, []).get(iv.day)!).push(iv);
  const days = [...byDay.keys()].sort((a, b) => a - b).map((d) => DAYS[d]).join(", ");
  const windows = p.intervals.length;
  return `${days} · ${windows} window${windows === 1 ? "" : "s"}`;
}

export function CalendarLibraryManager({
  projectId,
  onCalendars,
}: {
  projectId: string | null;
  onCalendars?: (list: CalendarRow[]) => void;
}) {
  const [calendars, setCalendars] = useState<CalendarRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<CalendarRow | null>(null);
  const [deleting, setDeleting] = useState<CalendarRow | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const publish = useCallback((list: CalendarRow[]) => { onCalendars?.(list); }, [onCalendars]);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/simulation-calendars`);
      if (!res.ok) return;
      const json = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list: CalendarRow[] = (json.calendars ?? []).map((c: any) => ({ id: c.id, name: c.name, pattern: (c.pattern ?? { intervals: [] }) as WorkCalendar }));
      setCalendars(list);
      publish(list);
    } catch { /* ignore */ }
  }, [projectId, publish]);

  useEffect(() => { load(); }, [load]);

  async function create(name: string) {
    setCreating(false);
    if (!projectId || !name.trim()) return;
    setErr(null);
    const res = await fetch(`/api/projects/${projectId}/simulation-calendars`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), pattern: PRESETS[0].make() }),
    });
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? "Failed"); return; }
    const json = await res.json();
    await load();
    if (json.calendar?.id) setSelected(json.calendar.id);
  }

  // Persist a calendar's pattern (optimistic local update + PUT).
  async function savePattern(id: string, pattern: WorkCalendar) {
    setCalendars((cs) => { const next = cs.map((c) => c.id === id ? { ...c, pattern } : c); publish(next); return next; });
    if (!projectId) return;
    await fetch(`/api/projects/${projectId}/simulation-calendars/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pattern }),
    });
  }

  async function rename(id: string, name: string) {
    setRenaming(null);
    if (!projectId || !name.trim()) return;
    setCalendars((cs) => { const next = cs.map((c) => c.id === id ? { ...c, name: name.trim() } : c); publish(next); return next; });
    await fetch(`/api/projects/${projectId}/simulation-calendars/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }),
    });
  }

  async function remove(id: string) {
    setDeleting(null);
    if (!projectId) return;
    await fetch(`/api/projects/${projectId}/simulation-calendars/${id}`, { method: "DELETE" });
    if (selected === id) setSelected(null);
    await load();
  }

  // ── Pattern editing helpers (operate on the selected calendar) ──
  const current = calendars.find((c) => c.id === selected) ?? null;
  function mutate(fn: (ivs: CalendarInterval[]) => CalendarInterval[]) {
    if (!current) return;
    savePattern(current.id, { intervals: fn([...(current.pattern.intervals ?? [])]) });
  }
  const addWindow = (day: number) => mutate((ivs) => [...ivs, { day, start: "09:00", end: "17:00" }]);
  const removeWindow = (idx: number) => mutate((ivs) => ivs.filter((_, i) => i !== idx));
  const setField = (idx: number, patch: Partial<CalendarInterval>) => mutate((ivs) => ivs.map((iv, i) => i === idx ? { ...iv, ...patch } : iv));

  if (!projectId) return <p className="text-xs text-green-400/50">Open this diagram from a project to manage calendars.</p>;

  // Intervals grouped per day, keeping their index in the flat list for edits.
  const rowsByDay = DAYS.map((_, day) => (current?.pattern.intervals ?? [])
    .map((iv, idx) => ({ iv, idx }))
    .filter((r) => r.iv.day === day));

  return (
    <div className="flex flex-col gap-2 text-[11px]">
      {/* Calendar list */}
      <div className="flex flex-col gap-0.5">
        {calendars.length === 0 && <p className="text-green-400/50">No calendars yet — add one for working hours (e.g. “Business hours”).</p>}
        {calendars.map((c) => (
          <div key={c.id} className={`flex items-center gap-2 py-0.5 px-1 rounded ${selected === c.id ? "bg-green-500/10" : ""}`}>
            <button onClick={() => setSelected(selected === c.id ? null : c.id)} className="flex-1 text-left truncate" title={c.name}>
              <span className="text-green-300">{selected === c.id ? "▾ " : "▸ "}{c.name}</span>
              <span className="text-green-400/40 ml-2">{summarise(c.pattern)}</span>
            </button>
            <button onClick={() => setRenaming(c)} className="text-green-400/60 hover:text-green-300 px-1" title="Rename">✎</button>
            <button onClick={() => setDeleting(c)} className="text-red-400/70 hover:text-red-300 px-1" title="Delete">✕</button>
          </div>
        ))}
      </div>

      {/* Weekly editor for the selected calendar */}
      {current && (
        <div className="flex flex-col gap-1 pt-1 border-t border-green-500/20">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-green-400/40 uppercase tracking-wide text-[10px]">Presets:</span>
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => savePattern(current.id, p.make())} className="text-[10px] text-green-400/70 hover:text-green-200 border border-green-500/30 rounded px-1.5 py-0.5">{p.label}</button>
            ))}
          </div>
          {DAYS.map((label, day) => (
            <div key={day} className="flex items-start gap-2 py-0.5">
              <span className="w-9 shrink-0 text-green-300/80 pt-0.5">{label}</span>
              <div className="flex-1 flex flex-col gap-0.5">
                {rowsByDay[day].length === 0 && <span className="text-green-400/30 pt-0.5">closed</span>}
                {rowsByDay[day].map(({ iv, idx }) => (
                  <div key={idx} className="flex items-center gap-1">
                    <input type="time" value={iv.start} onChange={(e) => setField(idx, { start: e.target.value })}
                      className="bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-200 [color-scheme:dark]" />
                    <span className="text-green-400/40">–</span>
                    <input type="time" value={iv.end} onChange={(e) => setField(idx, { end: e.target.value })}
                      className="bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-200 [color-scheme:dark]" />
                    <label className="flex items-center gap-1 text-green-400/50 ml-1" title="Arrival-rate multiplier for a source using this calendar (1 = normal)">
                      ×<input type="number" min={0.1} step={0.1} value={iv.rate ?? 1}
                        onChange={(e) => setField(idx, { rate: Math.max(0.1, Number(e.target.value) || 1) })}
                        className="w-12 bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-200 [color-scheme:dark]" />
                    </label>
                    <button onClick={() => removeWindow(idx)} className="text-red-400/60 hover:text-red-300 px-1" title="Remove window">✕</button>
                  </div>
                ))}
              </div>
              <button onClick={() => addWindow(day)} className="text-green-400/60 hover:text-green-200 px-1 pt-0.5" title={`Add a window on ${label}`}>+ window</button>
            </div>
          ))}
          <p className="text-green-400/40 text-[10px]">Teams follow their calendar (staffed only in open windows). A source only generates arrivals when open; the × multiplier makes those arrivals faster/slower (time-varying demand). Week starts Monday 00:00.</p>
        </div>
      )}

      <div className="pt-1 border-t border-green-500/20">
        <MatrixButton onClick={() => setCreating(true)}>+ Add calendar</MatrixButton>
      </div>
      {err && <p className="text-red-400">{err}</p>}

      {creating && (
        <PromptDialog title="New calendar" message="Name this working calendar (e.g. “Business hours”, “Night shift”)."
          placeholder="e.g. Business hours" confirmLabel="Create"
          onConfirm={create} onCancel={() => setCreating(false)} />
      )}
      {renaming && (
        <PromptDialog title="Rename calendar" message="A new name for this calendar." defaultValue={renaming.name}
          confirmLabel="Save" onConfirm={(v) => rename(renaming.id, v)} onCancel={() => setRenaming(null)} />
      )}
      {deleting && (
        <ConfirmDialog title="Delete calendar" message={`Delete “${deleting.name}”? Teams/sources using it fall back to always-open.`} destructive
          onConfirm={() => remove(deleting.id)} onCancel={() => setDeleting(null)} />
      )}
    </div>
  );
}
