"use client";

/**
 * The diagram-type badge: a coloured 2-character code, optionally followed
 * by the type label. Single source of truth for how a diagram type is
 * shown across the app (nav tree, dashboard cards, editor top bar, bundle
 * dialogs, processes viewer). Colours come from useDiagramTypeStyles, so a
 * SuperAdmin recolour in /dashboard/admin/diagram-types flows everywhere.
 */

import { useDiagramTypeStyles } from "@/app/hooks/useDiagramTypeStyles";

interface DiagramTypeBadgeProps {
  type: string;
  /** Show the human-readable label. */
  showLabel?: boolean;
  /** Show the 2-character code square (default true). Set false for a
   *  label-only highlighted pill (editor top bar, project tiles). */
  showCode?: boolean;
  /** Extra classes on the wrapper. */
  className?: string;
  /** Override the tooltip (defaults to the label). */
  title?: string;
}

export function DiagramTypeBadge({ type, showLabel = false, showCode = true, className = "", title }: DiagramTypeBadgeProps) {
  const getStyle = useDiagramTypeStyles();
  const s = getStyle(type);
  // Label-only (no code square) renders as a highlighted pill — the type
  // name in its own colour on its pastel, matching the editor's title bar.
  const labelOnly = showLabel && !showCode;
  return (
    <span className={`inline-flex items-center gap-1 align-middle ${className}`} title={title ?? s.label}>
      {showCode && (
        <span
          className="inline-flex items-center justify-center rounded text-[7px] font-bold leading-none px-1 py-0.5 min-w-[18px] border"
          style={{ backgroundColor: s.bgColor, color: s.textColor, borderColor: s.textColor }}
        >
          {s.code}
        </span>
      )}
      {showLabel && (
        labelOnly ? (
          <span
            className="inline-flex items-center rounded border text-[10px] font-semibold leading-none px-1.5 py-0.5"
            style={{ backgroundColor: s.bgColor, color: s.textColor, borderColor: s.textColor }}
          >
            {s.label}
          </span>
        ) : (
          <span className="text-[10px] font-medium" style={{ color: s.textColor }}>
            {s.label}
          </span>
        )
      )}
    </span>
  );
}
