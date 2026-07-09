"use client";

import { useState } from "react";
import Link from "next/link";
import { lightenHex, normalizeHex, PCF_LEVEL_NAMES, type PcfLevelColor } from "@/app/lib/pcf/levelColors";

/** SuperAdmin editor for the APQC PCF level colour scheme. Each level has ONE
 *  main colour + a lightness % (the light tone is the main lightened by that %).
 *  Text rule (previewed live): white text on the dark main background, the main
 *  colour as text on the light background. */
export function PcfColoursClient({ initial }: { initial: PcfLevelColor[] }) {
  const [colors, setColors] = useState<PcfLevelColor[]>(initial);
  const [saved, setSaved] = useState<string>(JSON.stringify(initial));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dirty = JSON.stringify(colors) !== saved;

  function patch(level: number, p: Partial<PcfLevelColor>) {
    setColors((cs) => cs.map((c) => (c.level === level ? { ...c, ...p } : c)));
  }

  async function save() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/admin/pcf-colors", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ colors }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? "Failed to save"); return; }
      setColors(j.colors); setSaved(JSON.stringify(j.colors));
    } catch { setErr("Network error"); } finally { setBusy(false); }
  }

  async function reset() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/admin/pcf-colors", { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? "Failed to reset"); return; }
      setColors(j.colors); setSaved(JSON.stringify(j.colors));
    } catch { setErr("Network error"); } finally { setBusy(false); }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Link href="/dashboard/admin" className="text-sm text-gray-500 hover:text-gray-700">← SuperAdmin</Link>
      <h1 className="text-lg font-semibold text-gray-900 mt-2">APQC PCF Hierarchy Colours</h1>
      <p className="text-sm text-gray-600 mt-1">
        APQC colour-codes the five PCF levels. Each level is a two-tone pair from one main colour and a
        lightness&nbsp;%: the light shade is the main colour lightened toward white by that percentage.
        Text is white on the dark main background and the main colour on the light background. This scheme
        applies wherever the APQC hierarchy is shown.
      </p>

      <div className="mt-5 bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
        {colors.map((c) => {
          const main = normalizeHex(c.main) ?? "#000000";
          const light = lightenHex(main, c.lightPct);
          return (
            <div key={c.level} className="p-4 flex items-center gap-4 flex-wrap">
              <div className="w-32 shrink-0">
                <div className="text-sm font-medium text-gray-900">{PCF_LEVEL_NAMES[c.level] ?? c.name}</div>
                <div className="text-[11px] text-gray-400">Level {c.level}</div>
              </div>

              {/* Main colour: native picker + hex */}
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={main}
                  onChange={(e) => patch(c.level, { main: e.target.value })}
                  className="h-8 w-8 rounded border border-gray-300 cursor-pointer p-0"
                  aria-label={`${PCF_LEVEL_NAMES[c.level]} main colour`}
                />
                <input
                  type="text"
                  value={c.main}
                  onChange={(e) => patch(c.level, { main: e.target.value })}
                  onBlur={(e) => patch(c.level, { main: normalizeHex(e.target.value) ?? c.main })}
                  className="w-24 border border-gray-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-red-200"
                  placeholder="#00426f"
                />
              </div>

              {/* Lightness % */}
              <div className="flex items-center gap-2">
                <input
                  type="range" min={0} max={100} value={c.lightPct}
                  onChange={(e) => patch(c.level, { lightPct: Number(e.target.value) })}
                  className="w-28 accent-red-500"
                  aria-label={`${PCF_LEVEL_NAMES[c.level]} lightness`}
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number" min={0} max={100} value={c.lightPct}
                    onChange={(e) => patch(c.level, { lightPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                    className="w-14 border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-red-200"
                  />
                  <span className="text-xs text-gray-400">%</span>
                </div>
              </div>

              {/* Live two-tone preview */}
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="px-2 py-1 rounded text-[11px] font-medium" style={{ background: main, color: "#ffffff" }}>
                  {PCF_LEVEL_NAMES[c.level]}
                </span>
                <span className="px-2 py-1 rounded text-[11px] font-medium border" style={{ background: light, color: main, borderColor: main }}>
                  {PCF_LEVEL_NAMES[c.level]}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={!dirty || busy}
          className="px-3 py-1.5 text-sm text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          onClick={reset}
          disabled={busy}
          className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          Reset to defaults
        </button>
        {!dirty && !busy && <span className="text-xs text-green-700">✓ Saved</span>}
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
    </div>
  );
}
