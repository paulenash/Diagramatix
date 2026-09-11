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
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";

interface Skill {
  id: string; name: string; category: string | null;
  description: string | null; active: boolean; sortOrder: number;
}

const input = "text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500";

export function SkillsClient({
  orgId, orgName, isSuperAdmin, orgs, canEdit, backHref,
}: {
  orgId: string; orgName: string; isSuperAdmin: boolean;
  orgs: { id: string; name: string }[];
  canEdit: boolean; backHref: string;
}) {
  const router = useRouter();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [orphans, setOrphans] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showRetired, setShowRetired] = useState(false);
  const [filter, setFilter] = useState("");

  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newDescription, setNewDescription] = useState("");
  // Which row is open for editing, and the draft being typed into it.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ category: string; description: string }>({ category: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ skill: Skill; inUse: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/skills?includeInactive=1&orphans=1&orgId=${encodeURIComponent(orgId)}`);
      if (!r.ok) { setErr("Could not load the Skills list."); return; }
      const d = await r.json();
      setSkills(d.skills ?? []);
      setOrphans(d.orphans ?? []);
      setErr(null);
    } catch { setErr("Could not reach the server."); }
    finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  const add = async (name: string, category?: string, description?: string) => {
    if (!name.trim()) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await fetch("/api/skills", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category: category || null, description: description || null, orgId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error ?? "Could not add that skill."); return; }
      setNewName(""); setNewCategory(""); setNewDescription("");
      setMsg(`Added "${d.skill.name}".`);
      await load();
    } finally { setBusy(false); }
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/skills", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body, orgId }),
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
      const r = await fetch(`/api/skills?id=${encodeURIComponent(skill.id)}&orgId=${encodeURIComponent(orgId)}`, { method: "DELETE" });
      if (r.ok) { setMsg(`Deleted "${skill.name}".`); await load(); return; }
      const d = await r.json().catch(() => ({}));
      if (r.status === 409) { setConfirmDelete({ skill, inUse: d.inUse ?? 0 }); return; }
      setErr(d.error ?? "Could not delete that skill.");
    } finally { setBusy(false); }
  };

  const forceDelete = async (skill: Skill) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/skills?id=${encodeURIComponent(skill.id)}&force=1&orgId=${encodeURIComponent(orgId)}`, { method: "DELETE" });
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
        <button onClick={() => router.push(backHref)} className="text-xs text-gray-500 hover:text-gray-800 mb-2">&larr; Back</button>
        <div className="flex items-center justify-between gap-3 mb-1">
          <h1 className="text-lg font-semibold text-gray-900">
            Skills <span className="font-normal text-gray-500 text-sm">&middot; {orgName}</span>
          </h1>
          {isSuperAdmin && orgs.length > 1 && (
            // Naming the org in the heading as well as the picker is deliberate:
            // a SuperAdmin editing the wrong org's vocabulary would look exactly
            // like editing the right one.
            <select
              value={orgId}
              onChange={(e) => router.push(`/dashboard/admin/skills?orgId=${encodeURIComponent(e.target.value)}&from=${encodeURIComponent(backHref)}`)}
              className={`${input} w-56`}
              title="Maintain another organisation's Skills list"
            >
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
        </div>
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
          <div className="mb-4 bg-white border border-gray-200 rounded p-3">
            <div className="flex items-end gap-2">
              <div className="flex-1 min-w-0">
                <label className="block text-[11px] font-medium text-gray-700 mb-0.5">New skill</label>
                <input className={`${input} w-full`} value={newName} placeholder="e.g. Compliance Accreditation"
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void add(newName, newCategory, newDescription); }} />
              </div>
              <div className="w-44">
                <label className="block text-[11px] font-medium text-gray-700 mb-0.5">Category <span className="font-normal text-gray-400">(optional)</span></label>
                <input className={`${input} w-full`} value={newCategory} placeholder="Authority"
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void add(newName, newCategory, newDescription); }} />
              </div>
              <button onClick={() => void add(newName, newCategory, newDescription)} disabled={busy || !newName.trim()}
                className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">
                Add
              </button>
            </div>
            {/* Full width, and prompted with the question a description has to
                answer. "Who qualifies" is the only thing a skill is ever asked —
                the engine uses it to decide who may take a task — so a name
                whose holder is ambiguous is one two people will apply
                differently. */}
            <div className="mt-2">
              <label className="block text-[11px] font-medium text-gray-700 mb-0.5">
                Description <span className="font-normal text-gray-400">&mdash; who qualifies?</span>
              </label>
              <input className={`${input} w-full`} value={newDescription}
                placeholder="e.g. Formally accredited to sign off a regulated check."
                onChange={(e) => setNewDescription(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void add(newName, newCategory, newDescription); }} />
            </div>
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
                  <div key={s.id} className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs flex-1 min-w-0 truncate ${s.active ? "text-gray-900" : "text-gray-400 line-through"}`}
                        title={s.description ?? undefined}>
                        {s.name}
                        {s.description
                          ? <span className="text-gray-400 font-normal"> — {s.description}</span>
                          : <span className="text-amber-500/70 font-normal italic"> — no description</span>}
                      </span>
                      {!s.active && <span className="text-[10px] text-gray-400 shrink-0">retired</span>}
                      {canEdit && (
                        <>
                          <button
                            onClick={() => {
                              if (editing === s.id) { setEditing(null); return; }
                              setEditing(s.id);
                              setDraft({ category: s.category ?? "", description: s.description ?? "" });
                            }}
                            disabled={busy}
                            title="Edit the category and description"
                            className="text-[11px] text-gray-500 hover:text-blue-600 disabled:opacity-50 shrink-0">
                            {editing === s.id ? "Close" : "Edit"}
                          </button>
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

                    {editing === s.id && canEdit && (
                      // The NAME is not editable here on purpose. Skills are
                      // referenced by name from team members and task
                      // requirements, so renaming one would strand every place
                      // that uses it — silently, because a task requiring a name
                      // nothing holds simply never starts. Retire it and add the
                      // replacement instead.
                      <div className="mt-1.5 flex items-end gap-2 bg-gray-50 border border-gray-200 rounded p-2">
                        <div className="w-44">
                          <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Category</label>
                          <input className={`${input} w-full`} value={draft.category}
                            onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <label className="block text-[10px] font-medium text-gray-600 mb-0.5">
                            Description <span className="font-normal text-gray-400">&mdash; who qualifies?</span>
                          </label>
                          <input className={`${input} w-full`} value={draft.description}
                            placeholder="e.g. Formally accredited to sign off a regulated check."
                            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { void patch(s.id, { category: draft.category, description: draft.description }).then(() => setEditing(null)); }
                              if (e.key === "Escape") setEditing(null);
                            }} />
                        </div>
                        <button
                          onClick={() => void patch(s.id, { category: draft.category, description: draft.description }).then(() => setEditing(null))}
                          disabled={busy}
                          className="px-2.5 py-1 text-[11px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">
                          Save
                        </button>
                        <button onClick={() => setEditing(null)}
                          className="px-2.5 py-1 text-[11px] font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-100">
                          Cancel
                        </button>
                      </div>
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
