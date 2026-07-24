"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  loadArchimateCatalogue,
  type ArchimateCatalogue,
  type ArchimateShapeEntry,
} from "@/app/lib/archimate/catalogue";
import { ICON_DRAWERS } from "@/app/lib/archimate/icons";
import {
  defaultIconLayout,
  effectiveIconLayout,
  type IconLayout,
  type IconLayoutOverrides,
} from "@/app/lib/archimate/iconLayout";
import { invalidateArchimateIconLayoutCache } from "@/app/lib/archimate/useArchimateIconLayout";

const CATEGORY_LABELS: Record<string, string> = {
  business: "Business",
  motivation: "Motivation",
  strategy: "Strategy",
  application: "Application",
  technology: "Technology",
  "implementation-migration": "Implementation & Migration",
  composite: "Composite",
};

// A representative element box for the preview — roughly the default drop size,
// so the offsets read in true pixels against a real element.
const PREVIEW_W = 150;
const PREVIEW_H = 92;

/** Compact outline path, mirroring ArchimateShape.drawOutline, for the preview. */
function outlinePath(family: ArchimateShapeEntry["shapeFamily"], x: number, y: number, w: number, h: number): string {
  switch (family) {
    case "ellipse":
      return `M ${x + w / 2} ${y} A ${w / 2} ${h / 2} 0 1 0 ${x + w / 2} ${y + h} A ${w / 2} ${h / 2} 0 1 0 ${x + w / 2} ${y} Z`;
    case "rounded-rect": {
      const r = Math.min(w, h) * 0.14;
      return `M ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} L ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;
    }
    case "hexagon": {
      const pad = w * 0.15;
      return `M ${x + pad} ${y} L ${x + w - pad} ${y} L ${x + w} ${y + h / 2} L ${x + w - pad} ${y + h} L ${x + pad} ${y + h} L ${x} ${y + h / 2} Z`;
    }
    case "octagon": {
      const c = Math.min(w, h) * 0.22;
      return `M ${x + c} ${y} L ${x + w - c} ${y} L ${x + w} ${y + c} L ${x + w} ${y + h - c} L ${x + w - c} ${y + h} L ${x + c} ${y + h} L ${x} ${y + h - c} L ${x} ${y + c} Z`;
    }
    default:
      return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
  }
}

/** Render an element's corner glyph at a given layout (mirrors ArchimateShape.renderGlyph). */
function glyphAt(entry: ArchimateShapeEntry, layout: IconLayout, boxX: number, boxY: number, boxW: number, colour: string) {
  const drawIcon = entry.iconType ? ICON_DRAWERS[entry.iconType] : undefined;
  if (!drawIcon) return null;
  const cx = boxX + boxW - layout.xOffset;
  const cy = boxY + layout.yOffset;
  const glyph = drawIcon({ cx, cy, size: layout.width, colour });
  if (layout.height === layout.width) return glyph;
  const scaleY = layout.height / layout.width;
  return <g transform={`translate(${cx} ${cy}) scale(1 ${scaleY}) translate(${-cx} ${-cy})`}>{glyph}</g>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function ArchimateIconsClient() {
  const [cat, setCat] = useState<ArchimateCatalogue | null>(null);
  const [overrides, setOverrides] = useState<IconLayoutOverrides>({});
  const [savedJson, setSavedJson] = useState("{}");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadArchimateCatalogue().then((c) => {
      setCat(c);
      if (c.categories[0]) setExpanded(new Set([c.categories[0].id]));
    }).catch(() => setErr("Failed to load catalogue"));
    fetch("/api/admin/archimate-icons")
      .then((r) => (r.ok ? r.json() : { overrides: {} }))
      .then((j) => { const o = (j?.overrides ?? {}) as IconLayoutOverrides; setOverrides(o); setSavedJson(JSON.stringify(o)); })
      .catch(() => {});
  }, []);

  const dirty = JSON.stringify(overrides) !== savedJson;

  const selected: ArchimateShapeEntry | undefined = useMemo(() => {
    if (!cat || !selectedKey) return undefined;
    for (const c of cat.categories) { const hit = c.shapes.find((s) => s.key === selectedKey); if (hit) return hit; }
    return undefined;
  }, [cat, selectedKey]);

  const selCategory = selected?.category;
  const def = useMemo(() => defaultIconLayout(selCategory), [selCategory]);
  const eff = useMemo(
    () => (selected ? effectiveIconLayout(selected.key, selected.category, overrides) : def),
    [selected, overrides, def],
  );
  const isOverridden = !!(selectedKey && overrides[selectedKey] && Object.keys(overrides[selectedKey]).length);

  function setField(field: keyof IconLayout, value: number) {
    if (!selectedKey || !selected) return;
    const v = round2(value);
    setOverrides((prev) => {
      const cur = { ...(prev[selectedKey] ?? {}) };
      // Only store the field if it differs from the default; otherwise drop it.
      if (Math.abs(v - def[field]) < 0.005) delete cur[field];
      else cur[field] = v;
      const next = { ...prev };
      if (Object.keys(cur).length) next[selectedKey] = cur; else delete next[selectedKey];
      return next;
    });
  }
  const adjustPct = (field: keyof IconLayout, pct: number) => setField(field, eff[field] * (1 + pct / 100));
  const adjustAbs = (field: keyof IconLayout, delta: number) => setField(field, eff[field] + delta);

  function resetSelected() {
    if (!selectedKey) return;
    setOverrides((prev) => { const n = { ...prev }; delete n[selectedKey]; return n; });
  }

  async function save() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/admin/archimate-icons", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? "Failed to save"); return; }
      const o = (j.overrides ?? {}) as IconLayoutOverrides;
      setOverrides(o); setSavedJson(JSON.stringify(o));
      invalidateArchimateIconLayoutCache();
    } catch { setErr("Network error"); } finally { setBusy(false); }
  }

  function toggleCat(id: string) {
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const overriddenCount = Object.keys(overrides).length;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <Link href="/dashboard/admin" className="text-sm text-gray-500 hover:text-gray-700">← SuperAdmin</Link>
      <h1 className="text-lg font-semibold text-gray-900 mt-2">ArchiMate Icon Maintenance</h1>
      <p className="text-sm text-gray-600 mt-1">
        Fine-tune the position and size of each ArchiMate element&rsquo;s corner glyph. Offsets are
        measured from the element&rsquo;s <strong>top-right corner</strong> to the glyph centre
        (X&nbsp;= distance in from the right edge, Y&nbsp;= distance down from the top). Adjust in
        pixels or by percentage; unchanged values fall back to the built-in default.
        Changes apply everywhere ArchiMate elements render, for all users, after Save.
      </p>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-[300px_1fr] gap-5">
        {/* ── Accordion (like the palette) ───────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden self-start">
          {!cat && <div className="p-4 text-sm text-gray-400">Loading catalogue…</div>}
          {cat?.categories.map((c) => {
            const open = expanded.has(c.id);
            const drawable = c.shapes.filter((s) => s.iconType && ICON_DRAWERS[s.iconType]);
            if (!drawable.length) return null;
            return (
              <div key={c.id} className="border-b border-gray-100 last:border-b-0">
                <button
                  onClick={() => toggleCat(c.id)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <span>{CATEGORY_LABELS[c.id] ?? c.name}</span>
                  <span className="text-gray-400">{open ? "▾" : "▸"}</span>
                </button>
                {open && (
                  <div className="grid grid-cols-3 gap-1.5 px-3 pb-3">
                    {drawable.map((s) => {
                      const l = effectiveIconLayout(s.key, s.category, overrides);
                      const sel = s.key === selectedKey;
                      const ov = !!(overrides[s.key] && Object.keys(overrides[s.key]).length);
                      return (
                        <button
                          key={s.key}
                          onClick={() => setSelectedKey(s.key)}
                          title={s.name}
                          className={`relative flex flex-col items-center gap-1 p-1.5 rounded border ${sel ? "border-red-400 bg-red-50" : "border-gray-200 hover:bg-gray-50"}`}
                        >
                          {ov && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-red-500" title="Customised" />}
                          <svg viewBox="0 0 64 44" className="w-full h-9">
                            <path d={outlinePath(s.shapeFamily, 3, 3, 58, 38)} fill="#f7f7f7" stroke="#9aa0a6" strokeWidth={1.3} />
                            {glyphAt(s, { ...l, xOffset: l.xOffset * 0.42 + 6, yOffset: l.yOffset * 0.42 + 4, width: l.width * 0.42, height: l.height * 0.42 }, 3, 3, 58, "#444")}
                          </svg>
                          <span className="text-[9px] leading-tight text-gray-600 text-center line-clamp-2">{s.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Editor ─────────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 self-start">
          {!selected && <div className="text-sm text-gray-400 py-10 text-center">Select an element on the left to edit its icon.</div>}
          {selected && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">{selected.name}</h2>
                  <p className="text-[11px] text-gray-400">
                    {CATEGORY_LABELS[selected.category] ?? selected.category} · icon <code>{selected.iconType}</code> · key <code>{selected.key}</code>
                  </p>
                </div>
                {isOverridden
                  ? <span className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-0.5">Customised</span>
                  : <span className="text-[11px] text-gray-400 bg-gray-50 border border-gray-200 rounded px-2 py-0.5">Default</span>}
              </div>

              {/* Preview */}
              <div className="mt-3 flex justify-center bg-gray-50 border border-gray-100 rounded py-4">
                <svg viewBox={`0 0 ${PREVIEW_W + 40} ${PREVIEW_H + 40}`} className="w-[280px] h-auto">
                  {/* right-edge + top-edge reference lines */}
                  <line x1={20 + PREVIEW_W} y1={4} x2={20 + PREVIEW_W} y2={PREVIEW_H + 36} stroke="#e2e4e8" strokeWidth={1} strokeDasharray="3 3" />
                  <line x1={4} y1={20} x2={PREVIEW_W + 36} y2={20} stroke="#e2e4e8" strokeWidth={1} strokeDasharray="3 3" />
                  <path d={outlinePath(selected.shapeFamily, 20, 20, PREVIEW_W, PREVIEW_H)} fill="#f7f7f7" stroke="#6b7280" strokeWidth={2} />
                  {glyphAt(selected, eff, 20, 20, PREVIEW_W, "#374151")}
                  {/* glyph-centre crosshair */}
                  <circle cx={20 + PREVIEW_W - eff.xOffset} cy={20 + eff.yOffset} r={1.6} fill="#ef4444" />
                </svg>
              </div>

              {/* Field controls */}
              <div className="mt-4 space-y-3">
                {([
                  ["xOffset", "X offset (in from right edge)"],
                  ["yOffset", "Y offset (down from top edge)"],
                  ["width", "Icon width"],
                  ["height", "Icon height"],
                ] as [keyof IconLayout, string][]).map(([field, label]) => (
                  <div key={field} className="flex items-center gap-2">
                    <div className="w-52 text-xs text-gray-600">
                      {label}
                      <span className="ml-1 text-gray-400">(default {round2(def[field])})</span>
                    </div>
                    <button onClick={() => adjustPct(field, -10)} className="px-1.5 py-1 text-[11px] border border-gray-300 rounded hover:bg-gray-50" title="−10%">−10%</button>
                    <button onClick={() => adjustAbs(field, -1)} className="px-1.5 py-1 text-[11px] border border-gray-300 rounded hover:bg-gray-50" title="−1px">−1</button>
                    <input
                      type="number" step="0.5" value={round2(eff[field])}
                      onChange={(e) => setField(field, parseFloat(e.target.value))}
                      className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-red-200"
                    />
                    <button onClick={() => adjustAbs(field, 1)} className="px-1.5 py-1 text-[11px] border border-gray-300 rounded hover:bg-gray-50" title="+1px">+1</button>
                    <button onClick={() => adjustPct(field, 10)} className="px-1.5 py-1 text-[11px] border border-gray-300 rounded hover:bg-gray-50" title="+10%">+10%</button>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={resetSelected}
                  disabled={!isOverridden}
                  className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Reset this icon
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Save bar */}
      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={save}
          disabled={!dirty || busy}
          className="px-3 py-1.5 text-sm text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Saving…" : "Save all changes"}
        </button>
        {!dirty && <span className="text-xs text-green-700">✓ Saved</span>}
        {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
        <span className="text-xs text-gray-400">{overriddenCount} customised {overriddenCount === 1 ? "icon" : "icons"}</span>
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
    </div>
  );
}
