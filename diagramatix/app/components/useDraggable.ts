"use client";

/**
 * Makes a fixed-position control draggable and remembers where the user put it
 * (localStorage, per `storageKey`). Spread `handlers` onto the element and gate
 * its onClick with `didDrag()` so the click that ends a drag doesn't also fire
 * the button. `pos` is null until mount (SSR-safe) — render the element's default
 * corner classes while null, then the inline left/bottom once it loads.
 *
 * Positions are **anchored to the BOTTOM edge** (`{ left, bottom }`, both px):
 * render with `style={{ left, bottom }}` so the control stays pinned to the
 * bottom of the window when it (or a panel) is resized — the whole point of the
 * "home is bottom-left, stays on the bottom" behaviour. Legacy `{ left, top }`
 * saved positions are migrated on load.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface DragPos { left: number; bottom: number }

export function useDraggable(storageKey: string, fallback: () => DragPos, size = 44) {
  const [pos, setPos] = useState<DragPos | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; bottom: number } | null>(null);
  const moved = useRef(false);

  // Keep the control fully inside the current viewport (guards a saved position
  // from a larger window / resolution).
  const clampToView = useCallback((p: DragPos): DragPos => ({
    left: Math.max(0, Math.min((window.innerWidth || size) - size, p.left)),
    bottom: Math.max(0, Math.min((window.innerHeight || size) - size, p.bottom)),
  }), [size]);

  useEffect(() => {
    try {
      const s = localStorage.getItem(storageKey);
      if (s) {
        const raw = JSON.parse(s) as Partial<DragPos> & { top?: number };
        // Migrate legacy top-anchored positions → bottom-anchored.
        const bottom = typeof raw.bottom === "number"
          ? raw.bottom
          : Math.max(0, (window.innerHeight || size) - (raw.top ?? 0) - size);
        setPos(clampToView({ left: raw.left ?? 0, bottom }));
      } else {
        setPos(clampToView(fallback()));
      }
    } catch { setPos(clampToView(fallback())); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Re-clamp if the window shrinks so the control stays reachable. Because the
  // anchor is the BOTTOM edge, a window grow/shrink keeps it on the bottom for
  // free — this only pulls it in when it would otherwise fall outside.
  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clampToView(p) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampToView]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!pos) return;
    moved.current = false;
    drag.current = { x: e.clientX, y: e.clientY, left: pos.left, bottom: pos.bottom };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved.current = true;
    const left = Math.max(0, Math.min(window.innerWidth - size, drag.current.left + dx));
    // Dragging DOWN (dy > 0) reduces the distance from the bottom edge.
    const bottom = Math.max(0, Math.min(window.innerHeight - size, drag.current.bottom - dy));
    setPos({ left, bottom });
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
