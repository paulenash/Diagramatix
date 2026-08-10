"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DiagramData } from "@/app/lib/diagram/types";
import { renderTemplateThumbnailSvg, thumbnailTransform } from "@/app/lib/diagram/templateThumbnail";

interface Transform { s: number; x: number; y: number }

/**
 * Read-only diagram viewer for mobile: scroll (1-finger pan) + zoom (pinch, +/−
 * buttons, double-tap-to-fit). Renders the diagram as a pure SVG string.
 *
 * An optional `overlay` is rendered INSIDE the same transformed layer, so it shares
 * the SVG coordinate space (viewBox 0 0 w h) and pans/zooms with the diagram — used
 * by the mobile review layer to draw comment pins + tethers. In `pickMode`, a plain
 * tap (not a pan/pinch) is reported to `onPick(svgX, svgY)` so the caller can
 * hit-test an element and attach a review comment. The BPMN is never mutated here.
 */
export function MobileDiagramView({
  data,
  overlay,
  pickMode = false,
  onPick,
}: {
  data: DiagramData;
  overlay?: React.ReactNode;
  pickMode?: boolean;
  onPick?: (svgX: number, svgY: number) => void;
}) {
  const svg = useMemo(() => renderTemplateThumbnailSvg(data as never), [data]);
  // Same transform the SVG uses internally, so the overlay lines up exactly.
  const dims = useMemo(() => {
    const { w, h } = thumbnailTransform((data.elements ?? []) as never);
    return { w, h };
  }, [data]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [t, setT] = useState<Transform>({ s: 1, x: 0, y: 0 });
  const tRef = useRef(t);
  tRef.current = t;

  // Gesture state (kept in a ref so moves don't thrash React state).
  const g = useRef<{ mode: "none" | "pan" | "pinch"; x: number; y: number; dist: number; startS: number; midX: number; midY: number }>(
    { mode: "none", x: 0, y: 0, dist: 0, startS: 1, midX: 0, midY: 0 },
  );
  // True once the current touch interaction has moved/pinched — so the trailing
  // click isn't misread as a tap (pick / double-tap-fit).
  const movedRef = useRef(false);

  function fit() {
    const el = containerRef.current;
    if (!el) return;
    const cw = el.clientWidth, ch = el.clientHeight;
    if (!cw || !ch) return;
    const s = Math.min(cw / dims.w, ch / dims.h) * 0.96;
    setT({ s, x: (cw - dims.w * s) / 2, y: (ch - dims.h * s) / 2 });
  }

  // Fit on mount, on data change, and on resize / orientation change.
  useEffect(() => { fit(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dims.w, dims.h]);
  useEffect(() => {
    const onResize = () => fit();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => { window.removeEventListener("resize", onResize); window.removeEventListener("orientationchange", onResize); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims.w, dims.h]);

  const dist = (a: React.Touch, b: React.Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  // Zoom by `factor` around container point (px,py), clamped.
  function zoomAround(factor: number, px: number, py: number) {
    setT((cur) => {
      const ns = Math.max(0.1, Math.min(8, cur.s * factor));
      const k = ns / cur.s;
      return { s: ns, x: px - (px - cur.x) * k, y: py - (py - cur.y) * k };
    });
  }

  function onTouchStart(e: React.TouchEvent) {
    const el = containerRef.current!;
    const rect = el.getBoundingClientRect();
    movedRef.current = false;
    if (e.touches.length === 1) {
      g.current = { ...g.current, mode: "pan", x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      movedRef.current = true; // a two-finger interaction is never a tap
      g.current = {
        mode: "pinch",
        x: 0, y: 0,
        dist: dist(e.touches[0], e.touches[1]),
        startS: tRef.current.s,
        midX: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
        midY: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
      };
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    if (g.current.mode === "pan" && e.touches.length === 1) {
      const dx = e.touches[0].clientX - g.current.x;
      const dy = e.touches[0].clientY - g.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedRef.current = true;
      g.current.x = e.touches[0].clientX; g.current.y = e.touches[0].clientY;
      setT((cur) => ({ ...cur, x: cur.x + dx, y: cur.y + dy }));
    } else if (g.current.mode === "pinch" && e.touches.length === 2) {
      const d = dist(e.touches[0], e.touches[1]);
      const factor = d / (g.current.dist || d);
      g.current.dist = d;
      zoomAround(factor, g.current.midX, g.current.midY);
    }
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length === 0) g.current.mode = "none";
    else if (e.touches.length === 1) g.current = { ...g.current, mode: "pan", x: e.touches[0].clientX, y: e.touches[0].clientY };
  }

  // Desktop niceties (device-mode testing): wheel zoom.
  function onWheel(e: React.WheelEvent) {
    const rect = containerRef.current!.getBoundingClientRect();
    zoomAround(e.deltaY < 0 ? 1.1 : 0.9, e.clientX - rect.left, e.clientY - rect.top);
  }

  // Screen point → SVG (diagram-thumbnail) coordinate.
  function toSvg(clientX: number, clientY: number): { x: number; y: number } {
    const rect = containerRef.current!.getBoundingClientRect();
    const cur = tRef.current;
    return { x: (clientX - rect.left - cur.x) / cur.s, y: (clientY - rect.top - cur.y) / cur.s };
  }

  // Double-tap to fit + (in pickMode) single-tap to pick.
  const lastTap = useRef(0);
  function onClick(e: React.MouseEvent) {
    if (movedRef.current) return; // trailing click after a pan/pinch — ignore
    const now = Date.now();
    const isDouble = now - lastTap.current < 300;
    lastTap.current = now;
    if (isDouble) { fit(); return; }
    if (pickMode && onPick) {
      const p = toSvg(e.clientX, e.clientY);
      onPick(p.x, p.y);
    }
  }

  return (
    <div ref={containerRef} onWheel={onWheel} onClick={onClick}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      className={`relative w-full h-full overflow-hidden bg-white select-none ${pickMode ? "cursor-crosshair" : ""}`}
      style={{ touchAction: "none" }}
    >
      {/* Backdrop — the diagram picture (identical to the read-only viewer). */}
      <div
        style={{ position: "absolute", left: 0, top: 0, width: dims.w, height: dims.h, transformOrigin: "0 0", transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})` }}
        dangerouslySetInnerHTML={{ __html: svg.replace("<svg ", `<svg width="${dims.w}" height="${dims.h}" `) }}
      />
      {/* Interactive overlay — a SEPARATE layer with the SAME transform, so review
          pins line up with the backdrop. pointer-events:none lets gestures pass to
          the container; the pins themselves opt back in. */}
      {overlay && (
        <div
          style={{ position: "absolute", left: 0, top: 0, width: dims.w, height: dims.h, transformOrigin: "0 0", transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`, pointerEvents: "none" }}
        >
          <svg width={dims.w} height={dims.h} viewBox={`0 0 ${dims.w} ${dims.h}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
            {overlay}
          </svg>
        </div>
      )}
      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
        <button onClick={(e) => { e.stopPropagation(); const r = containerRef.current!.getBoundingClientRect(); zoomAround(1.25, r.width / 2, r.height / 2); }}
          className="w-10 h-10 rounded-full bg-white shadow border border-gray-200 text-xl text-gray-700 active:bg-gray-100">+</button>
        <button onClick={(e) => { e.stopPropagation(); const r = containerRef.current!.getBoundingClientRect(); zoomAround(0.8, r.width / 2, r.height / 2); }}
          className="w-10 h-10 rounded-full bg-white shadow border border-gray-200 text-xl text-gray-700 active:bg-gray-100">−</button>
        <button onClick={(e) => { e.stopPropagation(); fit(); }}
          className="w-10 h-10 rounded-full bg-white shadow border border-gray-200 text-[10px] font-medium text-gray-700 active:bg-gray-100">Fit</button>
      </div>
    </div>
  );
}
