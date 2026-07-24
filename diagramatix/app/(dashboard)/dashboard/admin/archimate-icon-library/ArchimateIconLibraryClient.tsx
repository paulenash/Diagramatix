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
import { invalidateArchimateCustomIconCache } from "@/app/lib/archimate/useArchimateCustomIcon";
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

const PRIM_TYPES: IconPrimitive["type"][] = ["line", "path", "rect", "triangle", "circle", "ellipse"];

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
  const [sel, setSel] = useState<number | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [underlay, setUnderlay] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [askName, setAskName] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ apply: Handle["apply"] } | null>(null);

  function resetNew() {
    setSelectedId(null); setName(""); setCategory(""); setDefW(""); setDefH("");
    setPrimitives([]); setSel(null); setSourceFile(null); setUnderlay(null);
  }
  function loadIcon(ic: LibIcon) {
    setSelectedId(ic.id); setName(ic.name); setCategory(ic.category ?? "");
    setDefW(ic.defaultWidth ? String(ic.defaultWidth) : ""); setDefH(ic.defaultHeight ? String(ic.defaultHeight) : "");
    setPrimitives(ic.primitives); setSel(null); setSourceFile(null);
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
    if (!drag.current || sel === null) return;
    const c = toBox(e); if (!c) return;
    const apply = drag.current.apply;
    setPrimitives((prev) => prev.map((p, i) => (i === sel ? apply(p, c.x, c.y) : p)));
  }, [sel, toBox]);

  const patchSel = (patch: Partial<IconPrimitive>) =>
    setPrimitives((prev) => prev.map((p, i) => (i === sel ? { ...p, ...patch } as IconPrimitive : p)));

  const selPrim = sel !== null ? primitives[sel] : undefined;
  const handles = selPrim ? handlesFor(selPrim) : [];

  async function onUpload(file: File) {
    setUnderlay(URL.createObjectURL(file)); setSourceFile(file);
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

  const addPrim = (t: IconPrimitive["type"]) => { setPrimitives((p) => [...p, defaultPrim(t, p.length)]); setSel(primitives.length); };
  const delPrim = (i: number) => { setPrimitives((p) => p.filter((_, k) => k !== i)); setSel(null); };
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
              <svg viewBox="0 0 40 40" className="w-8 h-8 shrink-0"><rect x="1" y="1" width="38" height="38" fill="#fafafa" stroke="#eee" />{drawCustomIcon(ic.primitives, { cx: 20, cy: 20, size: 34, colour: "#334155" })}</svg>
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
          {busy && <span className="text-xs text-amber-600">Working…</span>}
          {underlay && <button onClick={() => { setUnderlay(null); setSourceFile(null); }} className="text-xs text-gray-500 hover:text-gray-700">clear underlay</button>}
          <span className="ml-auto text-[11px] text-gray-400">add:</span>
          {PRIM_TYPES.map((t) => (
            <button key={t} onClick={() => addPrim(t)} className="px-1.5 py-1 text-[11px] border border-gray-300 rounded hover:bg-gray-50 capitalize">{t}</button>
          ))}
        </div>

        <svg ref={svgRef} viewBox="0 0 100 100" className="w-full max-w-[420px] mx-auto block border border-gray-100 rounded bg-[repeating-linear-gradient(45deg,#fafafa,#fafafa_6px,#fff_6px,#fff_12px)]"
          onPointerMove={onSvgMove} onPointerUp={() => (drag.current = null)} onPointerLeave={() => (drag.current = null)}>
          {underlay && <image href={underlay} x="0" y="0" width="100" height="100" opacity={0.2} preserveAspectRatio="xMidYMid meet" />}
          {drawCustomIcon(primitives, { cx: 50, cy: 50, size: 100, colour: EDIT_COLOUR })}
          {/* selectable hit-areas: click any primitive's bbox centre marker */}
          {handles.map((h) => (
            <circle key={h.id} cx={h.x} cy={h.y} r={2} className="cursor-move"
              fill={h.control ? "#f59e0b" : "#ef4444"} stroke="#fff" strokeWidth={0.6}
              onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { apply: h.apply }; }} />
          ))}
        </svg>

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
            <div key={i} className={`flex items-center gap-1 px-1.5 py-1 rounded border text-[11px] ${sel === i ? "border-red-400 bg-red-50" : "border-gray-200"}`}>
              <button onClick={() => setSel(i)} className="flex-1 text-left capitalize">{i + 1}. {p.type}</button>
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
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={selPrim.filled} onChange={(e) => patchSel({ filled: e.target.checked })} /> Filled
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
      <svg viewBox="0 0 40 40" className="w-10 h-10 border border-gray-100 rounded"><rect x="1" y="1" width="38" height="38" fill="#fff" stroke="#f0f0f0" />{drawCustomIcon(primitives, { cx: 20, cy: 20, size, colour: "#2563eb" })}</svg>
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
      <svg viewBox="0 0 108 78" className="w-[108px] h-[78px] border border-gray-100 rounded">
        <rect x={bx} y={by} width={bw} height={bh} fill="#eff6ff" stroke="#2563eb" strokeWidth={1.5} />
        {drawCustomIcon(primitives, { cx, cy, size: w, colour: "#2563eb" })}
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadArchimateCatalogue().then((c) => { setCat(c); if (c.categories[0]) setExpanded(new Set([c.categories[0].id])); }).catch(() => setErr("Catalogue load failed"));
    fetch("/api/admin/archimate-icons-custom").then((r) => (r.ok ? r.json() : { assignments: {} })).then((j) => { const a = j.assignments ?? {}; setAssignments(a); setSaved(JSON.stringify(a)); }).catch(() => {});
  }, [setErr]);

  const dirty = JSON.stringify(assignments) !== saved;
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
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden max-w-2xl">
        {cat?.categories.map((c) => {
          const open = expanded.has(c.id);
          const shapes = c.shapes.filter((s) => s.iconType && !s.iconType.startsWith("junction"));
          if (!shapes.length) return null;
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
                    return (
                      <div key={s.key} className="flex items-center gap-2 py-1">
                        <svg viewBox="0 0 24 24" className="w-6 h-6 shrink-0">{ic ? drawCustomIcon(ic.primitives, { cx: 12, cy: 12, size: 22, colour: "#334155" }) : <rect x="4" y="4" width="16" height="16" fill="none" stroke="#ddd" strokeDasharray="2 2" />}</svg>
                        <span className="flex-1 text-xs text-gray-700 truncate">{s.name}</span>
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
