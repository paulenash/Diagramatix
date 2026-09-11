"use client";

/**
 * Maintain the org's master Skills list.
 *
 * Two things this screen has to do that a plain CRUD table would not:
 *
 * 1. **Retire rather than delete, by default.** A skill already written onto a
 *    person or a task must keep resolving; deleting one silently removes a
 *    constraint from a model that still has it, and the run then reports better
 *    numbers than the process can achieve. So Delete asks the server first, and
 *    the server refuses while the skill is in use — with the count, because
 *    "it's used" and "it's used 47 times" are different decisions.
 *
 * 2. **Adopt the orphans.** The catalog arrived after the data. Every existing
 *    model holds free text that predates it, and a vocabulary that half the
 *    models do not use is worse than no vocabulary — so what is already out
 *    there is shown, and can be pulled in.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";

interface Skill {
  id: string; name: string; category: string | null;
  description: string | null; active: boolean; sortOrder: number;
}

const input = "text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500";

export function SkillsClient({ canEdit }: { canEdit: boolean }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [orphans, setOrphans] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showRetired, setShowRetired] = useState(false);
  const [filter, setFilter] = useState("");

  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ skill: Skill; inUse: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/skills?includeInactive=1&orphans=1");
      if (!r.ok) { setErr("Could not load the Skills list."); return; }
      const d = await r.json();
      setSkills(d.skills ?? []);
      setOrphans(d.orphans ?? []);
      setErr(null);
    } catch { setErr("Could not reach the server."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const add = async (name: string, category?: string) => {
    if (!name.trim()) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await fetch("/api/skills", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category: category || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error ?? "Could not add that skill."); return; }
      setNewName(""); setNewCategory("");
      setMsg(`Added "${d.skill.name}".`);
      await load();
    } finally { setBusy(false); }
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/skills", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error ?? "Could not save that change."); return; }
      await load();
    } finally { setBusy(false); }
  };

  /** Ask the server first — it knows how many places use the skill. */
  const tryDelete = async (skill: Skill) => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await fetch(`/api/skills?id=${encodeURIComponent(skill.id)}`, { method: "DELETE" });
      if (r.ok) { setMsg(`Deleted "${skill.name}".`); await load(); return; }
      const d = await r.json().catch(() => ({}));
      if (r.status === 409) { setConfirmDelete({ skill, inUse: d.inUse ?? 0 }); return; }
      setErr(d.error ?? "Could not delete that skill.");
    } finally { setBusy(false); }
  };

  const forceDelete = async (skill: Skill) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/skills?id=${encodeURIComponent(skill.id)}&force=1`, { method: "DELETE" });
      if (r.ok) { setMsg(`Deleted "${skill.name}" — references to it are now unresolved.`); await load(); }
      else setErr("Could not delete that skill.");
    } finally { setBusy(false); setConfirmDelete(null); }
  };

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return skills
      .filter((s) => showRetired || s.active)
      .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.category ?? "").toLowerCase().includes(q));
  }, [skills, showRetired, filter]);

  const byCategory = useMemo(() => {
    const m = new Map<string, Skill[]>();
    for (const s of visible) {
      const k = s.category?.trim() || "Uncategorised";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible]);

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-lg font-semibold text-gray-900 mb-1">Skills</h1>
        <p className="text-xs text-gray-600 mb-4 max-w-2xl">
          The master list your organisation draws on. A person on a team holds skills from this list;
          a task requires them. Only someone on the task&rsquo;s team who holds every required skill can do the work,
          which is how a simulation shows a queue forming behind the one accredited person rather than behind
          a headcount.
        </p>

        {!canEdit && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mb-3">
            You can see the list but not change it — only an organisation admin can.
          </p>
        )}
        {err && <p className="text-xs text-red-600 mb-2">{err}</p>}
        {msg && <p className="text-xs text-green-700 mb-2">{msg}</p>}

        {/* Add */}
        {canEdit && (
          <div className="flex items-end gap-2 mb-4 bg-white border border-gray-200 rounded p-3">
            <div className="flex-1 min-w-0">
              <label className="block text-[11px] font-medium text-gray-700 mb-0.5">New skill</label>
              <input className={`${input} w-full`} value={newName} placeholder="e.g. Compliance Accreditation"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void add(newName, newCategory); }} />
            </div>
            <div className="w-44">
              <label className="block text-[11px] font-medium text-gray-700 mb-0.5">Category <span className="font-normal text-gray-400">(optional)</span></label>
              <input className={`${input} w-full`} value={newCategory} placeholder="Authority"
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void add(newName, newCategory); }} />
            </div>
            <button onClick={() => void add(newName, newCategory)} disabled={busy || !newName.trim()}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">
              Add
            </button>
          </div>
        )}

        {/* Orphans — what the models already say */}
        {orphans.length > 0 && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded p-3">
            <p className="text-xs font-medium text-amber-900 mb-1">
              {orphans.length} skill{orphans.length === 1 ? "" : "s"} already used by people or tasks, but not in this list
            </p>
            <p className="text-[11px] text-amber-800 mb-2">
              These came from models written before the list existed, or from an ArchiMate fill.
              They still work — nothing has changed for them — but they cannot be picked from a dropdown until they are here.
            </p>
            <div className="flex flex-wrap gap-1">
              {orphans.map((o) => (
                <button key={o} disabled={!canEdit || busy} onClick={() => void add(o)}
                  title={canEdit ? `Add "${o}" to the list` : "Only an organisation admin can add skills"}
                  className="text-[11px] px-2 py-0.5 rounded border border-amber-300 bg-white text-amber-900 hover:bg-amber-100 disabled:opacity-50">
                  + {o}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="flex items-center gap-3 mb-2">
          <input className={`${input} flex-1`} placeholder="Filter by name or category…"
            value={filter} onChange={(e) => setFilter(e.target.value)} />
          <label className="flex items-center gap-1.5 text-[11px] text-gray-600 shrink-0">
            <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />
            Show retired
          </label>
        </div>

        {loading ? (
          <p className="text-xs text-gray-500">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-xs text-gray-500">
            {skills.length === 0 ? "No skills yet — add the first one above." : "Nothing matches that filter."}
          </p>
        ) : (
          byCategory.map(([category, rows]) => (
            <div key={category} className="mb-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">{category}</p>
              <div className="bg-white border border-gray-200 rounded divide-y divide-gray-100">
                {rows.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 px-3 py-1.5">
                    <span className={`text-xs flex-1 min-w-0 truncate ${s.active ? "text-gray-900" : "text-gray-400 line-through"}`}
                      title={s.description ?? undefined}>
                      {s.name}
                      {s.description && <span className="text-gray-400 font-normal"> — {s.description}</span>}
                    </span>
                    {!s.active && <span className="text-[10px] text-gray-400 shrink-0">retired</span>}
                    {canEdit && (
                      <>
                        <button onClick={() => void patch(s.id, { active: !s.active })} disabled={busy}
                          title={s.active ? "Retire: stops being offered, but still resolves where it is already used" : "Offer this skill again"}
                          className="text-[11px] text-gray-500 hover:text-blue-600 disabled:opacity-50 shrink-0">
                          {s.active ? "Retire" : "Restore"}
                        </button>
                        <button onClick={() => void tryDelete(s)} disabled={busy}
                          title="Delete permanently"
                          className="text-[11px] text-gray-400 hover:text-red-600 disabled:opacity-50 shrink-0">
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={`"${confirmDelete.skill.name}" is in use`}
          message={
            `${confirmDelete.inUse} person or task still names this skill.\n\n` +
            "Retiring it is almost always what you want: it stops being offered, but everywhere it is already " +
            "used keeps working.\n\n" +
            "Deleting it leaves those references unresolved — a task will still require a skill the list no longer " +
            "knows, and nobody will be shown as holding it."
          }
          confirmLabel="Delete anyway"
          cancelLabel="Cancel"
          destructive
          onConfirm={() => void forceDelete(confirmDelete.skill)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
