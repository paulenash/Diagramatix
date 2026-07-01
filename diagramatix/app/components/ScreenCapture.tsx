"use client";

/**
 * SuperAdmin screen-capture tool for authoring the User Guide. A bottom-left
 * camera button freezes the current screen — INCLUDING any open menu — by
 * rasterising the live DOM on pointer-down (before the menu's outside-click close
 * fires). It then shows a dimmed overlay with a resizable crop rectangle (whole
 * screen / canvas / a dragged region); on save the crop is POSTed to the DB-backed
 * help-image library, named by screen (+ diagram). Only SuperAdmins see the button.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import * as htmlToImage from "html-to-image";
import { SUPERUSER_EMAILS } from "@/app/lib/superuser";
import { screenNameFromPath } from "@/app/lib/help/screenName";
import { getCurrentDiagramName } from "@/app/lib/help/currentDiagram";
import { useDraggable } from "./useDraggable";

type Rect = { x: number; y: number; w: number; h: number };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const HANDLES: { id: string; cls: string; cursor: string }[] = [
  { id: "nw", cls: "left-0 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "nwse-resize" },
  { id: "n", cls: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "ns-resize" },
  { id: "ne", cls: "right-0 top-0 translate-x-1/2 -translate-y-1/2", cursor: "nesw-resize" },
  { id: "e", cls: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2", cursor: "ew-resize" },
  { id: "se", cls: "right-0 bottom-0 translate-x-1/2 translate-y-1/2", cursor: "nwse-resize" },
  { id: "s", cls: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2", cursor: "ns-resize" },
  { id: "sw", cls: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2", cursor: "nesw-resize" },
  { id: "w", cls: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2", cursor: "ew-resize" },
];

export function ScreenCapture() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const email = session?.user?.email;
  const isSuper = !!email && SUPERUSER_EMAILS.has(email);
  const { pos, handlers, didDrag } = useDraggable("diagramatix.camera.btnPos", () => ({ left: 64, top: window.innerHeight - 56 }));

  const [frozen, setFrozen] = useState<string | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ mode: string; sx: number; sy: number; orig: Rect } | null>(null);

  const reset = useCallback(() => {
    setFrozen(null); setNat(null); setRect(null); setAlt(""); setError(null);
    imgRef.current = null;
  }, []);

  const capture = useCallback(async () => {
    if (frozen) return;
    setError(null); setSaved(null); setToast(null);
    const w = window.innerWidth, h = window.innerHeight;
    try {
      const dataUrl = await htmlToImage.toPng(document.body, {
        width: w,
        height: h,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        cacheBust: true,
        backgroundColor: "#ffffff",
        skipFonts: true,
        filter: (node) => !(node instanceof HTMLElement && node.hasAttribute("data-no-capture")),
      });
      if (!dataUrl || dataUrl.length < 100) throw new Error("the capture came back empty");
      const im = new Image();
      im.onload = () => { imgRef.current = im; setNat({ w: im.naturalWidth, h: im.naturalHeight }); };
      im.onerror = () => setToast("The captured image could not be decoded.");
      im.src = dataUrl;
      setFrozen(dataUrl);
      // Default crop = a centred inset so the box + handles are clearly visible
      // (a full-viewport default sits at the screen edges and looks like nothing).
      const m = 0.12;
      setRect({ x: Math.round(w * m), y: Math.round(h * m), w: Math.round(w * (1 - 2 * m)), h: Math.round(h * (1 - 2 * m)) });
    } catch (e) {
      setToast("Capture failed — " + ((e as Error).message ?? "unknown") + ".");
    }
  }, [frozen]);

  // Hotkey fallback (Alt+Shift+C) — also fires before menu close.
  useEffect(() => {
    if (!isSuper) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && (e.key === "C" || e.key === "c")) { e.preventDefault(); void capture(); }
      if (e.key === "Escape" && frozen) reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isSuper, capture, frozen, reset]);

  // ── crop drag/resize ──
  const onMove = useCallback((e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const W = window.innerWidth, H = window.innerHeight;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    let { x, y, w, h } = d.orig;
    if (d.mode === "move") {
      x = clamp(x + dx, 0, W - w);
      y = clamp(y + dy, 0, H - h);
    } else {
      if (d.mode.includes("e")) w = clamp(d.orig.w + dx, 24, W - x);
      if (d.mode.includes("s")) h = clamp(d.orig.h + dy, 24, H - y);
      if (d.mode.includes("w")) { const nx = clamp(x + dx, 0, x + w - 24); w += x - nx; x = nx; }
      if (d.mode.includes("n")) { const ny = clamp(y + dy, 0, y + h - 24); h += y - ny; y = ny; }
    }
    setRect({ x, y, w, h });
  }, []);

  const onUp = useCallback(() => {
    drag.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  }, [onMove]);

  const startDrag = useCallback((e: React.PointerEvent, mode: string) => {
    if (!rect) return;
    e.preventDefault(); e.stopPropagation();
    drag.current = { mode, sx: e.clientX, sy: e.clientY, orig: rect };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [rect, onMove, onUp]);

  function preset(kind: "whole" | "canvas") {
    const W = window.innerWidth, H = window.innerHeight;
    if (kind === "whole") { setRect({ x: 0, y: 0, w: W, h: H }); return; }
    // Canvas: bound the main content area if we can find it.
    const el = document.querySelector("[data-capture-region], main, svg") as HTMLElement | SVGElement | null;
    if (el) {
      const r = el.getBoundingClientRect();
      const x = clamp(r.left, 0, W), y = clamp(r.top, 0, H);
      setRect({ x, y, w: clamp(r.width, 24, W - x), h: clamp(r.height, 24, H - y) });
    } else setRect({ x: 0, y: 0, w: W, h: H });
  }

  async function save() {
    if (!rect || !nat || !imgRef.current) { setError("Still preparing the image — try Save again in a moment."); return; }
    setBusy(true); setError(null);
    try {
      const sx = nat.w / window.innerWidth, sy = nat.h / window.innerHeight;
      const cw = Math.max(1, Math.round(rect.w * sx)), ch = Math.max(1, Math.round(rect.h * sy));
      const canvas = document.createElement("canvas");
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(imgRef.current, Math.round(rect.x * sx), Math.round(rect.y * sy), cw, ch, 0, 0, cw, ch);
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
      if (!blob) throw new Error("could not build PNG");

      const screen = screenNameFromPath(pathname);
      const diagram = getCurrentDiagramName();
      const base = [screen, diagram].filter(Boolean).join(" — ");
      const filename = (base || "screen").replace(/[^\w.-]+/g, "-").toLowerCase().replace(/-+/g, "-") + ".png";

      const fd = new FormData();
      fd.append("file", blob, filename);
      fd.append("screenName", screen);
      if (diagram) fd.append("diagramName", diagram);
      if (alt.trim()) fd.append("alt", alt.trim());
      fd.append("filename", filename);
      fd.append("width", String(cw)); fd.append("height", String(ch));

      const res = await fetch("/api/help/images", { method: "POST", body: fd });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? "Save failed"); }
      const j = await res.json();
      setSaved(`Saved “${j.filename}” to the guide image library.`);
      reset();
      setTimeout(() => setSaved(null), 5000);
    } catch (e) {
      setError((e as Error).message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!isSuper) return null;

  const screen = screenNameFromPath(pathname);
  const diagram = frozen ? getCurrentDiagramName() : null;

  return (
    <div data-no-capture>
      <button
        onPointerDown={(e) => { e.preventDefault(); handlers.onPointerDown(e); }}
        onPointerMove={handlers.onPointerMove}
        onPointerUp={(e) => { handlers.onPointerUp(e); if (!didDrag()) void capture(); }}
        title="Capture this screen for the User Guide (open a menu first to include it). Click to capture · drag to move · Alt+Shift+C"
        aria-label="Capture screen for User Guide"
        style={pos ? { left: pos.left, top: pos.top, touchAction: "none" } : { touchAction: "none" }}
        className={`fixed ${pos ? "" : "bottom-4 left-16"} z-[70] w-10 h-10 flex items-center justify-center rounded-full border-2 border-gray-300 bg-white text-gray-600 hover:border-orange-400 hover:text-orange-600 hover:scale-110 transition-all cursor-grab active:cursor-grabbing`}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      </button>

      {saved && (
        <div className="fixed bottom-16 left-16 z-[72] max-w-xs px-3 py-2 rounded bg-green-600 text-white text-xs shadow-lg">{saved}</div>
      )}
      {toast && (
        <div onClick={() => setToast(null)} className="fixed bottom-16 left-16 z-[10000] max-w-sm px-3 py-2 rounded bg-red-600 text-white text-xs shadow-lg cursor-pointer">{toast}</div>
      )}

      {frozen && rect && (
        <div className="fixed inset-0 z-[9998] select-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={frozen} alt="" className="absolute inset-0 w-screen h-screen pointer-events-none" />

          {/* crop rectangle — box-shadow dims everything outside it */}
          <div
            className="absolute border-2 border-blue-400"
            style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)", cursor: "move" }}
            onPointerDown={(e) => startDrag(e, "move")}
          >
            {HANDLES.map((h) => (
              <div
                key={h.id}
                onPointerDown={(e) => startDrag(e, h.id)}
                className={`absolute w-3 h-3 bg-white border border-blue-500 rounded-sm ${h.cls}`}
                style={{ cursor: h.cursor }}
              />
            ))}
          </div>

          {/* toolbar */}
          <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-[9999] bg-white rounded-lg shadow-xl border border-gray-200 p-3 w-[28rem] max-w-[92vw]">
            <p className="text-xs text-gray-500 mb-2">
              Capturing <span className="font-medium text-gray-800">{screen}</span>
              {diagram && <> — <span className="font-medium text-gray-800">{diagram}</span></>}
              · {Math.round(rect.w)}×{Math.round(rect.h)} px
            </p>
            <div className="flex gap-1 mb-2">
              <button onClick={() => preset("whole")} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50">Whole screen</button>
              <button onClick={() => preset("canvas")} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50">Canvas</button>
              <span className="text-[11px] text-gray-400 self-center ml-1">or drag the box / handles</span>
            </div>
            <input
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="Image description (optional) — what the image shows"
              className="w-full text-xs border border-gray-300 rounded px-2 py-1 mb-2 text-gray-800 placeholder:text-gray-500"
            />
            {error && <p className="text-[11px] text-red-500 mb-1">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={reset} disabled={busy} className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={save} disabled={busy} className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {busy ? "Saving…" : "Save to library"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
