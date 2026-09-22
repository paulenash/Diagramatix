"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/**
 * A small draggable reference window.
 *
 * Lifted out of `VoiceAssistBar` so the Canvas Help card can be the same
 * object rather than a second one that drifts from it (Paul, 2026-09-22: "a
 * popup moveable window summary, like the Voice Assist Commands window").
 * Nothing about it is Voice-Assist-specific; it was only ever defined there
 * because that is where the first one was needed.
 *
 * Stops mousedown from reaching the canvas, so dragging the card never pans
 * the diagram behind it or clears the selection.
 */
export function FloatingPanel({
  title,
  onClose,
  children,
  initial = { x: 24, y: 88 },
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Where it opens. Defaults to the top-left of the canvas area. */
  initial?: { x: number; y: number };
}) {
  const [pos, setPos] = useState(initial);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const x = Math.max(0, Math.min(window.innerWidth - 120, e.clientX - drag.current.dx));
    const y = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - drag.current.dy));
    setPos({ x, y });
  };
  const onUp = () => { drag.current = null; };
  return (
    <div className="fixed z-50 w-[420px] max-w-[92vw] bg-white rounded-xl shadow-2xl border border-purple-200 flex flex-col"
      style={{ left: pos.x, top: pos.y, maxHeight: "70vh" }}
      onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 cursor-move select-none touch-none"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        title="Drag to move">
        <span className="text-sm font-semibold text-purple-800">{title}</span>
        <button onClick={onClose} onPointerDown={(e) => e.stopPropagation()} className="text-gray-400 hover:text-gray-600 text-lg leading-none" title="Close">×</button>
      </div>
      <div className="overflow-y-auto px-3 py-2">{children}</div>
    </div>
  );
}
