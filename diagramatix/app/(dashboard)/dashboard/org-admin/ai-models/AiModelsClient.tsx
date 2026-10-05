"use client";

import { useCallback, useEffect, useState } from "react";

type Purpose = "default" | "vision" | "command";
const PURPOSES: { key: Purpose; title: string; help: string }[] = [
  { key: "default", title: "Default", help: "The model AI Generate and the other AI features run on for your people." },
  { key: "vision", title: "Vision", help: "The model that reads an image when someone generates a diagram from a picture." },
  { key: "command", title: "Voice Assist Command", help: "The small, quick model that rewrites one spoken sentence into a command." },
];
interface Model { id: string; label: string }
interface PurposeInfo { offered: Model[]; chosen: string | null; inForce: Model }

/**
 * OrgAdmin → AI Models. Choose, for each purpose, the model your organisation runs on — from the list your SuperAdmin offered you
 * (Paul, 2026-10-05). Ordinary users never choose a model and never see one: only an OrgAdmin and a SuperAdmin see this page.
 */
export function AiModelsClient() {
  const [data, setData] = useState<Record<Purpose, PurposeInfo> | null>(null);
  const [draft, setDraft] = useState<Partial<Record<Purpose, string>>>({});
  const [busy, setBusy] = useState<Purpose | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/org-admin/ai-models", { cache: "no-store" });
    if (!r.ok) { setMsg({ ok: false, text: "Could not load your organisation's AI models." }); return; }
    setData((await r.json()).purposes);
    setDraft({});
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save(p: Purpose) {
    setBusy(p); setMsg(null);
    try {
      const r = await fetch("/api/org-admin/ai-models", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose: p, id: draft[p] ?? "" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ ok: false, text: j.error ?? "Could not save." }); return; }
      await load();
      setMsg({ ok: true, text: "Saved." });
    } finally { setBusy(null); }
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-6" data-testid="orgadmin-ai-models">
      <p className="text-xs text-gray-600 max-w-2xl">
        Pick the model your organisation runs on for each purpose. You choose from the models your SuperAdmin has offered you; if you leave a purpose
        unset it follows the platform default. Your people never choose a model, and never see which one is in use.
      </p>
      {!data && <p className="text-xs text-gray-500 mt-4">Loading…</p>}
      {data && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {PURPOSES.map(({ key, title, help }) => {
            const info = data[key];
            const value = draft[key] ?? info.chosen ?? "";
            const dirty = (draft[key] ?? info.chosen ?? "") !== (info.chosen ?? "");
            return (
              <div key={key} className="border border-orange-200 rounded-md p-3 bg-white" data-testid={`orgadmin-models-${key}`}>
                <h2 className="text-sm font-semibold text-orange-700">{title}</h2>
                <p className="text-[11px] text-gray-500 mt-0.5">{help}</p>
                <p className="text-[11px] text-gray-600 mt-2">In use now: <b>{info.inForce.label}</b></p>
                {info.offered.length === 0 ? (
                  <p className="text-[11px] text-gray-500 mt-2">Your SuperAdmin has not offered a list for this, so the platform default is used.</p>
                ) : (
                  <>
                    <select value={value} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                      className="mt-2 w-full text-sm border border-gray-300 rounded px-2 py-1 bg-white" aria-label={`${title} model`}>
                      <option value="">Follow the platform default</option>
                      {info.offered.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                    <div className="mt-2 flex items-center gap-2">
                      <button onClick={() => save(key)} disabled={!dirty || busy === key}
                        className="px-2.5 py-1 text-xs text-white bg-orange-600 rounded hover:bg-orange-700 disabled:opacity-50">{busy === key ? "Saving…" : "Save"}</button>
                      {dirty && <span className="text-[11px] text-amber-800">Nothing changes until you press Save.</span>}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      {msg && <p className={`text-xs mt-3 ${msg.ok ? "text-green-700" : "text-red-600"}`} role="status">{msg.text}</p>}
    </main>
  );
}
