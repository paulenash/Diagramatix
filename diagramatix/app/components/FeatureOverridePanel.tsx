"use client";

import { useEffect, useMemo, useState } from "react";
import { FEATURES } from "@/app/lib/features/registry";

type State = "inherit" | "available" | "disabled" | "hidden";
const OPTS: { value: State; label: string }[] = [
  { value: "inherit", label: "Inherit (level default)" },
  { value: "available", label: "Available" },
  { value: "disabled", label: "Disabled" },
  { value: "hidden", label: "Not Available" },
];

/**
 * SuperUser per-user feature-availability overrides. Each feature can Inherit the
 * user's subscription-level matrix, or be forced Available / Disabled / Not
 * Available for this user only. Saved to User.featureOverrides via
 * /api/admin/users/[id]/features (only non-inherit keys are stored).
 */
export function FeatureOverridePanel({ userId, userName, onClose }: { userId: string; userName: string; onClose: () => void }) {
  const [state, setState] = useState<Record<string, State>>({});
  const [saved, setSaved] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/users/${userId}/features`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Load failed"))))
      .then((j) => {
        const ov = (j.overrides ?? {}) as Record<string, State>;
        const full: Record<string, State> = {};
        for (const f of FEATURES) full[f.key] = ov[f.key] ?? "inherit";
        setState(full); setSaved(JSON.stringify(full));
      })
      .catch((e) => setMsg(e.message))
      .finally(() => setLoading(false));
  }, [userId]);

  const dirty = useMemo(() => JSON.stringify(state) !== saved, [state, saved]);
  const grouped = useMemo(() => {
    const m = new Map<string, typeof FEATURES>();
    for (const f of FEATURES) (m.get(f.category) ?? m.set(f.category, []).get(f.category)!).push(f);
    return [...m.entries()];
  }, []);

  async function save() {
    setSaving(true); setMsg(null);
    const overrides: Record<string, string> = {};
    for (const [k, v] of Object.entries(state)) if (v !== "inherit") overrides[k] = v;
    try {
      const r = await fetch(`/api/admin/users/${userId}/features`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ overrides }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Save failed");
      setSaved(JSON.stringify(state)); setMsg("Saved ✓");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Feature overrides</h2>
            <p className="text-[11px] text-gray-500 truncate max-w-[20rem]">{userName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? <p className="text-sm text-gray-500">Loading…</p> : grouped.map(([cat, feats]) => (
            <div key={cat} className="mb-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{cat}</p>
              {feats.map((f) => (
                <div key={f.key} className="flex items-center justify-between gap-2 py-1">
                  <span className="text-xs text-gray-700 truncate" title={f.key}>{f.label}</span>
                  <select value={state[f.key] ?? "inherit"} onChange={(e) => setState((s) => ({ ...s, [f.key]: e.target.value as State }))}
                    className={`text-[11px] border rounded px-1 py-0.5 shrink-0 ${state[f.key] && state[f.key] !== "inherit" ? "border-blue-300 bg-blue-50" : "border-gray-300"}`}>
                    {OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-200">
          {msg && <span className={`text-xs ${msg.startsWith("Saved") ? "text-green-600" : "text-red-600"}`}>{msg}</span>}
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50">Close</button>
            <button onClick={save} disabled={!dirty || saving} className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-40">{saving ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
