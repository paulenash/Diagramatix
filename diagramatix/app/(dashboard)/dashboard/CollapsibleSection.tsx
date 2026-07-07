"use client";

import { useState, type ReactNode } from "react";

/**
 * Dashboard collapsible section. A heading row with a disclosure triangle
 * + title on the left and an optional action (e.g. "+ New Diagram") on the
 * right; the action stays in the header even when the body is collapsed.
 * Default-open is configurable so empty sections (e.g. an empty Sandpit)
 * can start collapsed while still showing their action button.
 */
export function CollapsibleSection({
  title,
  count,
  defaultOpen = true,
  action,
  titleAction,
  children,
}: {
  title: string;
  /** Optional count shown next to the title, e.g. "Projects (4)". */
  count?: number;
  defaultOpen?: boolean;
  action?: ReactNode;
  /** Rendered immediately to the right of the title/count (e.g. a Hide Examples toggle). */
  titleAction?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-1.5 text-left group"
          >
            <span className="text-gray-400 text-lg leading-none w-4 group-hover:text-gray-600">{open ? "▾" : "▸"}</span>
            <h2 className="text-base font-semibold text-gray-900">
              {title}
              {typeof count === "number" && <span className="text-gray-400 font-normal ml-1">({count})</span>}
            </h2>
          </button>
          {titleAction}
        </div>
        {action}
      </div>
      {open && children}
    </section>
  );
}
