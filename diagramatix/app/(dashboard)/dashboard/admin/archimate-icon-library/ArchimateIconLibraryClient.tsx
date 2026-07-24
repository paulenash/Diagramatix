"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  drawCustomIcon,
  DEFAULT_STROKE_WIDTH,
  type IconPrimitive,
  type PathSeg,
  type ArrowSpec,
} from "@/app/lib/archimate/iconShapes";
import { loadArchimateCatalogue, type ArchimateCatalogue } from "@/app/lib/archimate/catalogue";
import { ICON_DRAWERS } from "@/app/lib/archimate/icons";
import { invalidateArchimateCustomIconCache } from "@/app/lib/archimate/useArchimateCustomIcon";
import { invalidateArchimateIconBufferCache } from "@/app/lib/archimate/useArchimateIconBuffers";
import { builtinCategoryBuffer, type CategoryBuffers } from "@/app/lib/archimate/iconLayout";
import { PromptDialog } from "@/app/components/PromptDialog";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { AlertDialog } from "@/app/components/AlertDialog";

interface LibIcon {
  id: string; name: string; category: string | null;
  primitives: IconPrimitive[]; defaultWidth: number | null; defaultHeight: number | null; hasSource: boolean;
}

const EDIT_COLOUR = "#334155";
const round1 = (n: number) => Math.round(n * 10) / 10;

// ── Add-primitive defaults (centred in the 0..100 box) ───────────────
function defaultPrim(type: IconPrimitive["type"], z: number): IconPrimitive {
  const base = { z, strokeWidth: DEFAULT_STROKE_WIDTH, filled: false };
  switch (type) {
    case "line": return { ...base, type: "line", x1: 30, y1: 50, x2: 70, y2: 50 };
    case "path": return { ...base, type: "path", closed: false, segments: [{ t: "M", x: 30, y: 62 }, { t: "Q", cx: 50, cy: 28, x: 70, y: 62 }] };
    case "rect": return { ...base, type: "rect", x: 30, y: 35, w: 40, h: 30 };
    case "triangle": return { ...base, type: "triangle", x1: 50, y1: 28, x2: 72, y2: 66, x3: 28, y3: 66 };
    case "circle": return { ...base, type: "circle", cx: 50, cy: 50, r: 22 };
    case "ellipse": return { ...base, type: "ellipse", cx: 50, cy: 50, rx: 28, ry: 18 };
    case "arc": return { ...base, type: "arc", cx: 50, cy: 52, r: 24, a0: 180, a1: 360 };
  }
}

// ── Draggable handles for the selected primitive ─────────────────────
interface Handle { id: string; x: number; y: number; control?: boolean; apply: (p: IconPrimitive, x: number, y: number) => IconPrimitive; }

function handlesFor(p: IconPrimitive): Handle[] {
  const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
  switch (p.type) {
    case "line": return [
      { id: "a", x: p.x1, y: p.y1, apply: (q, x, y) => ({ ...(q as typeof p), x1: x, y1: y }) },
      { id: "b", x: p.x2, y: p.y2, apply: (q, x, y) => ({ ...(q as typeof p), x2: x, y2: y }) },
    ];
    case "rect": return [
      { id: "o", x: p.x, y: p.y, apply: (q, x, y) => ({ ...(q as typeof p), x, y }) },
      { id: "s", x: p.x + p.w, y: p.y + p.h, apply: (q, x, y) => { const r = q as typeof p; return { ...r, w: Math.max(1, x - r.x), h: Math.max(1, y - r.y) }; } },
    ];
    case "triangle": return [
      { id: "1", x: p.x1, y: p.y1, apply: (q, x, y) => ({ ...(q as typeof p), x1: x, y1: y }) },
      { id: "2", x: p.x2, y: p.y2, apply: (q, x, y) => ({ ...(q as typeof p), x2: x, y2: y }) },
      { id: "3", x: p.x3, y: p.y3, apply: (q, x, y) => ({ ...(q as typeof p), x3: x, y3: y }) },
    ];
    case "circle": return [
      { id: "c", x: p.cx, y: p.cy, apply: (q, x, y) => ({ ...(q as typeof p), cx: x, cy: y }) },
      { id: "r", x: p.cx + p.r, y: p.cy, apply: (q, x, y) => { const r = q as typeof p; return { ...r, r: Math.max(1, dist(x, y, r.cx, r.cy)) }; } },
    ];
    case "ellipse": return [
      { id: "c", x: p.cx, y: p.cy, apply: (q, x, y) => ({ ...(q as typeof p), cx: x, cy: y }) },
      { id: "rx", x: p.cx + p.rx, y: p.cy, apply: (q, x, y) => { const r = q as typeof p; return { ...r, rx: Math.max(1, Math.abs(x - r.cx)) }; } },
      { id: "ry", x: p.cx, y: p.cy + p.ry, apply: (q, x, y) => { const r = q as typeof p; return { ...r, ry: Math.max(1, Math.abs(y - r.cy)) }; } },
    ];
    case "arc": {
      const rad = Math.PI / 180;
      const e0x = p.cx + p.r * Math.cos(p.a0 * rad), e0y = p.cy + p.r * Math.sin(p.a0 * rad);
      const e1x = p.cx + p.r * Math.cos(p.a1 * rad), e1y = p.cy + p.r * Math.sin(p.a1 * rad);
      const midA = p.a0 + ((((p.a1 - p.a0) % 360) + 360) % 360) / 2;
      const rmx = p.cx + p.r * Math.cos(midA * rad), rmy = p.cy + p.r * Math.sin(midA * rad);
      const angOf = (x: number, y: number, r: typeof p) => round1((Math.atan2(y - r.cy, x - r.cx) / rad + 360) % 360);
      return [
        { id: "c", x: p.cx, y: p.cy, apply: (q, x, y) => ({ ...(q as typeof p), cx: x, cy: y }) },
        // endpoints slide around the virtual circle (angle changes, radius fixed)
        { id: "e0", x: e0x, y: e0y, apply: (q, x, y) => { const r = q as typeof p; return { ...r, a0: angOf(x, y, r) }; } },
        { id: "e1", x: e1x, y: e1y, apply: (q, x, y) => { const r = q as typeof p; return { ...r, a1: angOf(x, y, r) }; } },
        // radius handle resizes the virtual circle
        { id: "r", x: rmx, y: rmy, control: true, apply: (q, x, y) => { const r = q as typeof p; return { ...r, r: Math.max(1, dist(x, y, r.cx, r.cy)) }; } },
      ];
    }
    case "path": {
      const hs: Handle[] = [];
      p.segments.forEach((s, si) => {
        const setSeg = (patch: Partial<PathSeg>) => (q: IconPrimitive) => {
          const r = q as typeof p;
          return { ...r, segments: r.segments.map((sg, i) => (i === si ? { ...sg, ...patch } as PathSeg : sg)) };
        };
        if ("x" in s) hs.push({ id: `${si}a`, x: s.x, y: s.y, apply: (q, x, y) => setSeg({ x, y })(q) });
        if (s.t === "Q") hs.push({ id: `${si}c`, x: s.cx, y: s.cy, control: true, apply: (q, x, y) => setSeg({ cx: x, cy: y } as Partial<PathSeg>)(q) });
        if (s.t === "C") {
          hs.push({ id: `${si}c1`, x: s.c1x, y: s.c1y, control: true, apply: (q, x, y) => setSeg({ c1x: x, c1y: y } as Partial<PathSeg>)(q) });
          hs.push({ id: `${si}c2`, x: s.c2x, y: s.c2y, control: true, apply: (q, x, y) => setSeg({ c2x: x, c2y: y } as Partial<PathSeg>)(q) });
        }
      });
      return hs;
    }
  }
}

const PRIM_TYPES: IconPrimitive["type"][] = ["line", "path", "rect", "triangle", "circle", "ellipse", "arc"];

// ── Translate a primitive by (dx,dy) in the 0..100 box ───────────────
function translatePrim(p: IconPrimitive, dx: number, dy: number): IconPrimitive {
  const r1 = (n: number) => round1(n);
  switch (p.type) {
    case "line": return { ...p, x1: r1(p.x1 + dx), y1: r1(p.y1 + dy), x2: r1(p.x2 + dx), y2: r1(p.y2 + dy) };
    case "rect": return { ...p, x: r1(p.x + dx), y: r1(p.y + dy) };
    case "triangle": return { ...p, x1: r1(p.x1 + dx), y1: r1(p.y1 + dy), x2: r1(p.x2 + dx), y2: r1(p.y2 + dy), x3: r1(p.x3 + dx), y3: r1(p.y3 + dy) };
    case "circle": return { ...p, cx: r1(p.cx + dx), cy: r1(p.cy + dy) };
    case "ellipse": return { ...p, cx: r1(p.cx + dx), cy: r1(p.cy + dy) };
    case "arc": return { ...p, cx: r1(p.cx + dx), cy: r1(p.cy + dy) };
    case "path": return { ...p, segments: p.segments.map((s) => {
      if (s.t === "M" || s.t === "L") return { ...s, x: r1(s.x + dx), y: r1(s.y + dy) };
      if (s.t === "Q") return { ...s, cx: r1(s.cx + dx), cy: r1(s.cy + dy), x: r1(s.x + dx), y: r1(s.y + dy) };
      return { ...s, c1x: r1(s.c1x + dx), c1y: r1(s.c1y + dy), c2x: r1(s.c2x + dx), c2y: r1(s.c2y + dy), x: r1(s.x + dx), y: r1(s.y + dy) };
    }) };
  }
}

// ── Bounding box of a primitive (ignores stroke width) ───────────────
function primBBox(p: IconPrimitive): { minX: number; minY: number; maxX: number; maxY: number } {
  const pts: [number, number][] = [];
  switch (p.type) {
    case "line": pts.push([p.x1, p.y1], [p.x2, p.y2]); break;
    case "rect": pts.push([p.x, p.y], [p.x + p.w, p.y + p.h]); break;
    case "triangle": pts.push([p.x1, p.y1], [p.x2, p.y2], [p.x3, p.y3]); break;
    case "circle": pts.push([p.cx - p.r, p.cy - p.r], [p.cx + p.r, p.cy + p.r]); break;
    case "ellipse": pts.push([p.cx - p.rx, p.cy - p.ry], [p.cx + p.rx, p.cy + p.ry]); break;
    case "arc": pts.push([p.cx - p.r, p.cy - p.r], [p.cx + p.r, p.cy + p.r]); break;
    case "path": for (const s of p.segments) {
      if ("x" in s) pts.push([s.x, s.y]);
      if (s.t === "Q") pts.push([s.cx, s.cy]);
      if (s.t === "C") { pts.push([s.c1x, s.c1y], [s.c2x, s.c2y]); }
    } break;
  }
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}
const rectsIntersect = (a: { minX: number; minY: number; maxX: number; maxY: number }, b: { minX: number; minY: number; maxX: number; maxY: number }) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

export function ArchimateIconLibraryClient() {
  const [tab, setTab] = useState<"editor" | "assign">("editor");
  const [icons, setIcons] = useState<LibIcon[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const r = await fetch("/api/admin/archimate-icon-library");
    if (r.ok) { const j = await r.json(); setIcons(j.icons ?? []); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <Link href="/dashboard/admin" className="text-sm text-gray-500 hover:text-gray-700">← SuperAdmin</Link>
      <h1 className="text-lg font-semibold text-gray-900 mt-2">ArchiMate Icon Library</h1>
      <p className="text-sm text-gray-600 mt-1">
        Upload an image of an ArchiMate icon, have it AI-traced into editable vector shapes, refine
        it, save it to the library, and assign it to an element type. Icons are stored as vector
        primitives and re-drawn live — they recolour to the element theme and stay crisp at any zoom.
      </p>

      <div className="mt-4 flex gap-2 border-b border-gray-200">
        {(["editor", "assign"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-sm -mb-px border-b-2 ${tab === t ? "border-red-500 text-red-600 font-medium" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t === "editor" ? "Icon Editor" : "Assign to Elements"}
          </button>
        ))}
      </div>

      {err && <div className="mt-3 text-xs text-red-600">{err}</div>}

      {tab === "editor"
        ? <IconEditor icons={icons} reload={reload} setErr={setErr} />
        : <AssignPanel icons={icons} setErr={setErr} />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Editor
// ════════════════════════════════════════════════════════════════════
function IconEditor({ icons, reload, setErr }: { icons: LibIcon[]; reload: () => Promise<void>; setErr: (s: string | null) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [defW, setDefW] = useState<string>("");
  const [defH, setDefH] = useState<string>("");
  const [primitives, setPrimitives] = useState<IconPrimitive[]>([]);
  const [sel, setSel] = useState<number | null>(null);          // primary (style/vertex controls)
  const [selSet, setSelSet] = useState<Set<number>>(new Set()); // group selection (lasso/move)
  const [marq, setMarq] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [underlay, setUnderlay] = useState<string | null>(null);
  const [bgGlyph, setBgGlyph] = useState<{ iconType: string; label: string } | null>(null); // built-in glyph as trace background
  const [cat, setCat] = useState<ArchimateCatalogue | null>(null);
  const [busy, setBusy] = useState(false);
  const [askName, setAskName] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ apply: Handle["apply"] } | null>(null);         // single vertex drag
  const move = useRef<{ start: { x: number; y: number }; snap: Map<number, IconPrimitive> } | null>(null); // group move
  const marqRef = useRef<{ x0: number; y0: number; additive: boolean } | null>(null); // lasso

  useEffect(() => { loadArchimateCatalogue().then(setCat).catch(() => {}); }, []);

  function clearSel() { setSel(null); setSelSet(new Set()); }
  function selectOne(i: number) { setSel(i); setSelSet(new Set([i])); }
  function toggleSel(i: number) {
    setSelSet((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
    setSel(i);
  }
  function resetNew() {
    setSelectedId(null); setName(""); setCategory(""); setDefW(""); setDefH("");
    setPrimitives([]); clearSel(); setSourceFile(null); setUnderlay(null); setBgGlyph(null);
  }
  function loadIcon(ic: LibIcon) {
    setSelectedId(ic.id); setName(ic.name); setCategory(ic.category ?? "");
    setDefW(ic.defaultWidth ? String(ic.defaultWidth) : ""); setDefH(ic.defaultHeight ? String(ic.defaultHeight) : "");
    setPrimitives(ic.primitives); clearSel(); setSourceFile(null); setBgGlyph(null);
    setUnderlay(ic.hasSource ? `/api/admin/archimate-icon-library/${ic.id}/source` : null);
  }

  // ── pointer → 0..100 viewBox coords ──
  const toBox = useCallback((e: React.PointerEvent): { x: number; y: number } | null => {
    const svg = svgRef.current; if (!svg) return null;
    const ctm = svg.getScreenCTM(); if (!ctm) return null;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: round1(p.x), y: round1(p.y) };
  }, []);

  const onSvgMove = useCallback((e: React.PointerEvent) => {
    const c = toBox(e); if (!c) return;
    if (drag.current && sel !== null) {                     // single-vertex drag
      const apply = drag.current.apply;
      setPrimitives((prev) => prev.map((p, i) => (i === sel ? apply(p, c.x, c.y) : p)));
    } else if (move.current) {                              // group translate
      const { start, snap } = move.current;
      const dx = c.x - start.x, dy = c.y - start.y;
      setPrimitives((prev) => prev.map((p, i) => (snap.has(i) ? translatePrim(snap.get(i)!, dx, dy) : p)));
    } else if (marqRef.current) {                           // lasso rubber-band
      setMarq({ x0: marqRef.current.x0, y0: marqRef.current.y0, x1: c.x, y1: c.y });
    }
  }, [sel, toBox]);

  function endPointer() {
    if (marqRef.current && marq) {
      const additive = marqRef.current.additive; // capture before we null the ref
      const box = { minX: Math.min(marq.x0, marq.x1), minY: Math.min(marq.y0, marq.y1), maxX: Math.max(marq.x0, marq.x1), maxY: Math.max(marq.y0, marq.y1) };
      const hit = primitives.map((p, i) => [i, primBBox(p)] as const).filter(([, b]) => rectsIntersect(b, box)).map(([i]) => i);
      setSelSet((prev) => { const n = additive ? new Set(prev) : new Set<number>(); hit.forEach((i) => n.add(i)); return n; });
      if (hit.length) setSel(hit[hit.length - 1]);
    }
    drag.current = null; move.current = null; marqRef.current = null; setMarq(null);
  }

  // Move the whole selection by (dx,dy) — "closer to / further from" any edge.
  const nudge = (dx: number, dy: number) => setPrimitives((prev) => prev.map((p, i) => (selSet.has(i) ? translatePrim(p, dx, dy) : p)));

  const patchSel = (patch: Partial<IconPrimitive>) =>
    setPrimitives((prev) => prev.map((p, i) => (i === sel ? { ...p, ...patch } as IconPrimitive : p)));

  const selPrim = sel !== null ? primitives[sel] : undefined;
  // Vertex handles only when exactly one primitive is selected; a group shows a
  // bounding box + move handle instead.
  const handles = selSet.size === 1 && selPrim ? handlesFor(selPrim) : [];
  const groupBox = selSet.size > 0 ? (() => {
    const bs = [...selSet].map((i) => primBBox(primitives[i])).filter(Boolean);
    return { minX: Math.min(...bs.map((b) => b.minX)), minY: Math.min(...bs.map((b) => b.minY)), maxX: Math.max(...bs.map((b) => b.maxX)), maxY: Math.max(...bs.map((b) => b.maxY)) };
  })() : null;

  async function onUpload(file: File) {
    setUnderlay(URL.createObjectURL(file)); setSourceFile(file); setBgGlyph(null);
    setBusy(true); setErr(null);
    try {
      const data = await fileToBase64(file);
      const res = await fetch("/api/admin/archimate-icon-library/vectorize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: data, mediaType: file.type }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? "Vectorize failed"); return; }
      setPrimitives(Array.isArray(j.primitives) ? j.primitives : []);
      setSel(null);
    } catch { setErr("Vectorize network error"); } finally { setBusy(false); }
  }

  async function doSave(finalName: string) {
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      fd.set("name", finalName);
      fd.set("category", category);
      fd.set("primitives", JSON.stringify(primitives));
      if (defW) fd.set("defaultWidth", defW);
      if (defH) fd.set("defaultHeight", defH);
      if (sourceFile) fd.set("file", sourceFile);
      const url = selectedId ? `/api/admin/archimate-icon-library/${selectedId}` : "/api/admin/archimate-icon-library";
      const res = await fetch(url, { method: selectedId ? "PUT" : "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? "Save failed"); return; }
      setName(finalName);
      if (!selectedId && j.id) setSelectedId(j.id);
      invalidateArchimateCustomIconCache();
      await reload();
    } catch { setErr("Save network error"); } finally { setBusy(false); }
  }
  function onSaveClick() {
    if (!name.trim()) { setAskName(true); return; }
    doSave(name.trim());
  }

  async function doDelete() {
    if (!selectedId) return;
    setConfirmDel(false); setBusy(true);
    try {
      await fetch(`/api/admin/archimate-icon-library/${selectedId}`, { method: "DELETE" });
      invalidateArchimateCustomIconCache();
      resetNew(); await reload();
    } finally { setBusy(false); }
  }

  const addPrim = (t: IconPrimitive["type"]) => { const idx = primitives.length; setPrimitives((p) => [...p, defaultPrim(t, p.length)]); selectOne(idx); };
  const delPrim = (i: number) => { setPrimitives((p) => p.filter((_, k) => k !== i)); clearSel(); };
  const moveZ = (i: number, dir: -1 | 1) => setPrimitives((prev) => {
    const j = i + dir; if (j < 0 || j >= prev.length) return prev;
    const next = [...prev]; [next[i], next[j]] = [next[j], next[i]];
    return next.map((p, k) => ({ ...p, z: k }));
  });

  return (
    <div className="mt-4 grid grid-cols-1 lg:grid-cols-[220px_1fr_240px] gap-4">
      {/* Library list */}
      <div className="bg-white border border-gray-200 rounded-lg p-2 self-start">
        <button onClick={resetNew} className="w-full mb-2 px-2 py-1.5 text-sm text-white bg-red-600 rounded hover:bg-red-700">+ New icon</button>
        <div className="space-y-1 max-h-[520px] overflow-y-auto">
          {icons.map((ic) => (
            <button key={ic.id} onClick={() => loadIcon(ic)}
              className={`w-full flex items-center gap-2 p-1.5 rounded border text-left ${selectedId === ic.id ? "border-red-400 bg-red-50" : "border-gray-200 hover:bg-gray-50"}`}>
              <svg viewBox="0 0 40 40" className="w-16 h-16 shrink-0"><rect x="1" y="1" width="38" height="38" fill="#fafafa" stroke="#eee" />{drawCustomIcon(ic.primitives, { cx: 20, cy: 20, size: 34, colour: "#334155" })}</svg>
              <span className="text-xs text-gray-700 truncate">{ic.name}</span>
            </button>
          ))}
          {!icons.length && <p className="text-xs text-gray-400 p-2">No icons yet.</p>}
        </div>
      </div>

      {/* Editing canvas */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 self-start">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <label className="px-2 py-1 text-xs border border-gray-300 rounded cursor-pointer hover:bg-gray-50">
            Upload image…
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }} />
          </label>
          {/* Load a current built-in glyph as a trace background to improve upon */}
          <select value={bgGlyph?.iconType ?? ""} className="px-1 py-1 text-xs border border-gray-300 rounded max-w-[160px]"
            onChange={(e) => {
              const it = e.target.value;
              if (!it) { setBgGlyph(null); return; }
              const label = e.target.selectedOptions[0]?.text ?? it;
              setBgGlyph({ iconType: it, label }); setUnderlay(null); setSourceFile(null);
              if (!name.trim()) setName(`${label} (custom)`);
            }}>
            <option value="">Load default glyph…</option>
            {cat?.categories.map((c) => {
              const opts = c.shapes.filter((s) => s.iconType && ICON_DRAWERS[s.iconType!]);
              if (!opts.length) return null;
              return (
                <optgroup key={c.id} label={CATEGORY_LABELS[c.id] ?? c.name}>
                  {opts.map((s) => <option key={s.key} value={s.iconType!}>{s.name}</option>)}
                </optgroup>
              );
            })}
          </select>
          {busy && <span className="text-xs text-amber-600">Working…</span>}
          {(underlay || bgGlyph) && <button onClick={() => { setUnderlay(null); setSourceFile(null); setBgGlyph(null); }} className="text-xs text-gray-500 hover:text-gray-700">clear background</button>}
          <span className="ml-auto text-[11px] text-gray-400">add:</span>
          {PRIM_TYPES.map((t) => (
            <button key={t} onClick={() => addPrim(t)} className="px-1.5 py-1 text-[11px] border border-gray-300 rounded hover:bg-gray-50 capitalize">{t}</button>
          ))}
        </div>

        <svg ref={svgRef} viewBox="0 0 100 100" className="w-full max-w-[560px] mx-auto block border border-gray-100 rounded bg-[repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6_6px,#fff_6px,#fff_12px)] touch-none"
          onPointerMove={onSvgMove} onPointerUp={endPointer} onPointerLeave={endPointer}>
          {underlay && <image href={underlay} x="0" y="0" width="100" height="100" opacity={0.25} preserveAspectRatio="xMidYMid meet" />}
          {/* current built-in glyph as a faint trace background */}
          {bgGlyph && ICON_DRAWERS[bgGlyph.iconType] && (
            <g opacity={0.3} pointerEvents="none">{ICON_DRAWERS[bgGlyph.iconType]!({ cx: 50, cy: 50, size: 76, colour: "#6b7280" })}</g>
          )}
          {/* background catcher: empty-area drag starts a lasso */}
          <rect x={0} y={0} width={100} height={100} fill="transparent"
            onPointerDown={(e) => { const c = toBox(e); if (!c) return; marqRef.current = { x0: c.x, y0: c.y, additive: e.shiftKey }; setMarq({ x0: c.x, y0: c.y, x1: c.x, y1: c.y }); }} />
          {drawCustomIcon(primitives, { cx: 50, cy: 50, size: 100, colour: EDIT_COLOUR })}
          {/* group bounding box + move handle */}
          {groupBox && (
            <g>
              <rect x={groupBox.minX} y={groupBox.minY} width={Math.max(0, groupBox.maxX - groupBox.minX)} height={Math.max(0, groupBox.maxY - groupBox.minY)}
                fill="rgba(59,130,246,0.06)" stroke="#3b82f6" strokeWidth={0.6} strokeDasharray="2 1.5"
                className="cursor-move"
                onPointerDown={(e) => { const c = toBox(e); if (!c) return; e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId); move.current = { start: c, snap: new Map([...selSet].map((i) => [i, primitives[i]])) }; }} />
              <circle cx={(groupBox.minX + groupBox.maxX) / 2} cy={(groupBox.minY + groupBox.maxY) / 2} r={2.4} fill="#3b82f6" stroke="#fff" strokeWidth={0.7} className="cursor-move"
                onPointerDown={(e) => { const c = toBox(e); if (!c) return; e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId); move.current = { start: c, snap: new Map([...selSet].map((i) => [i, primitives[i]])) }; }} />
            </g>
          )}
          {/* virtual circle guide for a selected arc — the endpoints ride this circle */}
          {selSet.size === 1 && selPrim?.type === "arc" && (
            <circle cx={selPrim.cx} cy={selPrim.cy} r={selPrim.r} fill="none" stroke="#f59e0b" strokeWidth={0.4} strokeDasharray="1.5 1.5" pointerEvents="none" opacity={0.7} />
          )}
          {/* single-primitive vertex + control handles */}
          {handles.map((h) => (
            <circle key={h.id} cx={h.x} cy={h.y} r={2} className="cursor-move"
              fill={h.control ? "#f59e0b" : "#ef4444"} stroke="#fff" strokeWidth={0.6}
              onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { apply: h.apply }; }} />
          ))}
          {/* lasso rubber-band */}
          {marq && (
            <rect x={Math.min(marq.x0, marq.x1)} y={Math.min(marq.y0, marq.y1)} width={Math.abs(marq.x1 - marq.x0)} height={Math.abs(marq.y1 - marq.y0)}
              fill="rgba(59,130,246,0.08)" stroke="#3b82f6" strokeWidth={0.5} strokeDasharray="1.5 1" pointerEvents="none" />
          )}
        </svg>
        <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-gray-500">
          <span>{selSet.size ? `${selSet.size} selected` : "drag on empty space to lasso; Shift-click list to multi-select"}</span>
          {selSet.size > 0 && (
            <span className="flex items-center gap-1">
              · move:
              <button onClick={() => nudge(0, -2)} className="px-1 border border-gray-300 rounded" title="up">↑</button>
              <button onClick={() => nudge(0, 2)} className="px-1 border border-gray-300 rounded" title="down">↓</button>
              <button onClick={() => nudge(-2, 0)} className="px-1 border border-gray-300 rounded" title="left">←</button>
              <button onClick={() => nudge(2, 0)} className="px-1 border border-gray-300 rounded" title="right">→</button>
            </span>
          )}
        </div>

        {/* Meta */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Icon name" className="border border-gray-300 rounded px-2 py-1 text-sm" />
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (optional)" className="border border-gray-300 rounded px-2 py-1 text-sm" />
          <label className="text-xs text-gray-600 flex items-center gap-1">Preferred size W
            <input value={defW} onChange={(e) => setDefW(e.target.value.replace(/[^0-9]/g, ""))} placeholder="auto" className="w-16 border border-gray-300 rounded px-1 py-0.5 text-xs" /></label>
          <label className="text-xs text-gray-600 flex items-center gap-1">H
            <input value={defH} onChange={(e) => setDefH(e.target.value.replace(/[^0-9]/g, ""))} placeholder="auto" className="w-16 border border-gray-300 rounded px-1 py-0.5 text-xs" /></label>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={onSaveClick} disabled={busy || !primitives.length} className="px-3 py-1.5 text-sm text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50">{selectedId ? "Save" : "Save new"}</button>
          {selectedId && <button onClick={() => setConfirmDel(true)} className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50">Delete</button>}
          <div className="ml-auto flex items-center gap-3">
            <PreviewBox primitives={primitives} label="glyph" size={27} />
            <ElementPreview primitives={primitives} w={Number(defW) || 27} h={Number(defH) || Number(defW) || 27} />
          </div>
        </div>
      </div>

      {/* Primitive list + style/arrow controls */}
      <div className="bg-white border border-gray-200 rounded-lg p-2 self-start">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 px-1">Shapes ({primitives.length})</div>
        <div className="space-y-1 max-h-[240px] overflow-y-auto">
          {primitives.map((p, i) => (
            <div key={i} className={`flex items-center gap-1 px-1.5 py-1 rounded border text-[11px] ${sel === i ? "border-red-400 bg-red-50" : selSet.has(i) ? "border-blue-300 bg-blue-50" : "border-gray-200"}`}>
              <button onClick={(e) => (e.shiftKey ? toggleSel(i) : selectOne(i))} className="flex-1 text-left capitalize">{i + 1}. {p.type}</button>
              <button onClick={() => moveZ(i, -1)} title="down" className="text-gray-400 hover:text-gray-700">▾</button>
              <button onClick={() => moveZ(i, 1)} title="up" className="text-gray-400 hover:text-gray-700">▴</button>
              <button onClick={() => delPrim(i)} title="delete" className="text-gray-400 hover:text-red-600">✕</button>
            </div>
          ))}
          {!primitives.length && <p className="text-[11px] text-gray-400 px-1">Empty — upload an image or add shapes.</p>}
        </div>

        {selPrim && (
          <div className="mt-3 border-t border-gray-100 pt-2 space-y-2">
            <div className="text-[11px] font-medium text-gray-500 uppercase">Selected {selPrim.type}</div>
            <label className="flex items-center gap-2 text-xs text-gray-600">Fill
              <select
                value={selPrim.filled ? (selPrim.fillRole ?? "ink") : "none"}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "none") patchSel({ filled: false });
                  else patchSel({ filled: true, fillRole: v as "ink" | "background" });
                }}
                className="border border-gray-300 rounded px-1 py-0.5 text-xs">
                <option value="none">None (transparent)</option>
                <option value="background">Background (mask)</option>
                <option value="ink">Theme (ink)</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-600">Stroke
              <input type="number" step="0.5" value={selPrim.strokeWidth} onChange={(e) => patchSel({ strokeWidth: parseFloat(e.target.value) || 0 })} className="w-16 border border-gray-300 rounded px-1 py-0.5 text-xs" />
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-600">Colour
              <select value={selPrim.colourRole ?? "stroke"} onChange={(e) => patchSel({ colourRole: e.target.value as IconPrimitive["colourRole"] })} className="border border-gray-300 rounded px-1 py-0.5 text-xs">
                <option value="stroke">Theme (stroke)</option>
                <option value="fill">Theme (fill)</option>
                <option value="fixed">Fixed…</option>
              </select>
            </label>
            {selPrim.colourRole === "fixed" && (
              <input type="color" value={selPrim.colour ?? "#000000"} onChange={(e) => patchSel({ colour: e.target.value })} className="w-10 h-6" />
            )}
            {(selPrim.type === "line" || selPrim.type === "path") && (
              <ArrowControls prim={selPrim} patch={patchSel} />
            )}
            {selPrim.type === "path" && (
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-gray-600"><input type="checkbox" checked={(selPrim as Extract<IconPrimitive, { type: "path" }>).closed} onChange={(e) => patchSel({ closed: e.target.checked } as Partial<IconPrimitive>)} /> Closed</label>
                <PathSegAdder prim={selPrim as Extract<IconPrimitive, { type: "path" }>} patch={patchSel} />
              </div>
            )}
          </div>
        )}
      </div>

      {askName && <PromptDialog title="Name this icon" placeholder="e.g. Business Object (custom)" onConfirm={(v) => { setAskName(false); if (v.trim()) doSave(v.trim()); }} onCancel={() => setAskName(false)} />}
      {confirmDel && <ConfirmDialog title="Delete icon" message="Delete this library icon? Any element assigned to it reverts to the built-in glyph." onConfirm={doDelete} onCancel={() => setConfirmDel(false)} />}
      {alert && <AlertDialog message={alert} onClose={() => setAlert(null)} />}
    </div>
  );
}

function ArrowControls({ prim, patch }: { prim: IconPrimitive; patch: (p: Partial<IconPrimitive>) => void }) {
  const p = prim as Extract<IconPrimitive, { type: "line" | "path" }>;
  const set = (which: "startArrow" | "endArrow", spec: ArrowSpec | undefined) => patch({ [which]: spec } as Partial<IconPrimitive>);
  const row = (which: "startArrow" | "endArrow", label: string) => {
    const a = p[which];
    return (
      <div className="flex items-center gap-1 text-[11px] text-gray-600">
        <span className="w-9">{label}</span>
        <select value={a?.style ?? "none"} onChange={(e) => set(which, e.target.value === "none" ? undefined : { style: e.target.value as ArrowSpec["style"], size: a?.size ?? 8, angle: a?.angle })}
          className="border border-gray-300 rounded px-1 py-0.5 text-[11px]">
          <option value="none">none</option><option value="open">open</option><option value="filled">filled</option>
        </select>
        {a && <>
          <input type="number" step="1" value={a.size} title="size" onChange={(e) => set(which, { ...a, size: parseFloat(e.target.value) || 8 })} className="w-12 border border-gray-300 rounded px-1 py-0.5 text-[11px]" />
          <input type="number" step="5" value={a.angle ?? ""} placeholder="auto°" title="angle°" onChange={(e) => set(which, { ...a, angle: e.target.value === "" ? undefined : parseFloat(e.target.value) })} className="w-14 border border-gray-300 rounded px-1 py-0.5 text-[11px]" />
          {a.angle != null && <button onClick={() => set(which, { ...a, angle: undefined })} title="reset to tangent" className="text-gray-400 hover:text-gray-700">↺</button>}
        </>}
      </div>
    );
  };
  return <div className="space-y-1">{row("startArrow", "start")}{row("endArrow", "end")}</div>;
}

function PathSegAdder({ prim, patch }: { prim: Extract<IconPrimitive, { type: "path" }>; patch: (p: Partial<IconPrimitive>) => void }) {
  const last = prim.segments[prim.segments.length - 1] as { x: number; y: number };
  const add = (seg: PathSeg) => patch({ segments: [...prim.segments, seg] } as Partial<IconPrimitive>);
  return (
    <div className="flex items-center gap-1">
      <span className="text-[11px] text-gray-400">+seg</span>
      <button onClick={() => add({ t: "L", x: Math.min(95, last.x + 15), y: last.y })} className="px-1 text-[11px] border border-gray-300 rounded">line</button>
      <button onClick={() => add({ t: "Q", cx: last.x + 8, cy: last.y - 15, x: Math.min(95, last.x + 16), y: last.y })} className="px-1 text-[11px] border border-gray-300 rounded">curve</button>
    </div>
  );
}

function PreviewBox({ primitives, label, size }: { primitives: IconPrimitive[]; label: string; size: number }) {
  return (
    <div className="text-center">
      <svg viewBox="0 0 40 40" className="w-20 h-20 border border-gray-100 rounded"><rect x="1" y="1" width="38" height="38" fill="#fff" stroke="#f0f0f0" />{drawCustomIcon(primitives, { cx: 20, cy: 20, size, colour: "#2563eb" })}</svg>
      <div className="text-[9px] text-gray-400">{label}</div>
    </div>
  );
}
function ElementPreview({ primitives, w, h }: { primitives: IconPrimitive[]; w: number; h: number }) {
  // Draw the glyph as a top-right corner marker on a sample element box.
  const bx = 6, by = 10, bw = 96, bh = 58;
  const cx = bx + bw - (w / 2 + 6), cy = by + (h / 2 + 6);
  return (
    <div className="text-center">
      <svg viewBox="0 0 108 78" className="w-[216px] h-[156px] border border-gray-100 rounded">
        <rect x={bx} y={by} width={bw} height={bh} fill="#eff6ff" stroke="#2563eb" strokeWidth={1.5} />
        {drawCustomIcon(primitives, { cx, cy, size: w, colour: "#2563eb", bg: "#eff6ff" })}
      </svg>
      <div className="text-[9px] text-gray-400">on element</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Assignment panel
// ════════════════════════════════════════════════════════════════════
const CATEGORY_LABELS: Record<string, string> = {
  business: "Business", motivation: "Motivation", strategy: "Strategy", application: "Application",
  technology: "Technology", "implementation-migration": "Implementation & Migration", composite: "Composite",
};

function AssignPanel({ icons, setErr }: { icons: LibIcon[]; setErr: (s: string | null) => void }) {
  const [cat, setCat] = useState<ArchimateCatalogue | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState("{}");
  const [buffers, setBuffers] = useState<CategoryBuffers>({});
  const [savedBuffers, setSavedBuffers] = useState("{}");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadArchimateCatalogue().then((c) => setCat(c)).catch(() => setErr("Catalogue load failed")); // start all categories collapsed
    fetch("/api/admin/archimate-icons-custom").then((r) => (r.ok ? r.json() : { assignments: {} })).then((j) => { const a = j.assignments ?? {}; setAssignments(a); setSaved(JSON.stringify(a)); }).catch(() => {});
    fetch("/api/admin/archimate-icon-buffers").then((r) => (r.ok ? r.json() : { buffers: {} })).then((j) => { const b = j.buffers ?? {}; setBuffers(b); setSavedBuffers(JSON.stringify(b)); }).catch(() => {});
  }, [setErr]);

  const dirty = JSON.stringify(assignments) !== saved;
  const buffersDirty = JSON.stringify(buffers) !== savedBuffers;

  // Effective buffer value for a category = saved override, else the built-in default.
  const bufVal = (catId: string, side: "top" | "right") => buffers[catId]?.[side] ?? builtinCategoryBuffer(catId)[side];
  function setBuf(catId: string, side: "top" | "right", v: number) {
    setBuffers((prev) => ({ ...prev, [catId]: { ...prev[catId], [side]: v } }));
  }
  function resetBuf(catId: string) {
    setBuffers((prev) => { const n = { ...prev }; delete n[catId]; return n; });
  }
  async function saveBuffers() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/admin/archimate-icon-buffers", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ buffers }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? "Save failed"); return; }
      const b = j.buffers ?? {}; setBuffers(b); setSavedBuffers(JSON.stringify(b));
      invalidateArchimateIconBufferCache();
    } catch { setErr("Network error"); } finally { setBusy(false); }
  }
  const iconById = useMemo(() => Object.fromEntries(icons.map((i) => [i.id, i])), [icons]);

  function setAssign(key: string, id: string) {
    setAssignments((prev) => { const n = { ...prev }; if (id) n[key] = id; else delete n[key]; return n; });
  }
  async function save() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/admin/archimate-icons-custom", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignments }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? "Save failed"); return; }
      const a = j.assignments ?? {}; setAssignments(a); setSaved(JSON.stringify(a));
      invalidateArchimateCustomIconCache();
    } catch { setErr("Network error"); } finally { setBusy(false); }
  }
  const toggle = (id: string) => setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="mt-4">
      <p className="text-xs text-gray-500 mb-3">
        Assign a library icon to an element type — it renders as that element&rsquo;s corner glyph
        everywhere (canvas + palette), for all users. Fine-tune position/size in
        <Link href="/dashboard/admin/archimate-icons" className="text-red-600 hover:underline"> ArchiMate Icon Maintenance</Link>,
        or set the icon&rsquo;s preferred size in the editor.
      </p>
      {!icons.length && <p className="text-xs text-amber-600 mb-3">Create an icon in the Editor tab first.</p>}

      {/* Per-category glyph edge buffers */}
      <div className="mb-4 bg-white border border-gray-200 rounded-lg p-3 max-w-2xl">
        <div className="text-xs font-medium text-gray-700 mb-1">Category glyph buffers</div>
        <p className="text-[11px] text-gray-500 mb-2">
          The gap (px) from an element&rsquo;s <strong>top</strong> / <strong>right</strong> edge to the glyph, applied to every element in that category. Negative = the glyph overhangs the edge. Blank inputs show the current built-in default.
        </p>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[10px] text-gray-400 uppercase tracking-wide">
            <span className="w-40">Category</span><span className="w-24 text-center">Top</span><span className="w-24 text-center">Right</span><span className="w-16 text-center">Default</span>
          </div>
          {cat?.categories.map((c) => {
            const bi = builtinCategoryBuffer(c.id);
            const overridden = buffers[c.id] && (buffers[c.id].top !== undefined || buffers[c.id].right !== undefined);
            return (
              <div key={c.id} className="flex items-center gap-2">
                <span className="w-40 text-xs text-gray-700">{CATEGORY_LABELS[c.id] ?? c.name}</span>
                <input type="number" step="0.5" value={bufVal(c.id, "top")} onChange={(e) => setBuf(c.id, "top", parseFloat(e.target.value) || 0)}
                  className="w-24 border border-gray-300 rounded px-1 py-0.5 text-xs text-center tabular-nums" />
                <input type="number" step="0.5" value={bufVal(c.id, "right")} onChange={(e) => setBuf(c.id, "right", parseFloat(e.target.value) || 0)}
                  className="w-24 border border-gray-300 rounded px-1 py-0.5 text-xs text-center tabular-nums" />
                <span className="w-16 text-center text-[10px] text-gray-400">{bi.top}/{bi.right}</span>
                {overridden && <button onClick={() => resetBuf(c.id)} title="reset to default" className="text-gray-400 hover:text-gray-700 text-xs">↺</button>}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <button onClick={saveBuffers} disabled={!buffersDirty || busy} className="px-3 py-1.5 text-xs text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50">Save buffers</button>
          {!buffersDirty && <span className="text-[11px] text-green-700">✓ Saved</span>}
          {buffersDirty && <span className="text-[11px] text-amber-600">Unsaved</span>}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden max-w-2xl">
        {cat?.categories.map((c) => {
          const open = expanded.has(c.id);
          const shapes = c.shapes.filter((s) => s.iconType && !s.iconType.startsWith("junction"));
          if (!shapes.length) return null;
          // Elements that have both a box AND an icon-only variant get a variant
          // tag so the two rows are distinguishable (they're independently assignable).
          const nameCount = new Map<string, number>();
          for (const s of shapes) nameCount.set(s.name, (nameCount.get(s.name) ?? 0) + 1);
          return (
            <div key={c.id} className="border-b border-gray-100 last:border-b-0">
              <button onClick={() => toggle(c.id)} className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                <span>{CATEGORY_LABELS[c.id] ?? c.name}</span><span className="text-gray-400">{open ? "▾" : "▸"}</span>
              </button>
              {open && (
                <div className="px-3 pb-2">
                  {shapes.map((s) => {
                    const assignedId = assignments[s.key];
                    const ic = assignedId ? iconById[assignedId] : undefined;
                    const builtIn = s.iconType ? ICON_DRAWERS[s.iconType] : undefined;
                    const variant = (nameCount.get(s.name) ?? 0) > 1 ? (s.variant === "icon" ? "icon" : "box") : null;
                    return (
                      <div key={s.key} className="flex items-center gap-2 py-1">
                        {/* 2× glyph — the assigned custom icon, else the CURRENT built-in glyph */}
                        <svg viewBox="0 0 24 24" className="w-12 h-12 shrink-0"><title>{ic ? "custom" : "current (built-in)"}</title>
                          {ic
                            ? drawCustomIcon(ic.primitives, { cx: 12, cy: 12, size: 22, colour: "#334155" })
                            : builtIn
                              ? builtIn({ cx: 12, cy: 12, size: 18, colour: "#94a3b8" })
                              : <rect x="4" y="4" width="16" height="16" fill="none" stroke="#ddd" strokeDasharray="2 2" />}
                        </svg>
                        <span className="flex-1 text-xs text-gray-700 truncate">
                          {s.name}
                          {variant && <span className={`ml-1 text-[10px] px-1 rounded ${variant === "icon" ? "bg-indigo-50 text-indigo-600" : "bg-gray-100 text-gray-500"}`}>{variant}</span>}
                          {!ic && <span className="ml-1 text-[10px] text-gray-400">(current)</span>}
                        </span>
                        <select value={assignedId ?? ""} onChange={(e) => setAssign(s.key, e.target.value)} className="border border-gray-300 rounded px-1 py-0.5 text-xs max-w-[160px]">
                          <option value="">Default (built-in)</option>
                          {icons.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                        </select>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={save} disabled={!dirty || busy} className="px-3 py-1.5 text-sm text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50">{busy ? "Saving…" : "Save assignments"}</button>
        {!dirty && <span className="text-xs text-green-700">✓ Saved</span>}
        {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
      </div>
    </div>
  );
}

// ── util ──
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result); resolve(s.slice(s.indexOf(",") + 1)); };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
