"use client";

/**
 * SuperAdmin "ArchiMate Relationship Explorer".
 *
 * Pick a Source and a Target element → they render as their box-form shapes
 * (Source left, Target right) → a scrollable list shows every relationship
 * ArchiMate 3.2 PERMITS between them, for the chosen direction (a to/from toggle
 * at the top of the list). Validity comes from the authoritative matrix
 * (public/archimate-relationships.json via getAllowedRelationships).
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadArchimateCatalogue, type ArchimateCatalogue } from "@/app/lib/archimate/catalogue";
import { ICON_DRAWERS } from "@/app/lib/archimate/icons";
import { loadCompatibilityMatrix, getAllowedRelationships } from "@/app/lib/archimate/compatibility";
import { ARCHI_REL_NAME, styleFor, type ArchimateMarkerKind } from "@/app/lib/diagram/archimateConnectorStyle";
import type { ArchimateConnectorType } from "@/app/lib/diagram/types";

interface Master { key: string; name: string; category: string; fill: string; stroke: string; iconType?: string; }

// The 12 relationship types in display order, grouped as the picker groups them.
const ENTRIES: { type: ArchimateConnectorType; group: string }[] = [
  { type: "archi-composition", group: "Structural" }, { type: "archi-aggregation", group: "Structural" },
  { type: "archi-assignment", group: "Structural" }, { type: "archi-realisation", group: "Structural" },
  { type: "archi-serving", group: "Dependency" }, { type: "archi-access", group: "Dependency" },
  { type: "archi-influence", group: "Dependency" }, { type: "archi-association", group: "Dependency" },
  { type: "archi-association-directed", group: "Dependency" },
  { type: "archi-triggering", group: "Dynamic" }, { type: "archi-flow", group: "Dynamic" },
  { type: "archi-specialisation", group: "Other" },
];

const CATEGORY_LABEL: Record<string, string> = {
  strategy: "Strategy", business: "Business", application: "Application", technology: "Technology",
  physical: "Physical", motivation: "Motivation", "implementation-migration": "Implementation & Migration", composite: "Composite",
};
const CATEGORY_ORDER = ["strategy", "business", "application", "technology", "physical", "motivation", "implementation-migration", "composite"];

export function RelationshipExplorerClient() {
  const [cat, setCat] = useState<ArchimateCatalogue | null>(null);
  const [ready, setReady] = useState(false);
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [reverse, setReverse] = useState(false); // false = Source→Target, true = Target→Source

  useEffect(() => {
    loadArchimateCatalogue().then(setCat).catch(() => {});
    loadCompatibilityMatrix().then(() => setReady(true)).catch(() => {});
  }, []);

  // name → box-form master (prefer the box variant, fall back to whatever exists).
  const byName = useMemo(() => {
    const m = new Map<string, Master>();
    if (!cat) return m;
    for (const c of cat.categories) for (const s of c.shapes) {
      const key = s.name.toLowerCase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const master: Master = { key: s.key, name: s.name, category: (s as any).category ?? c.id, fill: (s as any).fill ?? "#eef2f7", stroke: (s as any).stroke ?? "#334155", iconType: (s as any).iconType };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!m.has(key) || (s as any).variant !== "icon") m.set(key, master);
    }
    return m;
  }, [cat]);

  // The 60 real elements, grouped by domain for the dropdowns.
  const groups = useMemo(() => {
    const names = [...byName.keys()].map((k) => byName.get(k)!).filter((mm) => mm.name !== "Junction" && mm.name !== "And-Junction" && mm.name !== "Or-Junction");
    const g = new Map<string, Master[]>();
    for (const mm of names) (g.get(mm.category) ?? g.set(mm.category, []).get(mm.category)!).push(mm);
    for (const arr of g.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
    return CATEGORY_ORDER.filter((c) => g.has(c)).map((c) => ({ cat: c, items: g.get(c)! }));
  }, [byName]);

  const fromName = reverse ? target : source;
  const toName = reverse ? source : target;
  const allowed = useMemo(() => {
    if (!ready || !source || !target) return new Set<ArchimateConnectorType>();
    return getAllowedRelationships(fromName, toName).allowed;
  }, [ready, source, target, fromName, toName]);

  const validEntries = ENTRIES.filter((e) => allowed.has(e.type));

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <Link href="/dashboard/admin" className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"><span>←</span><span className="underline">SuperAdmin</span></Link>
        <h1 className="text-lg font-semibold text-gray-900">ArchiMate Relationship Explorer</h1>
        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">SuperAdmin</span>
      </header>

      <main className="p-6 max-w-5xl mx-auto">
        <p className="text-sm text-gray-500 mb-4">Pick a <b>Source</b> and <b>Target</b> element to see the relationships ArchiMate 3.2 permits between them. Toggle the direction at the top of the list.</p>

        {/* Pickers */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {([["Source", source, setSource], ["Target", target, setTarget]] as const).map(([label, val, set]) => (
            <label key={label} className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
              <select value={val} onChange={(e) => set(e.target.value)} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-800">
                <option value="">Choose an element…</option>
                {groups.map((g) => (
                  <optgroup key={g.cat} label={CATEGORY_LABEL[g.cat] ?? g.cat}>
                    {g.items.map((mm) => <option key={mm.name} value={mm.name}>{mm.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
          ))}
        </div>

        {/* Shapes + relationship list */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-center gap-4 min-h-[180px]">
            {source ? <ElementBox master={byName.get(source.toLowerCase())} label={source} /> : <Placeholder label="Source" />}
            <DirArrow reverse={reverse} />
            {target ? <ElementBox master={byName.get(target.toLowerCase())} label={target} /> : <Placeholder label="Target" />}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg flex flex-col max-h-[420px]">
            <div className="px-3 py-2 border-b border-gray-100">
              <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
                <button onClick={() => setReverse(false)} className={`flex-1 px-2 py-1.5 ${!reverse ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}>{source || "Source"} → {target || "Target"}</button>
                <button onClick={() => setReverse(true)} className={`flex-1 px-2 py-1.5 border-l border-gray-200 ${reverse ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}>{target || "Target"} → {source || "Source"}</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {!source || !target ? (
                <p className="text-xs text-gray-400 italic px-1 py-3">Choose both elements to list valid relationships.</p>
              ) : validEntries.length === 0 ? (
                <p className="text-xs text-gray-400 italic px-1 py-3">No relationship permitted from <b>{fromName}</b> to <b>{toName}</b>.</p>
              ) : (
                <>
                  <p className="text-[11px] text-gray-500 px-1 mb-1">{validEntries.length} permitted from <b>{fromName}</b> to <b>{toName}</b>:</p>
                  <ul className="space-y-0.5">
                    {validEntries.map((e) => (
                      <li key={e.type} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-gray-50">
                        <RelGlyph type={e.type} />
                        <span className="text-sm text-gray-800 flex-1">{ARCHI_REL_NAME[e.type]}</span>
                        <span className="text-[10px] text-gray-400">{e.group}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ── An element rendered as its box shape (rect + corner icon + label) ──
function ElementBox({ master, label }: { master?: Master; label: string }) {
  const fill = master?.fill ?? "#eef2f7";
  const stroke = master?.stroke ?? "#334155";
  const drawer = master?.iconType ? ICON_DRAWERS[master.iconType] : undefined;
  const lines = wrap(label, 16);
  return (
    <svg viewBox="0 0 130 92" className="w-40 h-28 shrink-0">
      <rect x="3" y="3" width="124" height="86" fill={fill} stroke={stroke} strokeWidth="2" />
      {drawer && <g>{drawer({ cx: 112, cy: 17, size: 20, colour: stroke })}</g>}
      <text x="65" y={46 - (lines.length - 1) * 7} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#1f2937" fontWeight={600}>
        {lines.map((ln, i) => <tspan key={i} x="65" dy={i === 0 ? 0 : 14}>{ln}</tspan>)}
      </text>
    </svg>
  );
}
function Placeholder({ label }: { label: string }) {
  return <div className="w-40 h-28 shrink-0 border-2 border-dashed border-gray-200 rounded flex items-center justify-center text-xs text-gray-300">{label}</div>;
}
function DirArrow({ reverse }: { reverse: boolean }) {
  return <div className="text-2xl text-gray-400 select-none">{reverse ? "←" : "→"}</div>;
}

// ── A small connector glyph per relationship type (line + start/end markers) ──
function RelGlyph({ type }: { type: ArchimateConnectorType }) {
  const s = styleFor(type, false);
  const y = 9, x0 = 10, x1 = 44, col = "#333333";
  return (
    <svg viewBox="0 0 54 18" className="w-14 h-4 shrink-0">
      <line x1={x0} y1={y} x2={x1} y2={y} stroke={col} strokeWidth={1.4} strokeDasharray={s.dash} />
      {marker(s.startMarker, x0, y, -1, col)}
      {marker(s.endMarker, x1, y, 1, col)}
    </svg>
  );
}
/** Draw a marker at (x,y). dir +1 = points right (target end); -1 = at source end. */
function marker(kind: ArchimateMarkerKind | null, x: number, y: number, dir: 1 | -1, col: string) {
  if (!kind) return null;
  const d = 7;
  switch (kind) {
    case "arrow-filled":
      return <polygon points={`${x},${y} ${x - dir * d},${y - 3.5} ${x - dir * d},${y + 3.5}`} fill={col} />;
    case "arrow-open":
      return <polyline points={`${x - dir * d},${y - 3.5} ${x},${y} ${x - dir * d},${y + 3.5}`} fill="none" stroke={col} strokeWidth={1.2} />;
    case "arrow-open-half":
      return <polyline points={`${x - dir * d},${y + 3.5} ${x},${y}`} fill="none" stroke={col} strokeWidth={1.2} />;
    case "triangle-open":
      return <polygon points={`${x},${y} ${x - dir * d},${y - 4} ${x - dir * d},${y + 4}`} fill="#fff" stroke={col} strokeWidth={1} />;
    case "diamond-filled":
      return <polygon points={`${x},${y} ${x + dir * 4},${y - 3.2} ${x + dir * 8},${y} ${x + dir * 4},${y + 3.2}`} fill={col} />;
    case "diamond-open":
      return <polygon points={`${x},${y} ${x + dir * 4},${y - 3.2} ${x + dir * 8},${y} ${x + dir * 4},${y + 3.2}`} fill="#fff" stroke={col} strokeWidth={1} />;
    case "circle-filled":
      return <circle cx={x + dir * 3} cy={y} r={3} fill={col} />;
  }
}

function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max && cur) { out.push(cur); cur = w; }
    else cur = (cur + " " + w).trim();
  }
  if (cur) out.push(cur);
  return out.slice(0, 3);
}
