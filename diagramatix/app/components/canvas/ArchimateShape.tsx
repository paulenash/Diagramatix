/**
 * Generic ArchiMate 3.1 shape renderer.
 *
 * One component renders every shape in the catalogue. The specific shape
 * is chosen by `element.properties.shapeKey`. Geometry is picked from the
 * catalogue entry's `shapeFamily` (rectangle / rounded-rect / ellipse /
 * hexagon / custom), fill colour is resolved by category theme (with
 * element-level override), and an ArchiMate icon overlay is drawn in the
 * top-right corner based on the entry's `iconType`.
 */

"use client";

import { useEffect, useState } from "react";
import type { DiagramElement } from "@/app/lib/diagram/types";
import {
  loadArchimateCatalogue,
  findShapeByKey,
  getCachedCatalogue,
  type ArchimateShapeEntry,
} from "@/app/lib/archimate/catalogue";
import { getThemeFor, type ArchimateCategoryTheme } from "@/app/lib/archimate/themes";

// ────────────────────────────────────────────────────────────────────
// Icon-glyph registry
// ────────────────────────────────────────────────────────────────────
// Each iconType maps to a small SVG glyph drawn in the top-right corner
// of the box-variant shape. Glyphs are designed in a 16×16 viewport and
// scaled to fit a ~14px box in the shape corner. Stroke-only, 1.2px.

type IconDrawer = (opts: { cx: number; cy: number; size: number; colour: string }) => React.ReactNode;

const ICON_DRAWERS: Record<string, IconDrawer> = {
  // Actor — stick figure
  actor: ({ cx, cy, size, colour }) => {
    const s = size;
    const headR = s * 0.12;
    return (
      <g stroke={colour} strokeWidth={1.2} fill="none" strokeLinecap="round">
        <circle cx={cx} cy={cy - s * 0.28} r={headR} fill={colour} />
        <line x1={cx} y1={cy - s * 0.16} x2={cx} y2={cy + s * 0.22} />
        <line x1={cx - s * 0.2} y1={cy - s * 0.04} x2={cx + s * 0.2} y2={cy - s * 0.04} />
        <line x1={cx} y1={cy + s * 0.22} x2={cx - s * 0.18} y2={cy + s * 0.42} />
        <line x1={cx} y1={cy + s * 0.22} x2={cx + s * 0.18} y2={cy + s * 0.42} />
      </g>
    );
  },
  // Role — round head inside a cap shape
  role: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={1.2} fill="none">
        <circle cx={cx} cy={cy + s * 0.05} r={s * 0.22} />
        <path d={`M ${cx - s * 0.3} ${cy + s * 0.1} A ${s * 0.3} ${s * 0.3} 0 0 1 ${cx + s * 0.3} ${cy + s * 0.1}`} />
      </g>
    );
  },
  // Collaboration — two overlapping circles
  collaboration: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={1.2} fill="none">
        <circle cx={cx - s * 0.12} cy={cy} r={s * 0.22} />
        <circle cx={cx + s * 0.12} cy={cy} r={s * 0.22} />
      </g>
    );
  },
  // Interface — lollipop
  interface: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={1.2} fill="none">
        <circle cx={cx + s * 0.18} cy={cy} r={s * 0.13} />
        <line x1={cx - s * 0.3} y1={cy} x2={cx + s * 0.05} y2={cy} />
      </g>
    );
  },
  // Process — chevron-like arrow
  process: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <path
        d={`M ${cx - s * 0.3} ${cy - s * 0.2} L ${cx + s * 0.1} ${cy - s * 0.2} L ${cx + s * 0.3} ${cy} L ${cx + s * 0.1} ${cy + s * 0.2} L ${cx - s * 0.3} ${cy + s * 0.2} Z`}
        fill="none" stroke={colour} strokeWidth={1.2}
      />
    );
  },
  // Function — triangle with notch
  function: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <path
        d={`M ${cx - s * 0.28} ${cy + s * 0.2} L ${cx + s * 0.28} ${cy + s * 0.2} L ${cx} ${cy - s * 0.22} Z`}
        fill="none" stroke={colour} strokeWidth={1.2}
      />
    );
  },
  // Service — rounded rectangle tag
  service: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <rect
        x={cx - s * 0.3} y={cy - s * 0.15}
        width={s * 0.6} height={s * 0.3}
        rx={s * 0.15} ry={s * 0.15}
        fill="none" stroke={colour} strokeWidth={1.2}
      />
    );
  },
  // Event — hollow circle
  event: ({ cx, cy, size, colour }) => (
    <circle cx={cx} cy={cy} r={size * 0.22} fill="none" stroke={colour} strokeWidth={1.2} />
  ),
  // Interaction — two overlapping circles (like collaboration) but smaller
  interaction: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={1.2} fill="none">
        <circle cx={cx - s * 0.09} cy={cy} r={s * 0.16} />
        <circle cx={cx + s * 0.09} cy={cy} r={s * 0.16} />
      </g>
    );
  },
  // Object / data — rectangle with a fold
  object: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <path
        d={`M ${cx - s * 0.28} ${cy - s * 0.2} L ${cx + s * 0.28} ${cy - s * 0.2} L ${cx + s * 0.28} ${cy + s * 0.2} L ${cx - s * 0.28} ${cy + s * 0.2} Z`}
        fill="none" stroke={colour} strokeWidth={1.2}
      />
    );
  },
  data: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={1.2} fill="none">
        <rect x={cx - s * 0.28} y={cy - s * 0.2} width={s * 0.56} height={s * 0.4} />
        <line x1={cx - s * 0.28} y1={cy - s * 0.05} x2={cx + s * 0.28} y2={cy - s * 0.05} />
      </g>
    );
  },
  // Component — rectangle with side bracket
  component: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={1.2} fill="none">
        <rect x={cx - s * 0.2} y={cy - s * 0.2} width={s * 0.5} height={s * 0.4} />
        <rect x={cx - s * 0.3} y={cy - s * 0.12} width={s * 0.12} height={s * 0.08} />
        <rect x={cx - s * 0.3} y={cy + s * 0.04} width={s * 0.12} height={s * 0.08} />
      </g>
    );
  },
  // Contract — small document
  contract: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={1.2} fill="none">
        <path d={`M ${cx - s * 0.22} ${cy - s * 0.22} L ${cx + s * 0.12} ${cy - s * 0.22} L ${cx + s * 0.22} ${cy - s * 0.12} L ${cx + s * 0.22} ${cy + s * 0.22} L ${cx - s * 0.22} ${cy + s * 0.22} Z`} />
        <line x1={cx - s * 0.14} y1={cy} x2={cx + s * 0.14} y2={cy} />
        <line x1={cx - s * 0.14} y1={cy + s * 0.1} x2={cx + s * 0.14} y2={cy + s * 0.1} />
      </g>
    );
  },
  product: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <path
        d={`M ${cx - s * 0.28} ${cy + s * 0.22} L ${cx - s * 0.28} ${cy - s * 0.1} L ${cx} ${cy - s * 0.22} L ${cx + s * 0.28} ${cy - s * 0.1} L ${cx + s * 0.28} ${cy + s * 0.22} Z`}
        fill="none" stroke={colour} strokeWidth={1.2}
      />
    );
  },
  representation: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={1.2} fill="none">
        <path d={`M ${cx - s * 0.24} ${cy - s * 0.22} Q ${cx} ${cy - s * 0.28} ${cx + s * 0.24} ${cy - s * 0.22} L ${cx + s * 0.24} ${cy + s * 0.22} Q ${cx} ${cy + s * 0.28} ${cx - s * 0.24} ${cy + s * 0.22} Z`} />
      </g>
    );
  },
  // Motivation icons
  stakeholder: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={1.2} fill="none">
        <circle cx={cx - s * 0.1} cy={cy - s * 0.16} r={s * 0.08} fill={colour} />
        <circle cx={cx + s * 0.1} cy={cy - s * 0.16} r={s * 0.08} fill={colour} />
        <path d={`M ${cx - s * 0.22} ${cy + s * 0.2} Q ${cx} ${cy - s * 0.02} ${cx + s * 0.22} ${cy + s * 0.2}`} />
      </g>
    );
  },
  driver: ({ cx, cy, size, colour }) => (
    <g stroke={colour} strokeWidth={1.2} fill="none" transform={`translate(${cx}, ${cy})`}>
      <circle cx={0} cy={0} r={size * 0.22} />
      <line x1={0} y1={-size * 0.1} x2={0} y2={size * 0.12} />
      <line x1={-size * 0.08} y1={0} x2={size * 0.08} y2={0} />
    </g>
  ),
  assessment: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={1.2} fill="none">
        <circle cx={cx} cy={cy} r={s * 0.22} />
        <path d={`M ${cx - s * 0.12} ${cy - s * 0.04} L ${cx - s * 0.04} ${cy + s * 0.06} L ${cx + s * 0.14} ${cy - s * 0.12}`} strokeWidth={1.4} />
      </g>
    );
  },
  goal: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={1.2} fill="none">
        <circle cx={cx} cy={cy} r={s * 0.22} />
        <circle cx={cx} cy={cy} r={s * 0.1} fill={colour} />
      </g>
    );
  },
  outcome: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={1.2} fill="none">
        <path d={`M ${cx - s * 0.22} ${cy - s * 0.1} L ${cx + s * 0.22} ${cy - s * 0.1} L ${cx + s * 0.1} ${cy + s * 0.2} L ${cx - s * 0.1} ${cy + s * 0.2} Z`} />
      </g>
    );
  },
  principle: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={1.2} fill="none">
        <circle cx={cx} cy={cy} r={s * 0.22} />
        <line x1={cx - s * 0.08} y1={cy - s * 0.1} x2={cx + s * 0.08} y2={cy - s * 0.1} />
        <line x1={cx - s * 0.08} y1={cy + s * 0.02} x2={cx + s * 0.08} y2={cy + s * 0.02} />
        <line x1={cx - s * 0.04} y1={cy + s * 0.14} x2={cx + s * 0.04} y2={cy + s * 0.14} />
      </g>
    );
  },
  requirement: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={1.2} fill="none">
        <path d={`M ${cx - s * 0.22} ${cy - s * 0.12} L ${cx + s * 0.22} ${cy - s * 0.12} L ${cx + s * 0.22} ${cy + s * 0.12} L ${cx - s * 0.22} ${cy + s * 0.12} Z`} />
      </g>
    );
  },
  constraint: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={1.2} fill="none">
        <path d={`M ${cx - s * 0.22} ${cy - s * 0.12} L ${cx + s * 0.22} ${cy - s * 0.12} L ${cx + s * 0.22} ${cy + s * 0.12} L ${cx - s * 0.22} ${cy + s * 0.12} Z`} />
        <line x1={cx - s * 0.18} y1={cy - s * 0.08} x2={cx + s * 0.18} y2={cy + s * 0.08} />
      </g>
    );
  },
  meaning: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={1.2} fill="none">
        <path d={`M ${cx - s * 0.22} ${cy - s * 0.12} Q ${cx} ${cy - s * 0.3} ${cx + s * 0.22} ${cy - s * 0.12} Q ${cx + s * 0.1} ${cy + s * 0.22} ${cx - s * 0.22} ${cy - s * 0.12} Z`} />
      </g>
    );
  },
  value: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={1.2} fill="none">
        <path d={`M ${cx} ${cy - s * 0.22} L ${cx + s * 0.22} ${cy} L ${cx} ${cy + s * 0.22} L ${cx - s * 0.22} ${cy} Z`} />
      </g>
    );
  },
  // Strategy icons
  resource: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={1.2} fill="none">
        <rect x={cx - s * 0.22} y={cy - s * 0.12} width={s * 0.44} height={s * 0.24} />
        <line x1={cx - s * 0.22} y1={cy} x2={cx + s * 0.22} y2={cy} />
      </g>
    );
  },
  capability: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <path
        d={`M ${cx - s * 0.2} ${cy} L ${cx - s * 0.1} ${cy + s * 0.2} L ${cx + s * 0.2} ${cy - s * 0.1}`}
        fill="none" stroke={colour} strokeWidth={1.4}
      />
    );
  },
  "course-of-action": ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <path
        d={`M ${cx - s * 0.22} ${cy - s * 0.12} L ${cx + s * 0.05} ${cy - s * 0.12} L ${cx + s * 0.05} ${cy - s * 0.22} L ${cx + s * 0.22} ${cy} L ${cx + s * 0.05} ${cy + s * 0.22} L ${cx + s * 0.05} ${cy + s * 0.12} L ${cx - s * 0.22} ${cy + s * 0.12} Z`}
        fill="none" stroke={colour} strokeWidth={1.2}
      />
    );
  },
  "value-stream": ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <path
        d={`M ${cx - s * 0.3} ${cy - s * 0.1} L ${cx + s * 0.1} ${cy - s * 0.2} L ${cx + s * 0.3} ${cy} L ${cx + s * 0.1} ${cy + s * 0.2} L ${cx - s * 0.3} ${cy + s * 0.1} L ${cx - s * 0.16} ${cy} Z`}
        fill="none" stroke={colour} strokeWidth={1.2}
      />
    );
  },
  // Junction glyphs
  junction: ({ cx, cy, size, colour }) => (
    <circle cx={cx} cy={cy} r={size * 0.2} fill={colour} stroke={colour} />
  ),
  "junction-and": ({ cx, cy, size, colour }) => (
    <circle cx={cx} cy={cy} r={size * 0.22} fill={colour} stroke={colour} />
  ),
  "junction-or": ({ cx, cy, size, colour }) => (
    <circle cx={cx} cy={cy} r={size * 0.22} fill="none" stroke={colour} strokeWidth={1.4} />
  ),
  location: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={1.2} fill="none">
        <path d={`M ${cx} ${cy - s * 0.22} C ${cx + s * 0.2} ${cy - s * 0.22} ${cx + s * 0.18} ${cy} ${cx} ${cy + s * 0.22} C ${cx - s * 0.18} ${cy} ${cx - s * 0.2} ${cy - s * 0.22} ${cx} ${cy - s * 0.22} Z`} />
        <circle cx={cx} cy={cy - s * 0.08} r={s * 0.05} fill={colour} />
      </g>
    );
  },
};

// ────────────────────────────────────────────────────────────────────
// Outline renderers per shape family
// ────────────────────────────────────────────────────────────────────
function drawOutline(
  family: ArchimateShapeEntry["shapeFamily"],
  x: number, y: number, w: number, h: number,
): string {
  switch (family) {
    case "ellipse":
      return `M ${x + w / 2} ${y} A ${w / 2} ${h / 2} 0 1 0 ${x + w / 2} ${y + h} A ${w / 2} ${h / 2} 0 1 0 ${x + w / 2} ${y} Z`;
    case "rounded-rect": {
      const r = Math.min(w, h) * 0.14;
      return `M ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} L ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;
    }
    case "hexagon": {
      const pad = w * 0.15;
      return `M ${x + pad} ${y} L ${x + w - pad} ${y} L ${x + w} ${y + h / 2} L ${x + w - pad} ${y + h} L ${x + pad} ${y + h} L ${x} ${y + h / 2} Z`;
    }
    case "rectangle":
    case "custom":
    default:
      return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
  }
}

// ────────────────────────────────────────────────────────────────────
// Main renderer
// ────────────────────────────────────────────────────────────────────
export function ArchimateShape({ el }: { el: DiagramElement }) {
  const shapeKey = el.properties?.shapeKey as string | undefined;
  const [, forceRender] = useState(0);

  // Ensure the catalogue is loaded — trigger a re-render once it arrives
  useEffect(() => {
    if (!getCachedCatalogue()) {
      loadArchimateCatalogue().then(() => forceRender(n => n + 1)).catch(() => {});
    }
  }, []);

  const entry = shapeKey ? findShapeByKey(shapeKey) : undefined;

  // If the catalogue hasn't loaded yet OR the shapeKey is missing, render a
  // neutral placeholder rectangle. Labels still render via the outer frame.
  if (!entry) {
    return (
      <rect
        x={el.x} y={el.y} width={el.width} height={el.height}
        fill="#f5f5f5" stroke="#bbbbbb" strokeDasharray="3 3"
      />
    );
  }

  // Resolve theme (category default or user override on this element)
  const theme: ArchimateCategoryTheme | undefined = getThemeFor(entry.category);
  const elOverrideFill = el.properties?.fill as string | undefined;
  const elOverrideStroke = el.properties?.stroke as string | undefined;
  const fill = elOverrideFill ?? theme?.fill ?? entry.fill ?? "#f5f5f5";
  const stroke = elOverrideStroke ?? theme?.stroke ?? entry.stroke ?? "#666666";
  const iconColour = (el.properties?.iconColour as string | undefined) ?? theme?.iconColour ?? stroke;

  const d = drawOutline(entry.shapeFamily, el.x, el.y, el.width, el.height);

  // Icon-overlay geometry — top-right corner for "box" variant, centred
  // for "icon" variant
  const iconBoxSize = 18;
  const iconBoxX = entry.variant === "icon"
    ? el.x + el.width / 2 - iconBoxSize / 2
    : el.x + el.width - iconBoxSize - 6;
  const iconBoxY = entry.variant === "icon"
    ? el.y + el.height / 2 - iconBoxSize / 2
    : el.y + 6;
  const iconCx = iconBoxX + iconBoxSize / 2;
  const iconCy = iconBoxY + iconBoxSize / 2;

  const drawIcon = entry.iconType ? ICON_DRAWERS[entry.iconType] : undefined;

  return (
    <g>
      <path d={d} fill={fill} stroke={stroke} strokeWidth={1.2} />
      {drawIcon ? drawIcon({ cx: iconCx, cy: iconCy, size: iconBoxSize, colour: iconColour }) : null}
    </g>
  );
}
