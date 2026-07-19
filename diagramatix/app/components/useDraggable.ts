"use client";

/**
 * Makes a fixed-position control draggable and remembers where the user put it
 * (localStorage, per `storageKey`). Spread `handlers` onto the element and gate
 * its onClick with `didDrag()` so the click that ends a drag doesn't also fire
 * the button. `pos` is null until mount (SSR-safe) — render the element's default
 * corner classes while null, then the inline left/top once it loads.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface DragPos { left: number; top: number }

export function useDraggable(storageKey: string, fallback: () => DragPos, size = 44) {
  const [pos, setPos] = useState<DragPos | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const moved = useRef(false);

  // Keep a position fully inside the current viewport. A saved position (or the
  // resolution it was saved at) can be larger than today's window — without this
  // the control would render off-screen and be unreachable (e.g. the camera
  // button "disappearing" after a resize).
  const clampToView = useCallback((p: DragPos): DragPos => ({
    left: Math.max(0, Math.min((window.innerWidth || size) - size, p.left)),
    top: Math.max(0, Math.min((window.innerHeight || size) - size, p.top)),
  }), [size]);

  useEffect(() => {
    try {
      const s = localStorage.getItem(storageKey);
      setPos(clampToView(s ? (JSON.parse(s) as DragPos) : fallback()));
    } catch { setPos(clampToView(fallback())); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Re-clamp if the window shrinks so the control stays reachable.
  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clampToView(p) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampToView]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!pos) return;
    moved.current = false;
    drag.current = { x: e.clientX, y: e.clientY, left: pos.left, top: pos.top };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved.current = true;
    const left = Math.max(0, Math.min(window.innerWidth - size, drag.current.left + dx));
    const top = Math.max(0, Math.min(window.innerHeight - size, drag.current.top + dy));
    setPos({ left, top });
  }, [size]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (drag.current) {
      setPos((p) => {
        if (p) { try { localStorage.setItem(storageKey, JSON.stringify(p)); } catch {} }
        return p;
      });
    }
    drag.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, [storageKey]);

  const didDrag = useCallback(() => moved.current, []);

  return { pos, handlers: { onPointerDown, onPointerMove, onPointerUp }, didDrag };
}
