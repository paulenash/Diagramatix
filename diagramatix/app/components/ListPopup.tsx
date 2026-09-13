"use client";

import { useEffect } from "react";

/**
 * A small popup for a list: title, a SCROLLABLE body, and a Continue button in
 * a footer that stays put outside the scroll region.
 *
 * Paul, 2026-09-14, on moving the Project screen's sidebar sections into the
 * Project menu: "It should open a small popup screen with a scrollable list of
 * the current … links and options and a Continue button at the bottom right
 * outside the scrollable region." Two sections asked for the same shape, so it
 * is one component — the SOP list and the Entity Structure both mount here.
 *
 * Same chrome as ConfirmDialog (white card, top-left title, footer rule) so it
 * reads as the app's own dialog rather than a new kind of thing. Escape and a
 * backdrop click both Continue; there is nothing to cancel, only to leave.
 */
export function ListPopup({
  title, subtitle, onContinue, continueLabel = "Continue", width = "max-w-2xl", children,
}: {
  title: string;
  subtitle?: string;
  onContinue: () => void;
  continueLabel?: string;
  /** Tailwind max-width class for the card. */
  width?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onContinue(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onContinue]);

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[70] p-4" onClick={onContinue}>
      <div
        role="dialog"
        aria-label={title}
        className={`bg-white rounded-lg shadow-xl w-full ${width} flex flex-col max-h-[85vh]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 shrink-0">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {/* The list. Only THIS region scrolls; the footer below never moves. */}
        <div className="px-5 pb-3 overflow-y-auto min-h-0 flex-1">
          {children}
        </div>
        <div className="flex justify-end px-5 py-3 border-t border-gray-100 shrink-0">
          <button
            onClick={onContinue}
            autoFocus
            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
          >
            {continueLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
