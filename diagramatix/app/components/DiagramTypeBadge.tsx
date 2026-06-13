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
  /** Show the human-readable label next to the code. */
  showLabel?: boolean;
  /** Extra classes on the wrapper. */
  className?: string;
  /** Override the tooltip (defaults to the label). */
  title?: string;
}

export function DiagramTypeBadge({ type, showLabel = false, className = "", title }: DiagramTypeBadgeProps) {
  const getStyle = useDiagramTypeStyles();
  const s = getStyle(type);
  return (
    <span className={`inline-flex items-center gap-1 align-middle ${className}`} title={title ?? s.label}>
      <span
        className="inline-flex items-center justify-center rounded text-[9px] font-bold leading-none px-1 py-0.5 min-w-[18px]"
        style={{ backgroundColor: s.bgColor, color: s.textColor }}
      >
        {s.code}
      </span>
      {showLabel && (
        <span className="text-[10px] font-medium" style={{ color: s.textColor }}>
          {s.label}
        </span>
      )}
    </span>
  );
}
