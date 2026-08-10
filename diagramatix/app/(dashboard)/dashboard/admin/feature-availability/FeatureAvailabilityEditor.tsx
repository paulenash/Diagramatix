"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EnterpriseOrgsPanel } from "./EnterpriseOrgsPanel";

type State = "available" | "disabled" | "hidden";
interface Level { id: string; name: string; sortOrder: number }
interface Feature { key: string; label: string; category: string }
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

  const sections = useMemo<[string, Feature[]][]>(() => {
    if (sortMode === "group") {
      const byCat = new Map<string, Feature[]>();
      for (const f of features) { (byCat.get(f.category) ?? byCat.set(f.category, []).get(f.category)!).push(f); }
      return [...byCat.entries()];
    }
    // By Availability: group features by their availability count (ascending),
    // alphabetical by feature name within each count group.
    const byCount = new Map<number, Feature[]>();
    for (const f of features) { const c = availCount(f.key); (byCount.get(c) ?? byCount.set(c, []).get(c)!).push(f); }
    return [...byCount.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([c, feats]) => {
        const label = c === 0 ? "Not available on any level" : `Available on ${c} level${c === 1 ? "" : "s"}`;
        return [label, [...feats].sort((a, b) => a.label.localeCompare(b.label))] as [string, Feature[]];
      });
  }, [features, sortMode, availCount]);

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
          {msg && <span className={`text-xs ${msg.startsWith("Saved") ? "text-green-600" : "text-red-600"}`}>{msg}</span>}
          <button onClick={save} disabled={!dirty || saving}
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-40">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

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
              <FeatureGroup key={cat} cat={cat} feats={feats} levels={levels} matrix={matrix} setCell={setCell} setAll={setAll} />
            ))}
          </tbody>
        </table>
      </div>

      <EnterpriseOrgsPanel />
    </div>
  );
}

function FeatureGroup({ cat, feats, levels, matrix, setCell, setAll }: {
  cat: string; feats: Feature[]; levels: Level[]; matrix: Matrix;
  setCell: (l: string, k: string, s: State) => void; setAll: (k: string, s: State) => void;
}) {
  return (
    <>
      <tr className="bg-gray-100"><td colSpan={levels.length + 1} className="px-3 py-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{cat}</td></tr>
      {feats.map((f) => (
        <tr key={f.key} className="border-t border-gray-100 hover:bg-gray-50/50">
          <td className="px-3 py-1.5 text-gray-800">
            <span title={f.key}>{f.label}</span>
            <button onClick={() => setAll(f.key, "available")} className="ml-2 text-[10px] text-blue-500 hover:underline" title="Set Available for all levels">all✓</button>
            <button onClick={() => setAll(f.key, "hidden")} className="ml-1 text-[10px] text-gray-400 hover:underline" title="Set Not Available for all levels">all✕</button>
          </td>
          {levels.map((l) => {
            const st = (matrix[l.id]?.[f.key] ?? "hidden") as State;
            return (
              <td key={l.id} className="px-1.5 py-1 text-center">
                <select value={st} onChange={(e) => setCell(l.id, f.key, e.target.value as State)}
                  className={`text-[11px] rounded border px-1 py-0.5 ${clsFor(st)}`}>
                  {STATE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
