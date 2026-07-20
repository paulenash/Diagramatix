"use client";

import { useState } from "react";
import Link from "next/link";
import {
  FEATURE_META, tonesFor, featureVars, isHex,
  type FeatureColorScheme, type FeatureColorKey,
} from "@/app/lib/theme/featureColors";

const GROUP_LABEL: Record<"product" | "accent" | "role", string> = {
  product: "Product features",
  accent: "Distinct accents",
  role: "Role fallbacks",
};

/**
 * SuperAdmin editor for the app-wide Feature Colours scheme. Each feature has a
 * Background + Text colour; the Highlight (hover / selected) is the background
 * darkened by one global % (previewed live on each tile). Applies wherever a
 * feature is colour-coded: dashboard menus, admin tiles, AI controls, drift ring.
 */
export function FeatureColoursClient({ initial }: { initial: FeatureColorScheme }) {
  const [scheme, setScheme] = useState<FeatureColorScheme>(initial);
  const [saved, setSaved] = useState<string>(JSON.stringify(initial));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dirty = JSON.stringify(scheme) !== saved;

  function patch(key: FeatureColorKey, part: { bg?: string; text?: string }) {
    setScheme((s) => ({ ...s, colors: { ...s.colors, [key]: { ...s.colors[key], ...part } } }));
  }
  function setPct(pct: number) {
    setScheme((s) => ({ ...s, highlightPct: Math.max(0, Math.min(40, pct)) }));
  }

  async function persist(method: "PUT" | "DELETE") {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/admin/feature-colors", {
        method,
        headers: method === "PUT" ? { "Content-Type": "application/json" } : undefined,
        body: method === "PUT" ? JSON.stringify({ scheme }) : undefined,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? "Failed"); return; }
      setScheme(j.scheme); setSaved(JSON.stringify(j.scheme));
    } catch { setErr("Network error"); } finally { setBusy(false); }
  }

  const groups: ("product" | "accent" | "role")[] = ["product", "accent", "role"];

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Link href="/dashboard/admin" className="text-sm text-gray-500 hover:text-gray-700">← SuperAdmin</Link>
      <h1 className="text-lg font-semibold text-gray-900 mt-2">Feature Colours</h1>
      <p className="text-sm text-gray-600 mt-1">
        Each product / role area has a <b>Background</b> and a <b>Text</b> colour. The <b>Highlight</b>
        {" "}(hover / selected) is the background darkened by the percentage below. These colours apply
        across the dashboard menus, SuperAdmin &amp; OrgAdmin tiles, the AI&nbsp;Generation controls and
        the Entity-Drift ring.
      </p>

      {/* Global highlight % */}
      <div className="mt-4 flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-3">
        <span className="text-sm font-medium text-gray-800">Highlight darkening</span>
        <input
          type="range" min={0} max={40} value={scheme.highlightPct}
          onChange={(e) => setPct(Number(e.target.value))}
          className="w-40 accent-violet-500" aria-label="Highlight darkening percent"
        />
        <input
          type="number" min={0} max={40} value={scheme.highlightPct}
          onChange={(e) => setPct(Number(e.target.value) || 0)}
          className="w-14 border border-gray-300 rounded px-1.5 py-1 text-xs"
        />
        <span className="text-xs text-gray-400">% darker than the background, for hover / selected</span>
      </div>

      {groups.map((group) => (
        <div key={group} className="mt-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">{GROUP_LABEL[group]}</h2>
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
            {FEATURE_META.filter((m) => m.group === group).map((m) => {
              const fc = scheme.colors[m.key];
              const t = tonesFor(scheme, m.key);
              return (
                <div key={m.key} className="p-4 flex items-center gap-4 flex-wrap">
                  <div className="w-40 shrink-0">
                    <div className="text-sm font-medium text-gray-900">{m.label}</div>
                    <div className="text-[11px] text-gray-400 leading-tight">{m.note}</div>
                  </div>

                  {/* Background */}
                  <label className="flex items-center gap-1.5" title="Background">
                    <input type="color" value={fc.bg} onChange={(e) => patch(m.key, { bg: e.target.value })}
                      className="h-8 w-8 rounded border border-gray-300 cursor-pointer p-0" aria-label={`${m.label} background`} />
                    <input type="text" value={fc.bg}
                      onChange={(e) => patch(m.key, { bg: e.target.value })}
                      onBlur={(e) => { if (!isHex(e.target.value)) patch(m.key, { bg: fc.bg }); }}
                      className="w-20 border border-gray-300 rounded px-2 py-1 text-xs font-mono" placeholder="#ffffff" />
                  </label>

                  {/* Text */}
                  <label className="flex items-center gap-1.5" title="Text">
                    <input type="color" value={fc.text} onChange={(e) => patch(m.key, { text: e.target.value })}
                      className="h-8 w-8 rounded border border-gray-300 cursor-pointer p-0" aria-label={`${m.label} text`} />
                    <input type="text" value={fc.text}
                      onChange={(e) => patch(m.key, { text: e.target.value })}
                      onBlur={(e) => { if (!isHex(e.target.value)) patch(m.key, { text: fc.text }); }}
                      className="w-20 border border-gray-300 rounded px-2 py-1 text-xs font-mono" placeholder="#000000" />
                  </label>

                  {/* Live tile preview — hover shows the derived highlight */}
                  <div className="ml-auto flex items-center gap-2">
                    <span className="feature-tile border rounded px-2.5 py-1 text-[11px] font-semibold"
                      style={featureVars(scheme, m.key)}>{m.label}</span>
                    <span className="text-[10px] font-mono text-gray-400" title="Highlight (derived)">{t.hi}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="mt-5 flex items-center gap-3">
        <button onClick={() => persist("PUT")} disabled={!dirty || busy}
          className="px-3 py-1.5 text-sm text-white bg-violet-600 rounded hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed">
          {busy ? "Saving…" : "Save"}
        </button>
        <button onClick={() => persist("DELETE")} disabled={busy}
          className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50">
          Reset to defaults
        </button>
        {!dirty && !busy && <span className="text-xs text-green-700">✓ Saved</span>}
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
    </div>
  );
}
