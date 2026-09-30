"use client";

import { useEffect, useMemo, useState } from "react";
import { FEATURES } from "@/app/lib/features/registry";
import type { FeatureRow, LimitRow, LimitValue } from "@/app/lib/features/userOverrides";

/**
 * Customise ONE person (SuperAdmin ▸ Registered Users): their limits, settings and
 * feature availability, WITHOUT changing the plan they are on — so nobody else on
 * that plan is affected — and revert them to the plan. In addition to Grant comp /
 * Revoke comp, which stays where it is.
 *
 * Every row shows: the PLAN's value · the override (if any) · what is IN EFFECT.
 * An override that raises access which the person's plan now gives anyway is marked
 * "covered" (kept, doing nothing) — the rule is in app/lib/features/userOverrides.ts.
 * Saved through /api/admin/users/[id]/overrides; a note (why) is required.
 */
type Snapshot = {
  level: { id: string; name: string };
  limits: LimitRow[];
  features: FeatureRow[];
  note: string | null;
  expiresAt: string | null;
  expired: boolean;
  customised: boolean;
};
type LimitDraft = { mode: "plan" | "value" | "unlimited" | "on" | "off"; text: string };
type FState = "available" | "disabled" | "hidden";
const FEATURE_LABEL = Object.fromEntries(FEATURES.map((f) => [f.key, f.label]));
const STATE_LABEL: Record<FState, string> = { available: "Available", disabled: "Disabled", hidden: "Not Available" };

const show = (v: LimitValue | undefined, kind: "count" | "switch") => (v === undefined ? "—" : kind === "switch" ? (v ? "on" : "off") : v === null ? "unlimited" : String(v));
const draftOf = (r: LimitRow): LimitDraft => {
  if (r.override === undefined) return { mode: "plan", text: "" };
  if (r.kind === "switch") return { mode: r.override ? "on" : "off", text: "" };
  return r.override === null ? { mode: "unlimited", text: "" } : { mode: "value", text: String(r.override) };
};

export function UserOverridesPanel({ userId, userName, onClose, onChanged }: { userId: string; userName: string; onClose: () => void; onChanged?: () => void }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [limits, setLimits] = useState<Record<string, LimitDraft>>({});
  const [features, setFeatures] = useState<Record<string, FState | "inherit">>({});
  const [note, setNote] = useState("");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmRevert, setConfirmRevert] = useState(false);

  function load(s: Snapshot) {
    setSnap(s);
    setLimits(Object.fromEntries(s.limits.map((r) => [r.key, draftOf(r)])));
    setFeatures(Object.fromEntries(s.features.map((r) => [r.key, r.override ?? "inherit"])));
    setNote(s.note ?? "");
    setExpires(s.expiresAt ? s.expiresAt.slice(0, 10) : "");
  }
  useEffect(() => {
    fetch(`/api/admin/users/${userId}/overrides`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Load failed"))))
      .then(load)
      .catch((e) => setMsg(e.message));
  }, [userId]);

  const groups = useMemo(() => {
    const m = new Map<string, typeof FEATURES>();
    for (const f of FEATURES) (m.get(f.category) ?? m.set(f.category, []).get(f.category)!).push(f);
    return [...m.entries()];
  }, []);

  /** Only what the SuperAdmin changed goes to the server. */
  function body() {
    const l: Record<string, unknown> = {};
    for (const r of snap!.limits) {
      const d = limits[r.key], was = draftOf(r);
      if (d.mode === was.mode && d.text === was.text) continue;
      l[r.key] = d.mode === "plan" ? "inherit" : d.mode === "unlimited" ? null : d.mode === "on" ? true : d.mode === "off" ? false : d.text.trim();
    }
    const f: Record<string, unknown> = {};
    for (const r of snap!.features) {
      const d = features[r.key];
      if (d !== (r.override ?? "inherit")) f[r.key] = d;
    }
    return { limits: l, features: f, note, expiresAt: expires ? new Date(expires + "T23:59:59").toISOString() : null };
  }
  const dirty = snap ? (() => { const b = body(); return Object.keys(b.limits).length + Object.keys(b.features).length > 0 || note !== (snap.note ?? "") || expires !== (snap.expiresAt ? snap.expiresAt.slice(0, 10) : ""); })() : false;

  async function send(method: "PUT" | "DELETE") {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/overrides`, { method, ...(method === "PUT" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body()) } : {}) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(j.error ?? `Failed (${res.status})`); return; }
      load(j); setConfirmRevert(false); setMsg(method === "DELETE" ? "Reverted to the plan ✓" : "Saved ✓"); onChanged?.();
    } finally { setBusy(false); }
  }

  const cell = "px-2 py-1 text-xs";
  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" role="dialog" aria-label="Customise this user" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-200 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Customise — {userName}</h2>
            <p className="text-[11px] text-gray-500 max-w-2xl">
              Change this person&apos;s limits, settings and features <b>without changing their plan</b>{snap ? <> ({snap.level.name}) </> : " "}—
              nobody else on the plan is affected. A raise the plan later gives anyway steps aside; a restriction stays; everything stops at the expiry.
              Grant comp / Revoke comp (the free upgrade) is separate and unchanged.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-xl leading-none px-1" aria-label="Close">×</button>
        </div>

        <div className="overflow-y-auto px-5 py-3 flex-1">
          {!snap ? <p className="text-sm text-gray-500">{msg ?? "Loading…"}</p> : (
            <>
              {snap.customised && (
                <p className="mb-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  This person is customised{snap.expired ? " — the expiry has passed, so the overrides no longer apply" : ""}.
                </p>
              )}

              <h3 className="text-xs font-semibold text-gray-700 mt-1 mb-1">Limits &amp; settings</h3>
              <table className="w-full text-left mb-4" aria-label="Limits and settings">
                <thead><tr className="text-[10px] uppercase text-gray-400"><th className={cell}>Limit</th><th className={cell}>Plan</th><th className={cell}>This person</th><th className={cell}>In effect</th><th className={cell} /></tr></thead>
                <tbody>
                  {snap.limits.map((r) => {
                    const d = limits[r.key] ?? { mode: "plan", text: "" };
                    return (
                      <tr key={r.key} className={`border-t border-gray-100 ${r.custom ? "bg-amber-50/40" : ""}`}>
                        <td className={cell}>{r.label}{r.covered && <span className="ml-1 text-[10px] text-gray-500 italic">(the plan now covers this)</span>}</td>
                        <td className={`${cell} text-gray-500`}>{show(r.plan, r.kind)}</td>
                        <td className={cell}>
                          {r.kind === "switch" ? (
                            <select value={d.mode} onChange={(e) => setLimits((s) => ({ ...s, [r.key]: { mode: e.target.value as LimitDraft["mode"], text: "" } }))} className="border border-gray-300 rounded px-1 py-0.5 text-xs" aria-label={r.label}>
                              <option value="plan">plan</option><option value="on">on</option><option value="off">off</option>
                            </select>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <input value={d.mode === "value" ? d.text : ""} placeholder={d.mode === "unlimited" ? "unlimited" : "plan"} disabled={d.mode === "unlimited"}
                                onChange={(e) => setLimits((s) => ({ ...s, [r.key]: e.target.value.trim() === "" ? { mode: "plan", text: "" } : { mode: "value", text: e.target.value } }))}
                                className="w-20 border border-gray-300 rounded px-1 py-0.5 text-xs" inputMode="numeric" aria-label={r.label} />
                              <label className="text-[10px] text-gray-500 inline-flex items-center gap-0.5">
                                <input type="checkbox" checked={d.mode === "unlimited"} onChange={(e) => setLimits((s) => ({ ...s, [r.key]: e.target.checked ? { mode: "unlimited", text: "" } : { mode: "plan", text: "" } }))} />unlimited
                              </label>
                            </span>
                          )}
                        </td>
                        <td className={`${cell} font-medium ${r.custom && !r.covered ? "text-amber-800" : "text-gray-700"}`}>{show(r.effective, r.kind)}</td>
                        <td className={cell}>{d.mode !== "plan" && <button onClick={() => setLimits((s) => ({ ...s, [r.key]: { mode: "plan", text: "" } }))} className="text-[10px] text-blue-600 hover:underline">Revert</button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <h3 className="text-xs font-semibold text-gray-700 mb-1">Features</h3>
              <table className="w-full text-left mb-4" aria-label="Features">
                <thead><tr className="text-[10px] uppercase text-gray-400"><th className={cell}>Feature</th><th className={cell}>Plan</th><th className={cell}>This person</th><th className={cell}>In effect</th><th className={cell} /></tr></thead>
                <tbody>
                  {groups.map(([cat, feats]) => (
                    <FeatureGroup key={cat} cat={cat} keys={feats.map((f) => f.key)} rows={snap.features} draft={features} setDraft={setFeatures} cell={cell} />
                  ))}
                </tbody>
              </table>

              <h3 className="text-xs font-semibold text-gray-700 mb-1">Why, and until when</h3>
              <label className="block text-[11px] text-gray-600 mb-0.5" htmlFor="ov-note">Note (required — the audit trail)</label>
              <textarea id="ov-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full border border-gray-300 rounded px-2 py-1 text-xs mb-2" placeholder="e.g. Pilot with Acme — 200 projects agreed until the end of the engagement" />
              <label className="text-[11px] text-gray-600 mr-2" htmlFor="ov-exp">Expires (optional — reverts by itself)</label>
              <input id="ov-exp" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className="border border-gray-300 rounded px-1.5 py-0.5 text-xs" />
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex items-center gap-2 flex-wrap">
          <button onClick={() => void send("PUT")} disabled={busy || !dirty} className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">{busy ? "Saving…" : "Save"}</button>
          {snap?.customised && !confirmRevert && (
            <button onClick={() => setConfirmRevert(true)} disabled={busy} className="px-3 py-1.5 text-sm rounded border border-red-300 text-red-700 hover:bg-red-50">Revert all to the plan</button>
          )}
          {confirmRevert && (
            <span className="text-xs text-red-800 inline-flex items-center gap-2">
              Revert everything for this person (limits, features, note, expiry — including any speech grant) to their plan?
              <button onClick={() => void send("DELETE")} disabled={busy} className="px-2 py-1 rounded bg-red-600 text-white">Yes, revert</button>
              <button onClick={() => setConfirmRevert(false)} className="px-2 py-1 rounded border border-gray-300 text-gray-700">No</button>
            </span>
          )}
          {msg && <span className={`text-xs ${msg.includes("✓") ? "text-green-700" : "text-red-700"}`}>{msg}</span>}
          <button onClick={onClose} className="ml-auto px-3 py-1.5 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50">Close</button>
        </div>
      </div>
    </div>
  );
}

function FeatureGroup({ cat, keys, rows, draft, setDraft, cell }: {
  cat: string; keys: string[]; rows: FeatureRow[]; draft: Record<string, FState | "inherit">;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, FState | "inherit">>>; cell: string;
}) {
  return (
    <>
      <tr className="bg-gray-100"><td colSpan={5} className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{cat}</td></tr>
      {keys.map((k) => {
        const r = rows.find((x) => x.key === k);
        if (!r) return null;
        const d = draft[k] ?? "inherit";
        return (
          <tr key={k} className={`border-t border-gray-100 ${r.custom ? "bg-amber-50/40" : ""}`}>
            <td className={cell}>{FEATURE_LABEL[k] ?? k}{r.covered && <span className="ml-1 text-[10px] text-gray-500 italic">(the plan now covers this)</span>}</td>
            <td className={`${cell} text-gray-500`}>{STATE_LABEL[r.plan]}</td>
            <td className={cell}>
              <select value={d} onChange={(e) => setDraft((s) => ({ ...s, [k]: e.target.value as FState | "inherit" }))} className="border border-gray-300 rounded px-1 py-0.5 text-xs" aria-label={FEATURE_LABEL[k] ?? k}>
                <option value="inherit">plan</option>
                <option value="available">Available</option>
                <option value="disabled">Disabled</option>
                <option value="hidden">Not Available</option>
              </select>
            </td>
            <td className={`${cell} font-medium ${r.custom && !r.covered ? "text-amber-800" : "text-gray-700"}`}>{STATE_LABEL[r.effective]}</td>
            <td className={cell}>{d !== "inherit" && <button onClick={() => setDraft((s) => ({ ...s, [k]: "inherit" }))} className="text-[10px] text-blue-600 hover:underline">Revert</button>}</td>
          </tr>
        );
      })}
    </>
  );
}
