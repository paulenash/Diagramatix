"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AiModel } from "@/app/lib/ai/models";

type Purpose = "default" | "vision" | "command";
const PURPOSES: { key: Purpose; title: string; help: string }[] = [
  { key: "default", title: "Default", help: "The model AI Generate and the other AI features run on." },
  { key: "vision", title: "Vision", help: "The model that reads an image (image → diagram). Only models that read images are listed." },
  { key: "command", title: "Voice Assist Command", help: "The small, quick model that rewrites one spoken sentence into a command." },
];
interface PurposeState { customised: boolean; offered: string[]; chosen: string | null }
interface OrgRow { id: string; name: string; purposes: Record<Purpose, PurposeState> }

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Anthropic", moonshot: "Moonshot (Kimi)", google: "Google", microsoft: "Microsoft", deepseek: "DeepSeek", openrouter: "OpenRouter", ollama: "Ollama (local)",
};

/**
 * SuperAdmin → AI Model → Organisations. Per Org and purpose: tick the models that Org's OrgAdmin may choose from (Paul, 2026-10-05).
 * Only a SuperAdmin sees every model; an OrgAdmin sees only what is ticked here, and ordinary users see no model at all.
 */
export function OrgModelListsEditor({ models }: { models: AiModel[] }) {
  const [orgs, setOrgs] = useState<OrgRow[] | null>(null);
  const [orgId, setOrgId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});          // `${orgId}|${purpose}` → ticked ids (unsaved)
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/ai-model/orgs", { cache: "no-store" });
    if (!r.ok) { setMsg({ ok: false, text: "Could not load the organisations." }); return; }
    const j = (await r.json()) as { orgs: OrgRow[] };
    setOrgs(j.orgs);
    setOrgId((cur) => cur || j.orgs[0]?.id || "");
  }, []);
  useEffect(() => { void load(); }, [load]);

  const org = orgs?.find((o) => o.id === orgId) ?? null;
  const byProvider = useMemo(() => {
    const g = new Map<string, AiModel[]>();
    for (const m of models) { const p = m.provider ?? "anthropic"; (g.get(p) ?? g.set(p, []).get(p)!).push(m); }
    return [...g.entries()];
  }, [models]);

  const keyOf = (p: Purpose) => `${orgId}|${p}`;
  const ticked = (p: Purpose): string[] => drafts[keyOf(p)] ?? org?.purposes[p].offered ?? [];
  const dirty = (p: Purpose) => !!drafts[keyOf(p)] && JSON.stringify([...drafts[keyOf(p)]].sort()) !== JSON.stringify([...(org?.purposes[p].offered ?? [])].sort());
  const toggle = (p: Purpose, id: string) => {
    const cur = ticked(p);
    setDrafts((d) => ({ ...d, [keyOf(p)]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] }));
  };
  const setAll = (p: Purpose, ids: string[]) => setDrafts((d) => ({ ...d, [keyOf(p)]: ids }));

  async function put(p: Purpose, body: Record<string, unknown>, done: string) {
    setBusy(keyOf(p)); setMsg(null);
    try {
      const r = await fetch("/api/admin/ai-model/orgs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId, purpose: p, ...body }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ ok: false, text: j.error ?? "Could not save." }); return; }
      setDrafts((d) => { const n = { ...d }; delete n[keyOf(p)]; return n; });
      await load();
      setMsg({ ok: true, text: done });
    } finally { setBusy(null); }
  }

  return (
    <section className="mt-8 border-t border-gray-200 pt-6" data-testid="org-model-lists">
      <h2 className="text-sm font-semibold text-gray-900">Organisations</h2>
      <p className="text-xs text-gray-600 mt-1 max-w-3xl">
        Choose, for each organisation, which models its OrgAdmin may pick from — for Default, Vision and Voice Assist Command. An organisation nobody has
        customised is offered every Anthropic model and keeps running on the global setting above. Ordinary users never choose a model and never see one.
      </p>

      {!orgs && <p className="text-xs text-gray-500 mt-3">Loading…</p>}
      {orgs && (
        <div className="mt-3">
          <label className="text-xs text-gray-600 mr-2" htmlFor="org-models-org">Organisation</label>
          <select id="org-models-org" value={orgId} onChange={(e) => setOrgId(e.target.value)} className="text-sm border border-gray-300 rounded px-2 py-1 bg-white">
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      )}

      {org && (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {PURPOSES.map(({ key, title, help }) => {
            const st = org.purposes[key];
            const list = ticked(key);
            const eligible = (m: AiModel) => key !== "vision" || m.vision !== false;
            const anthropicIds = models.filter((m) => (m.provider ?? "anthropic") === "anthropic" && eligible(m)).map((m) => m.id);
            return (
              <div key={key} className="border border-gray-200 rounded-md p-3 bg-white" data-testid={`org-models-${key}`}>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
                  <span className={`text-[10px] ${st.customised ? "text-red-700" : "text-gray-400"}`}>{st.customised ? "customised" : "default list"}</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">{help}</p>
                <p className="text-[11px] text-gray-500 mt-1">
                  Chosen by the OrgAdmin: <b>{st.chosen ? (models.find((m) => m.id === st.chosen)?.label ?? st.chosen) : "— (following the global setting)"}</b>
                </p>
                <div className="mt-2 max-h-64 overflow-y-auto pr-1">
                  {byProvider.map(([prov, ms]) => {
                    const shown = ms.filter(eligible);
                    if (!shown.length) return null;
                    return (
                      <div key={prov} className="mb-2">
                        <div className="text-[10px] uppercase tracking-wide text-gray-400">{PROVIDER_LABEL[prov] ?? prov}</div>
                        {shown.map((m) => (
                          <label key={m.id} className="flex items-center gap-2 text-xs text-gray-700 py-0.5">
                            <input type="checkbox" checked={list.includes(m.id)} onChange={() => toggle(key, m.id)} />
                            {m.label}
                          </label>
                        ))}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button onClick={() => put(key, { ids: list }, `Saved the ${title} list for ${org.name}.`)} disabled={!dirty(key) || busy === keyOf(key)}
                    className="px-2.5 py-1 text-xs text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50">{busy === keyOf(key) ? "Saving…" : "Save"}</button>
                  <button onClick={() => setAll(key, anthropicIds)} className="px-2 py-1 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50">All Anthropic</button>
                  <button onClick={() => setAll(key, [])} className="px-2 py-1 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50">None</button>
                  {st.customised && <button onClick={() => put(key, { reset: true }, `${title} list for ${org.name} reset to the default.`)} disabled={busy === keyOf(key)}
                    className="px-2 py-1 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50">Reset</button>}
                </div>
                {dirty(key) && <p className="text-[11px] text-amber-800 mt-1">Nothing changes until you press Save.</p>}
                {list.length === 0 && <p className="text-[11px] text-gray-500 mt-1">An empty list means the organisation uses the global setting.</p>}
              </div>
            );
          })}
        </div>
      )}
      {msg && <p className={`text-xs mt-3 ${msg.ok ? "text-green-700" : "text-red-600"}`} role="status">{msg.text}</p>}
    </section>
  );
}
