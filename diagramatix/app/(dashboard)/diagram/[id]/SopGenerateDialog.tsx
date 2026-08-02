"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import { computeBoundaryCrossings } from "@/app/lib/sop/boundaryCrossings";

type Scope = "whole" | "lane" | "pool" | "subprocess" | "group";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Draw a green "To:/From:" boundary box for every connector that crosses out of
 * the shown region, into a cloned+cropped canvas SVG (diagram coordinates). Two
 * lines: line 1 = "To:/From: <lane/pool context>", line 2 = target name / message.
 */
function injectBoundaryStubs(clone: SVGSVGElement, data: DiagramData, scope: Scope, scopeElementId: string) {
  const crossings = computeBoundaryCrossings(data, scope, scopeElementId);
  if (crossings.length === 0) return;
  const byId = new Map((data.elements ?? []).map((e) => [e.id, e]));
  const stack = new Map<string, number>(); // (element:side) → count, to fan out overlaps
  const FONT = 9, LINE_H = 12, PAD_X = 4, PAD_Y = 3, GAP = 8;

  for (const cx of crossings) {
    const inEl = byId.get(cx.inElementId);
    if (!inEl) continue;
    const ecx = inEl.x + inEl.width / 2, ecy = inEl.y + inEl.height / 2;
    const dx = cx.peerX - ecx, dy = cx.peerY - ecy;
    const lines = [`${cx.direction === "out" ? "To" : "From"}: ${cx.context}`, cx.detail];
    const boxW = Math.min(190, Math.max(64, Math.max(...lines.map((l) => l.length)) * FONT * 0.6 + PAD_X * 2));
    const boxH = lines.length * LINE_H + PAD_Y * 2;

    let side: "top" | "bottom" | "left" | "right", ax: number, ay: number;
    if (Math.abs(dy) >= Math.abs(dx)) { side = dy < 0 ? "top" : "bottom"; ax = ecx; ay = dy < 0 ? inEl.y - GAP : inEl.y + inEl.height + GAP; }
    else { side = dx < 0 ? "left" : "right"; ax = dx < 0 ? inEl.x - GAP : inEl.x + inEl.width + GAP; ay = ecy; }
    const key = `${cx.inElementId}:${side}`;
    const n = stack.get(key) ?? 0; stack.set(key, n + 1);

    let bx: number, by: number;
    if (side === "top") { bx = ax - boxW / 2; by = ay - boxH - n * (boxH + 3); }
    else if (side === "bottom") { bx = ax - boxW / 2; by = ay + n * (boxH + 3); }
    else if (side === "left") { bx = ax - boxW - n * (boxW + 3); by = ay - boxH / 2; }
    else { bx = ax + n * (boxW + 3); by = ay - boxH / 2; }

    const g = document.createElementNS(SVG_NS, "g");
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", String(bx)); rect.setAttribute("y", String(by));
    rect.setAttribute("width", String(boxW)); rect.setAttribute("height", String(boxH));
    rect.setAttribute("rx", "3");
    rect.setAttribute("fill", "#f0fdf4"); rect.setAttribute("stroke", "#16a34a"); rect.setAttribute("stroke-width", "1.5");
    g.appendChild(rect);
    lines.forEach((ln, i) => {
      const t = document.createElementNS(SVG_NS, "text");
      t.setAttribute("x", String(bx + PAD_X));
      t.setAttribute("y", String(by + PAD_Y + (i + 1) * LINE_H - 3));
      t.setAttribute("font-size", String(FONT));
      t.setAttribute("font-family", "sans-serif");
      t.setAttribute("fill", "#166534");
      if (i === 0) t.setAttribute("font-weight", "600");
      t.textContent = ln;
      g.appendChild(t);
    });
    clone.appendChild(g);
  }
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
      let figure: string | undefined;
      try {
        const svg = document.querySelector("svg[data-canvas]") as SVGSVGElement | null;
        if (svg) {
          const { toPng } = await import("html-to-image");
          const cropEl = needsElement && effElementId ? elements.find((e) => e.id === effElementId) : undefined;
          // A subprocess LINKED to a child diagram is documented from the child,
          // which isn't on this canvas — skip the (parent) figure in that case.
          const isLinkedSub = cropEl?.type && (cropEl.type === "subprocess" || cropEl.type === "subprocess-expanded") && !!cropEl.properties?.linkedDiagramId;
          if (cropEl && !isLinkedSub) {
            // Clone the canvas SVG, neutralise the pan/zoom transform, and set a
            // diagram-coordinate viewBox around the element so it crops cleanly.
            // Extra padding leaves room for the green boundary stubs.
            const P = 70;
            const vb = `${cropEl.x - P} ${cropEl.y - P} ${cropEl.width + 2 * P} ${cropEl.height + 2 * P}`;
            const clone = svg.cloneNode(true) as SVGSVGElement;
            const g = clone.querySelector("g");
            if (g) g.removeAttribute("transform");
            clone.setAttribute("viewBox", vb);
            clone.setAttribute("width", String(Math.min(1400, Math.round((cropEl.width + 2 * P) * 1.4))));
            clone.setAttribute("height", String(Math.round((cropEl.height + 2 * P) * 1.4)));
            injectBoundaryStubs(clone, data, scope, effElementId!);
            clone.style.position = "fixed"; clone.style.left = "-100000px"; clone.style.top = "0";
            document.body.appendChild(clone);
            try { figure = await toPng(clone as unknown as HTMLElement, { backgroundColor: "#ffffff", cacheBust: true, pixelRatio: 2 }); }
            finally { document.body.removeChild(clone); }
          } else if (scope === "whole" || scope === "group") {
            figure = await toPng(svg as unknown as HTMLElement, { backgroundColor: "#ffffff", cacheBust: true, pixelRatio: 2 });
          }
        }
      } catch { /* proceed without a figure */ }
      const res = await fetch(`/api/projects/${projectId}/sop`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagramId, scope, scopeElementId: effElementId, figure }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.id) { setErr(j.error ?? "SOP generation failed"); return; }
      router.push(`/dashboard/projects/${projectId}/sop/${j.id}`);
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
