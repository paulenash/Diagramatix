"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface ContextMenuItem {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Why it is disabled (shown as the tooltip). */
  title?: string;
  danger?: boolean;
  /** A thin line before this item. */
  separatorBefore?: boolean;
}

/**
 * A small right-click menu at the pointer. Replaces the browser's own menu on the Project screen (Paul, 2026-10-06). Closes on a
 * click elsewhere, Escape, a scroll or a resize; stays inside the window; items can be disabled with a reason.
 */
export function ContextMenuPopup({ x, y, items, onClose, label }: { x: number; y: number; items: ContextMenuItem[]; onClose: () => void; label?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)),
    });
  }, [x, y, items.length]);

  useEffect(() => {
    const away = (e: Event) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    // Capture phase, so a click on something that stops propagation still closes the menu.
    document.addEventListener("mousedown", away, true);
    document.addEventListener("contextmenu", away, true);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    document.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", away, true);
      document.removeEventListener("contextmenu", away, true);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
      document.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label ?? "Context menu"}
      data-testid="context-menu"
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-[80] min-w-40 bg-white border border-gray-200 rounded-md shadow-lg py-1 text-xs select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => (
        <div key={i}>
          {it.separatorBefore && <hr className="my-1 border-gray-100" />}
          <button
            role="menuitem"
            disabled={it.disabled}
            title={it.title}
            onClick={() => { if (it.disabled) return; onClose(); it.onClick?.(); }}
            className={`block w-full text-left px-3 py-1.5 ${
              it.disabled ? "text-gray-300 cursor-not-allowed"
              : it.danger ? "text-red-600 hover:bg-red-50"
              : "text-gray-700 hover:bg-gray-50"
            }`}
          >{it.label}</button>
        </div>
      ))}
    </div>
  );
}
