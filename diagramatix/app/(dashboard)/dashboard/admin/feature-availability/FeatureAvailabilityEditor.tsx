"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EnterpriseOrgsPanel } from "./EnterpriseOrgsPanel";
import { applyDependencies } from "@/app/lib/features/dependencies";

type State = "available" | "disabled" | "hidden";
interface Level { id: string; name: string; sortOrder: number }
type GateStatus = "wired" | "partial" | "unwired" | "informational";
interface GateRef { file: string; needle: string; what: string }
interface Gate { description: string; status: GateStatus; ui: GateRef[]; server: GateRef[]; alsoLimitedBy?: string[]; note?: string }
interface Feature { key: string; label: string; category: string; requires?: string[]; gate?: Gate | null }
type Matrix = Record<string, Record<string, State>>;

const STATE_OPTS: { value: State; label: string; cls: string }[] = [
  { value: "available", label: "Available", cls: "bg-green-100 text-green-800 border-green-300" },
  { value: "disabled", label: "Disabled", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  { value: "hidden", label: "Not Available", cls: "bg-gray-100 text-gray-500 border-gray-300" },
];
const clsFor = (s: State) => STATE_OPTS.find((o) => o.value === s)?.cls ?? "";

/**
 * SuperAdmin Feature Availability grid — one 3-state cell per (feature × level).
 * "Not Available" hides the feature + its options; "Disabled" shows it greyed;
 * "Available" is normal. Config is per subscription level; SuperUsers can override
 * per user from the Registered Users popover. Editable, saved to the DB matrix.
 */
export function FeatureAvailabilityEditor() {
  const router = useRouter();
  const [levels, setLevels] = useState<Level[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [matrix, setMatrix] = useState<Matrix>({});
  const [saved, setSaved] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<"group" | "availability">("group");
  const [onlyUnenforced, setOnlyUnenforced] = useState(false);

  useEffect(() => {
    fetch("/api/admin/feature-availability")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Load failed"))))
      .then((j) => { setLevels(j.levels); setFeatures(j.features); setMatrix(j.matrix); setSaved(JSON.stringify(j.matrix)); })
      .catch((e) => setMsg(e.message))
      .finally(() => setLoading(false));
  }, []);

  const dirty = useMemo(() => JSON.stringify(matrix) !== saved, [matrix, saved]);

  // "Horizontal availability" = how many subscription levels have this feature
  // set to "available" (disabled/hidden don't count). Used by the By-Availability sort.
  const availCount = useCallback((key: string) => levels.reduce((n, l) => n + (matrix[l.id]?.[key] === "available" ? 1 : 0), 0), [levels, matrix]);

  // What each level REALLY gets once prerequisites are applied (Mobile needs Process Review and Voice
  // Assist): a cell can say Available and still be off because something it needs is not.
  const effective = useMemo(() => {
    const out: Record<string, Record<string, State>> = {};
    for (const l of levels) out[l.id] = applyDependencies((matrix[l.id] ?? {}) as Record<string, State>);
    return out;
  }, [levels, matrix]);

  const shown = useMemo(
    () => (onlyUnenforced ? features.filter((f) => f.gate?.status === "unwired" || f.gate?.status === "partial") : features),
    [features, onlyUnenforced],
  );
  const gateCounts = useMemo(() => {
    const c = { wired: 0, partial: 0, unwired: 0, informational: 0 };
    for (const f of features) if (f.gate) c[f.gate.status]++;
    return c;
  }, [features]);

  const sections = useMemo<[string, Feature[]][]>(() => {
    if (sortMode === "group") {
      const byCat = new Map<string, Feature[]>();
      for (const f of shown) { (byCat.get(f.category) ?? byCat.set(f.category, []).get(f.category)!).push(f); }
      return [...byCat.entries()];
    }
    // By Availability: group features by their availability count (ascending),
    // alphabetical by feature name within each count group.
    const byCount = new Map<number, Feature[]>();
    for (const f of shown) { const c = availCount(f.key); (byCount.get(c) ?? byCount.set(c, []).get(c)!).push(f); }
    return [...byCount.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([c, feats]) => {
        const label = c === 0 ? "Not available on any level" : `Available on ${c} level${c === 1 ? "" : "s"}`;
        return [label, [...feats].sort((a, b) => a.label.localeCompare(b.label))] as [string, Feature[]];
      });
  }, [shown, sortMode, availCount]);

  function setCell(levelId: string, key: string, state: State) {
    setMatrix((m) => ({ ...m, [levelId]: { ...m[levelId], [key]: state } }));
  }
  function setAll(key: string, state: State) {
    setMatrix((m) => { const next = { ...m }; for (const l of levels) next[l.id] = { ...next[l.id], [key]: state }; return next; });
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/feature-availability", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matrix }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Save failed");
      setSaved(JSON.stringify(matrix));
      setMsg("Saved ✓");
      router.refresh();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  return (
    <div className="p-6 max-w-full">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <a href="/dashboard/admin" className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 mb-1">
            <span>&larr;</span>
            <span className="underline">SuperAdmin</span>
          </a>
          <h1 className="text-xl font-semibold text-gray-900">Feature Availability by Subscription Level</h1>
          <p className="text-xs text-gray-500 mt-0.5">Per level: <span className="text-green-700">Available</span> · <span className="text-amber-700">Disabled</span> (shown, not selectable) · <span className="text-gray-500">Not Available</span> (hidden). Override per user from Registered Users.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded border border-gray-300 overflow-hidden text-xs" role="group" aria-label="Sort features">
            <button onClick={() => setSortMode("group")}
              className={`px-2.5 py-1 ${sortMode === "group" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
              By Feature Group
            </button>
            <button onClick={() => setSortMode("availability")}
              className={`px-2.5 py-1 border-l border-gray-300 ${sortMode === "availability" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
              By Availability
            </button>
          </div>
          <label className="flex items-center gap-1 text-xs text-gray-600">
            <input type="checkbox" checked={onlyUnenforced} onChange={(e) => setOnlyUnenforced(e.target.checked)} />
            Not fully enforced only
          </label>
          {msg && <span className={`text-xs ${msg.startsWith("Saved") ? "text-green-600" : "text-red-600"}`}>{msg}</span>}
          <button onClick={save} disabled={!dirty || saving}
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-40">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      <p className="text-[11px] text-gray-500 mb-2" aria-label="Enforcement summary">
        A cell only does something if code reads it. Of {features.length} features:{" "}
        <span className="text-green-700 font-medium">{gateCounts.wired} enforced</span> ·{" "}
        <span className="text-amber-700 font-medium">{gateCounts.partial} partly</span> ·{" "}
        <span className="text-red-700 font-medium">{gateCounts.unwired} not enforced yet</span>
        {gateCounts.informational ? <> · {gateCounts.informational} informational</> : null}. Open a row's ⓘ to see where.
      </p>

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="text-xs min-w-full">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="text-left font-medium text-gray-600 px-3 py-2 w-64">Feature</th>
              {levels.map((l) => <th key={l.id} className="font-medium text-gray-600 px-2 py-2 whitespace-nowrap">{l.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {sections.map(([cat, feats]) => (
              <FeatureGroup key={cat} cat={cat} feats={feats} levels={levels} matrix={matrix} effective={effective} setCell={setCell} setAll={setAll} />
            ))}
          </tbody>
        </table>
      </div>

      <EnterpriseOrgsPanel />
    </div>
  );
}

const STATUS_BADGE: Record<GateStatus, { label: string; cls: string }> = {
  wired: { label: "enforced", cls: "bg-green-100 text-green-800" },
  partial: { label: "partly", cls: "bg-amber-100 text-amber-800" },
  unwired: { label: "not enforced yet", cls: "bg-red-100 text-red-800" },
  informational: { label: "info only", cls: "bg-gray-100 text-gray-600" },
};

/** The "where is this enforced" panel under a feature row. */
function GateDetail({ f, colSpan }: { f: Feature; colSpan: number }) {
  const g = f.gate;
  if (!g) return null;
  return (
    <tr className="bg-blue-50/40" aria-label={`Where ${f.label} is enforced`}>
      <td colSpan={colSpan} className="px-4 py-2 text-[11px] text-gray-700">
        <div className="mb-1">{g.description}</div>
        {g.ui.length > 0 && <div><b>Screens:</b> {g.ui.map((r) => r.what).join(" · ")}</div>}
        {g.server.length > 0 && <div><b>Server:</b> {g.server.map((r) => r.what).join(" · ")}</div>}
        {g.status === "unwired" && <div className="text-red-700"><b>Nothing reads this cell yet</b> — changing it changes nothing.</div>}
        {f.requires && f.requires.length > 0 && <div><b>Needs:</b> {f.requires.join(", ")} (only as available as the weakest of them)</div>}
        {g.alsoLimitedBy && g.alsoLimitedBy.length > 0 && <div><b>Also limited by (not this cell):</b> {g.alsoLimitedBy.join(" · ")}</div>}
        {g.note && <div className="text-gray-500 mt-0.5">{g.note}</div>}
      </td>
    </tr>
  );
}

function FeatureGroup({ cat, feats, levels, matrix, effective, setCell, setAll }: {
  cat: string; feats: Feature[]; levels: Level[]; matrix: Matrix; effective: Matrix;
  setCell: (l: string, k: string, s: State) => void; setAll: (k: string, s: State) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setOpen((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <>
      <tr className="bg-gray-100"><td colSpan={levels.length + 1} className="px-3 py-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{cat}</td></tr>
      {feats.map((f) => (
        <Fragment key={f.key}>
        <tr className="border-t border-gray-100 hover:bg-gray-50/50">
          <td className="px-3 py-1.5 text-gray-800">
            <span title={f.key}>{f.label}</span>
            {f.gate && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-medium ${STATUS_BADGE[f.gate.status].cls}`}>{STATUS_BADGE[f.gate.status].label}</span>
            )}
            {f.requires && f.requires.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] bg-blue-100 text-blue-800" title="Only as available as the weakest of these">needs {f.requires.length}</span>}
            <button onClick={() => toggle(f.key)} className="ml-1 text-[11px] text-gray-400 hover:text-blue-600" title="Where is this enforced?" aria-label={`Where ${f.label} is enforced`}>ⓘ</button>
            <button onClick={() => setAll(f.key, "available")} className="ml-2 text-[10px] text-blue-500 hover:underline" title="Set Available for all levels">all✓</button>
            <button onClick={() => setAll(f.key, "hidden")} className="ml-1 text-[10px] text-gray-400 hover:underline" title="Set Not Available for all levels">all✕</button>
          </td>
          {levels.map((l) => {
            const st = (matrix[l.id]?.[f.key] ?? "hidden") as State;
            const eff = (effective[l.id]?.[f.key] ?? st) as State;
            return (
              <td key={l.id} className="px-1.5 py-1 text-center">
                <select value={st} onChange={(e) => setCell(l.id, f.key, e.target.value as State)}
                  className={`text-[11px] rounded border px-1 py-0.5 ${clsFor(st)}`}>
                  {STATE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {eff !== st && (
                  <div className="text-[9px] text-amber-700 mt-0.5" title="A feature it needs is not available at this level">
                    in effect: {STATE_OPTS.find((o) => o.value === eff)?.label}
                  </div>
                )}
              </td>
            );
          })}
        </tr>
        {open.has(f.key) && <GateDetail f={f} colSpan={levels.length + 1} />}
        </Fragment>
      ))}
    </>
  );
}
