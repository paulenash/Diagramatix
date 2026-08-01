"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

type Scope = "whole" | "lane" | "pool" | "subprocess" | "group";

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
          const cropEl = (scope === "lane" || scope === "pool") && effElementId ? elements.find((e) => e.id === effElementId) : undefined;
          if (cropEl) {
            // Clone the canvas SVG, neutralise the pan/zoom transform, and set a
            // diagram-coordinate viewBox around the element so it crops cleanly.
            const P = 24;
            const vb = `${cropEl.x - P} ${cropEl.y - P} ${cropEl.width + 2 * P} ${cropEl.height + 2 * P}`;
            const clone = svg.cloneNode(true) as SVGSVGElement;
            const g = clone.querySelector("g");
            if (g) g.removeAttribute("transform");
            clone.setAttribute("viewBox", vb);
            clone.setAttribute("width", String(Math.min(1200, Math.round((cropEl.width + 2 * P) * 1.5))));
            clone.setAttribute("height", String(Math.round((cropEl.height + 2 * P) * 1.5)));
            clone.style.position = "fixed"; clone.style.left = "-100000px"; clone.style.top = "0";
            document.body.appendChild(clone);
            try { figure = await toPng(clone as unknown as HTMLElement, { backgroundColor: "#ffffff", cacheBust: true, pixelRatio: 2 }); }
            finally { document.body.removeChild(clone); }
          } else {
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
