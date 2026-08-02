"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import { computeBoundaryCrossings } from "@/app/lib/sop/boundaryCrossings";

type Scope = "whole" | "lane" | "pool" | "subprocess" | "group";

const SVG_NS = "http://www.w3.org/2000/svg";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface StubBox { x: number; y: number; w: number; h: number; lines: string[] }

const STUB_FONT = 9, STUB_LINE_H = 12, STUB_PAD_X = 5, STUB_PAD_Y = 4;
const STUB_OUT = 16;   // clearance from the fragment boundary to the first row/column
const STUB_HPAD = 8;   // min horizontal gap between two boxes sharing a row

/**
 * Lay out a green "To:/From:" boundary box for every connector that crosses the
 * fragment boundary — placed OUTSIDE the fragment (the lane/pool) on the side
 * toward the peer, and de-overlapped: same-side boxes never overlap horizontally;
 * when they would, they stack into vertical rows separated by half a box height.
 * Returns the boxes in diagram coordinates so the caller can grow the viewBox to
 * include them (nothing clipped). Line 1 = "To:/From: <context>", line 2 = detail.
 */
function layoutBoundaryStubs(data: DiagramData, scope: Scope, scopeElementId: string, cropEl: DiagramElement): StubBox[] {
  const crossings = computeBoundaryCrossings(data, scope, scopeElementId);
  if (crossings.length === 0) return [];
  const byId = new Map((data.elements ?? []).map((e) => [e.id, e]));
  const cl = cropEl.x, cr = cropEl.x + cropEl.width, ct = cropEl.y, cb = cropEl.y + cropEl.height;
  const ccx = cl + cropEl.width / 2, ccy = ct + cropEl.height / 2;

  type Item = { lines: string[]; w: number; h: number; side: "top" | "bottom" | "left" | "right"; ax: number; ay: number };
  const items: Item[] = crossings.map((cx) => {
    const inEl = byId.get(cx.inElementId);
    const lines = [`${cx.direction === "out" ? "To" : "From"}: ${cx.context}`, cx.detail];
    const w = Math.min(200, Math.max(72, Math.max(...lines.map((l) => l.length)) * STUB_FONT * 0.6 + STUB_PAD_X * 2));
    const h = lines.length * STUB_LINE_H + STUB_PAD_Y * 2;
    // Which boundary edge does this cross? Decide by the peer's direction from the
    // fragment centre (lanes stack vertically → cross top/bottom; pools sit side by
    // side → messages cross left/right).
    const dx = cx.peerX - ccx, dy = cx.peerY - ccy;
    const side = Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? "top" : "bottom") : (dx < 0 ? "left" : "right");
    // Anchor along the edge = the in-scope element's centre, clamped to the fragment.
    const ax = inEl ? clamp(inEl.x + inEl.width / 2, cl, cr) : ccx;
    const ay = inEl ? clamp(inEl.y + inEl.height / 2, ct, cb) : ccy;
    return { lines, w, h, side, ax, ay };
  });

  const boxes: StubBox[] = [];
  for (const sideName of ["top", "bottom", "left", "right"] as const) {
    const group = items.filter((i) => i.side === sideName);
    if (!group.length) continue;
    const h = Math.max(...group.map((g) => g.h));
    const vgap = h / 2; // "separate bottom of one from top of another by 1/2 label height"

    if (sideName === "top" || sideName === "bottom") {
      group.sort((a, b) => a.ax - b.ax);
      const rowRight: number[] = []; // rightmost x used, per row
      for (const g of group) {
        const bx = g.ax - g.w / 2;
        let r = 0;
        for (; r < rowRight.length; r++) if (bx >= rowRight[r] + STUB_HPAD) break;
        if (r === rowRight.length) rowRight.push(-Infinity);
        rowRight[r] = bx + g.w;
        const by = sideName === "top"
          ? ct - STUB_OUT - (r + 1) * h - r * vgap
          : cb + STUB_OUT + r * (h + vgap);
        boxes.push({ x: bx, y: by, w: g.w, h, lines: g.lines });
      }
    } else {
      group.sort((a, b) => a.ay - b.ay);
      let prevBottom = -Infinity;
      for (const g of group) {
        let by = g.ay - g.h / 2;
        if (by < prevBottom + vgap) by = prevBottom + vgap;
        prevBottom = by + g.h;
        const bx = sideName === "left" ? cl - STUB_OUT - g.w : cr + STUB_OUT;
        boxes.push({ x: bx, y: by, w: g.w, h: g.h, lines: g.lines });
      }
    }
  }
  return boxes;
}

/** Draw the laid-out green boundary boxes into the cloned SVG. */
function drawBoundaryStubs(clone: SVGSVGElement, boxes: StubBox[]) {
  for (const b of boxes) {
    const g = document.createElementNS(SVG_NS, "g");
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", String(b.x)); rect.setAttribute("y", String(b.y));
    rect.setAttribute("width", String(b.w)); rect.setAttribute("height", String(b.h));
    rect.setAttribute("rx", "3");
    rect.setAttribute("fill", "#f0fdf4"); rect.setAttribute("stroke", "#16a34a"); rect.setAttribute("stroke-width", "1.5");
    g.appendChild(rect);
    b.lines.forEach((ln, i) => {
      const t = document.createElementNS(SVG_NS, "text");
      t.setAttribute("x", String(b.x + STUB_PAD_X));
      t.setAttribute("y", String(b.y + STUB_PAD_Y + (i + 1) * STUB_LINE_H - 3));
      t.setAttribute("font-size", String(STUB_FONT));
      t.setAttribute("font-family", "sans-serif");
      t.setAttribute("fill", "#166534");
      if (i === 0) t.setAttribute("font-weight", "600");
      t.textContent = ln;
      g.appendChild(t);
    });
    clone.appendChild(g);
  }
}

/** Remove selection chrome (resize handles + the dashed blue selected-outline) from
 *  a cloned canvas SVG so the SOP figure isn't marred by the editor's selection. */
function stripSelectionChrome(clone: SVGSVGElement) {
  clone.querySelectorAll("[data-resize-handle]").forEach((n) => n.remove());
  clone.querySelectorAll("rect").forEach((r) => {
    const s = r.getAttribute("stroke");
    if ((s === "#2563eb" || s === "#3b82f6") && r.getAttribute("stroke-dasharray")) r.setAttribute("stroke", "none");
  });
}

/** Serialise a (viewBox'd) SVG clone to a PNG data URI via an offscreen <img> +
 *  <canvas>. Reliable for our inline-styled canvas SVG — unlike html-to-image's
 *  toPng on a bare <svg>, which fails silently and left SOPs with no figure. */
async function svgToPng(clone: SVGSVGElement, outW: number, outH: number): Promise<string | undefined> {
  try {
    clone.setAttribute("xmlns", SVG_NS);
    const xml = new XMLSerializer().serializeToString(clone);
    const src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("svg load")); img.src = src; });
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(outW * scale));
    canvas.height = Math.max(1, Math.round(outH * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch { return undefined; }
}

/** Capture the SOP figure: the whole diagram (fit to its content), or — for a
 *  lane/pool/inline-subprocess scope — cropped to that element with the green
 *  "To:/From:" boundary boxes on every crossing connector. */
async function captureFigure(data: DiagramData, scope: Scope, scopeElementId: string | undefined, elements: DiagramElement[]): Promise<string | undefined> {
  try {
    const svg = document.querySelector("svg[data-canvas]") as SVGSVGElement | null;
    if (!svg) return undefined;
    const cropEl = scopeElementId ? elements.find((e) => e.id === scopeElementId) : undefined;
    const isLinkedSub = !!cropEl && (cropEl.type === "subprocess" || cropEl.type === "subprocess-expanded") && !!cropEl.properties?.linkedDiagramId;

    let bx: number, by: number, bw: number, bh: number;
    let boxes: StubBox[] = [];
    if (cropEl && !isLinkedSub) {
      // Boundary labels first, then grow the crop to include them so they sit
      // OUTSIDE the fragment and never clip. Start from a snug pad around the element.
      boxes = layoutBoundaryStubs(data, scope, scopeElementId!, cropEl);
      const PAD = 24;
      let minX = cropEl.x - PAD, minY = cropEl.y - PAD;
      let maxX = cropEl.x + cropEl.width + PAD, maxY = cropEl.y + cropEl.height + PAD;
      for (const b of boxes) {
        minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
      }
      const M = 12; // outer breathing room around everything
      bx = minX - M; by = minY - M; bw = (maxX - minX) + 2 * M; bh = (maxY - minY) + 2 * M;
    } else if (scope === "whole" || scope === "group") {
      const els = elements.filter((e) => e.width > 0 && e.height > 0);
      if (els.length === 0) return undefined;
      const minX = Math.min(...els.map((e) => e.x)), minY = Math.min(...els.map((e) => e.y));
      const maxX = Math.max(...els.map((e) => e.x + e.width)), maxY = Math.max(...els.map((e) => e.y + e.height));
      const M = 30; bx = minX - M; by = minY - M; bw = (maxX - minX) + 2 * M; bh = (maxY - minY) + 2 * M;
    } else {
      return undefined; // linked subprocess → the child diagram isn't on this canvas
    }

    const clone = svg.cloneNode(true) as SVGSVGElement;
    const g = clone.querySelector("g");
    if (g) g.removeAttribute("transform");
    stripSelectionChrome(clone);
    clone.setAttribute("viewBox", `${bx} ${by} ${bw} ${bh}`);
    const outW = Math.min(1400, Math.max(320, Math.round(bw)));
    const outH = Math.max(1, Math.round(bh * (outW / bw)));
    clone.setAttribute("width", String(outW));
    clone.setAttribute("height", String(outH));
    if (boxes.length) drawBoundaryStubs(clone, boxes);
    return await svgToPng(clone, outW, outH);
  } catch { return undefined; }
}

/**
 * Generate an SOP from the current BPMN diagram. Pick a scope — the whole
 * process, a single Lane (a role-specific SOP with hand-offs), a Pool, or a
 * Subprocess — then generate + open the editable SOP. Deterministic extract →
 * AI prose → stored SopDocument (POST /api/projects/:id/sop).
 */
export function SopGenerateDialog({
  projectId, diagramId, data, initialScope, initialElementId, onClose,
}: {
  projectId: string;
  diagramId: string;
  data: DiagramData;
  initialScope?: Scope;
  initialElementId?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const elements = data.elements ?? [];
  const lanes = useMemo(() => elements.filter((e) => e.type === "lane"), [elements]);
  const pools = useMemo(() => elements.filter((e) => e.type === "pool"), [elements]);
  const subs = useMemo(() => elements.filter((e) => e.type === "subprocess" || e.type === "subprocess-expanded"), [elements]);

  const [scope, setScope] = useState<Scope>(initialScope ?? "whole");
  const [elementId, setElementId] = useState<string>(initialElementId ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const label = (e: DiagramElement) => e.label?.trim() || `(unnamed ${e.type})`;
  const listFor = scope === "lane" ? lanes : scope === "pool" ? pools : scope === "subprocess" ? subs : [];
  const needsElement = scope === "lane" || scope === "pool" || scope === "subprocess";
  const effElementId = needsElement ? (elementId || listFor[0]?.id || "") : undefined;

  async function generate() {
    if (needsElement && !effElementId) { setErr("Pick a " + scope + " first."); return; }
    setBusy(true); setErr(null);
    try {
      // Capture the diagram as a PNG figure. For a Lane/Pool SOP, crop to that
      // element's bounds so the figure shows just the role's swim-lane. Best-
      // effort — if rasterisation fails, the SOP is still generated without it.
      const figure = await captureFigure(data, scope, needsElement && effElementId ? effElementId : undefined, elements);
      const res = await fetch(`/api/projects/${projectId}/sop`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagramId, scope, scopeElementId: effElementId, figure }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.id) { setErr(j.error ?? "SOP generation failed"); return; }
      router.push(`/dashboard/projects/${projectId}/sop/${j.id}?from=${encodeURIComponent(`/diagram/${diagramId}`)}`);
    } catch { setErr("SOP generation failed"); }
    finally { setBusy(false); }
  }

  const scopeOpts: { value: Scope; label: string; hint: string; disabled?: boolean }[] = [
    { value: "whole", label: "Whole diagram", hint: "The full end-to-end process." },
    { value: "lane", label: "A Lane (role SOP)", hint: "Only that role's steps, with hand-offs to/from other lanes.", disabled: lanes.length === 0 },
    { value: "pool", label: "A Pool", hint: "One participant's part of the process.", disabled: pools.length === 0 },
    { value: "subprocess", label: "A Subprocess", hint: "One subprocess (its linked diagram if linked).", disabled: subs.length === 0 },
    { value: "group", label: "A linked group (suite)", hint: "One procedure per diagram linked from this one — a suite. Takes longer." },
  ];

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50" onClick={busy ? undefined : onClose}>
      <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 p-5 w-[440px]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Generate SOP</h2>
        <p className="text-xs text-gray-500 mb-4">Create an editable Standard Operating Procedure from this process. Pick the scope, then edit and export to Word.</p>

        <div className="space-y-1.5 mb-3">
          {scopeOpts.map((o) => (
            <label key={o.value} className={`flex items-start gap-2 rounded border px-2 py-1.5 cursor-pointer ${scope === o.value ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:bg-gray-50"} ${o.disabled ? "opacity-40 cursor-not-allowed" : ""}`}>
              <input type="radio" name="sop-scope" className="mt-0.5" checked={scope === o.value} disabled={o.disabled}
                onChange={() => { setScope(o.value); setElementId(""); }} />
              <span className="text-[11px]">
                <span className="font-medium text-gray-800">{o.label}</span>
                <span className="block text-[10px] text-gray-500">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>

        {needsElement && (
          <div className="mb-3">
            <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">Which {scope}?</label>
            <select value={effElementId} onChange={(e) => setElementId(e.target.value)}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-800">
              {listFor.map((e) => <option key={e.id} value={e.id}>{label(e)}</option>)}
            </select>
          </div>
        )}

        {err && <p className="text-[11px] text-red-600 mb-2">{err}</p>}
        {busy && <p className="text-[11px] text-blue-700 mb-2 flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />Generating the SOP with AI (15–30s)…</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button onClick={generate} disabled={busy} className="px-3 py-1 text-xs text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">
            {busy ? "Working…" : "Generate SOP"}
          </button>
        </div>
      </div>
    </div>
  );
}
