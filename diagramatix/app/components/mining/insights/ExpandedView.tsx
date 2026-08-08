"use client";

/**
 * Full-screen "Expand" overlay for an Insights tab — gives the discovered process
 * as much room as possible with the tables underneath. The diagram is
 * click-to-zoom (click zooms in centred on the point, Esc resets to fit), and a
 * Return button closes back to the mining console. Reuses ReplayDiagramBackdrop.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DiagramData } from "@/app/lib/diagram/types";
import { ReplayDiagramBackdrop } from "@/app/components/simulation/replay/ReplayDiagramBackdrop";

function diagramBounds(data: DiagramData, pad = 24) {
  const xs = data.elements.flatMap((e) => [e.x, e.x + e.width]);
  const ys = data.elements.flatMap((e) => [e.y, e.y + e.height]);
  if (!xs.length) return { minX: 0, minY: 0, w: 100, h: 100 };
  const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
  return { minX, minY, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 };
}

/** SVG diagram with click-to-zoom (Esc resets via `resetKey` bump from the parent). */
function ZoomableDiagram({ data, visibleIds, resetKey, extra }: { data: DiagramData; visibleIds?: Set<string>; resetKey: number; extra?: ReactNode }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const b = useMemo(() => diagramBounds(data), [data]);
  const [zoom, setZoom] = useState(1);
  const [focus, setFocus] = useState({ x: b.minX + b.w / 2, y: b.minY + b.h / 2 });

  useEffect(() => { setZoom(1); setFocus({ x: b.minX + b.w / 2, y: b.minY + b.h / 2 }); }, [resetKey, b.minX, b.minY, b.w, b.h]);

  const vw = b.w / zoom, vh = b.h / zoom;
  const vx = Math.min(Math.max(focus.x - vw / 2, b.minX), b.minX + b.w - vw);
  const vy = Math.min(Math.max(focus.y - vh / 2, b.minY), b.minY + b.h - vh);

  function onClick(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current; if (!svg) return;
    const ctm = svg.getScreenCTM(); if (!ctm) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    setFocus({ x: p.x, y: p.y });
    setZoom((z) => Math.min(8, z * 1.6));
  }

  return (
    <svg ref={svgRef} viewBox={`${vx} ${vy} ${vw} ${vh}`} onClick={onClick}
      className="w-full h-full cursor-zoom-in" preserveAspectRatio="xMidYMid meet" style={{ background: "#f5f5f4" }}>
      <ReplayDiagramBackdrop data={data} visibleIds={visibleIds} />
      {extra}
    </svg>
  );
}

export function ExpandedView({ title, data, visibleIds, extra, onClose, children }: {
  title: string;
  data: DiagramData | null;
  visibleIds?: Set<string>;
  extra?: ReactNode;              // extra SVG overlay drawn inside the zoomable svg (e.g. replay tokens)
  onClose: () => void;
  children?: ReactNode;          // the tables, shown under the diagram
}) {
  const [resetKey, setResetKey] = useState(0);
  const [zoomHint, setZoomHint] = useState(0); // bump to nudge the hint on reset

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); setResetKey((k) => k + 1); setZoomHint((z) => z + 1); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div data-no-capture className="fixed inset-0 z-[80] bg-stone-950/97 flex flex-col font-mono">
      <div className="flex items-center justify-between px-4 py-2 border-b border-amber-900/50 shrink-0">
        <h3 className="text-sm font-semibold text-amber-200">{title}</h3>
        <div className="flex items-center gap-3">
          <span key={zoomHint} className="text-[11px] text-stone-400">Click the diagram to zoom in · Esc to reset</span>
          <button onClick={onClose} className="text-xs bg-amber-700 hover:bg-amber-600 text-white rounded px-3 py-1">↩ Return</button>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col p-3 gap-3">
        <div className="flex-[3] min-h-0 rounded border border-stone-700 overflow-hidden">
          {data ? <ZoomableDiagram data={data} visibleIds={visibleIds} resetKey={resetKey} extra={extra} />
            : <div className="p-4 text-stone-500 text-sm">No discovered diagram — Discover the process first.</div>}
        </div>
        {children && <div className="flex-[2] min-h-0 overflow-auto text-stone-200">{children}</div>}
      </div>
    </div>
  );
}
