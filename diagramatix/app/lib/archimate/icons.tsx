/**
 * Shared ArchiMate icon glyphs.
 *
 * Each iconType maps to a small SVG glyph. Both the canvas shape renderer
 * and the palette preview pull from this map so a shape's icon looks the
 * same in both places.
 *
 * Glyphs are designed against a normalised box centred on (cx, cy) with
 * `size` controlling the bounding-box dimension. All strokes scale with
 * size so the same drawer works at icon-overlay scale (~14 px) and at
 * palette-preview scale (~28+ px).
 */

import React from "react";

export type IconDrawer = (opts: {
  cx: number;
  cy: number;
  size: number;
  colour: string;
}) => React.ReactNode;

export const ICON_DRAWERS: Record<string, IconDrawer> = {
  // Actor — stick figure
  actor: ({ cx, cy, size, colour }) => {
    const s = size;
    const headR = s * 0.12;
    return (
      <g stroke={colour} strokeWidth={Math.max(1, s / 16)} fill="none" strokeLinecap="round">
        <circle cx={cx} cy={cy - s * 0.28} r={headR} fill={colour} />
        <line x1={cx} y1={cy - s * 0.16} x2={cx} y2={cy + s * 0.22} />
        <line x1={cx - s * 0.2} y1={cy - s * 0.04} x2={cx + s * 0.2} y2={cy - s * 0.04} />
        <line x1={cx} y1={cy + s * 0.22} x2={cx - s * 0.18} y2={cy + s * 0.42} />
        <line x1={cx} y1={cy + s * 0.22} x2={cx + s * 0.18} y2={cy + s * 0.42} />
      </g>
    );
  },
  role: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={Math.max(1, s / 16)} fill="none">
        <circle cx={cx} cy={cy + s * 0.05} r={s * 0.22} />
        <path d={`M ${cx - s * 0.3} ${cy + s * 0.1} A ${s * 0.3} ${s * 0.3} 0 0 1 ${cx + s * 0.3} ${cy + s * 0.1}`} />
      </g>
    );
  },
  collaboration: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={Math.max(1, s / 16)} fill="none">
        <circle cx={cx - s * 0.12} cy={cy} r={s * 0.22} />
        <circle cx={cx + s * 0.12} cy={cy} r={s * 0.22} />
      </g>
    );
  },
  interface: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={Math.max(1, s / 16)} fill="none">
        <circle cx={cx + s * 0.18} cy={cy} r={s * 0.13} />
        <line x1={cx - s * 0.3} y1={cy} x2={cx + s * 0.05} y2={cy} />
      </g>
    );
  },
  process: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <path
        d={`M ${cx - s * 0.3} ${cy - s * 0.2} L ${cx + s * 0.1} ${cy - s * 0.2} L ${cx + s * 0.3} ${cy} L ${cx + s * 0.1} ${cy + s * 0.2} L ${cx - s * 0.3} ${cy + s * 0.2} Z`}
        fill="none" stroke={colour} strokeWidth={Math.max(1, s / 16)}
      />
    );
  },
  function: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <path
        d={`M ${cx - s * 0.28} ${cy + s * 0.2} L ${cx + s * 0.28} ${cy + s * 0.2} L ${cx} ${cy - s * 0.22} Z`}
        fill="none" stroke={colour} strokeWidth={Math.max(1, s / 16)}
      />
    );
  },
  service: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <rect
        x={cx - s * 0.3} y={cy - s * 0.15}
        width={s * 0.6} height={s * 0.3}
        rx={s * 0.15} ry={s * 0.15}
        fill="none" stroke={colour} strokeWidth={Math.max(1, s / 16)}
      />
    );
  },
  event: ({ cx, cy, size, colour }) => (
    <circle cx={cx} cy={cy} r={size * 0.22} fill="none" stroke={colour} strokeWidth={Math.max(1, size / 16)} />
  ),
  interaction: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={Math.max(1, s / 16)} fill="none">
        <circle cx={cx - s * 0.09} cy={cy} r={s * 0.16} />
        <circle cx={cx + s * 0.09} cy={cy} r={s * 0.16} />
      </g>
    );
  },
  object: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <path
        d={`M ${cx - s * 0.28} ${cy - s * 0.2} L ${cx + s * 0.28} ${cy - s * 0.2} L ${cx + s * 0.28} ${cy + s * 0.2} L ${cx - s * 0.28} ${cy + s * 0.2} Z`}
        fill="none" stroke={colour} strokeWidth={Math.max(1, s / 16)}
      />
    );
  },
  data: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={Math.max(1, s / 16)} fill="none">
        <rect x={cx - s * 0.28} y={cy - s * 0.2} width={s * 0.56} height={s * 0.4} />
        <line x1={cx - s * 0.28} y1={cy - s * 0.05} x2={cx + s * 0.28} y2={cy - s * 0.05} />
      </g>
    );
  },
  component: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={Math.max(1, s / 16)} fill="none">
        <rect x={cx - s * 0.2} y={cy - s * 0.2} width={s * 0.5} height={s * 0.4} />
        <rect x={cx - s * 0.3} y={cy - s * 0.12} width={s * 0.12} height={s * 0.08} />
        <rect x={cx - s * 0.3} y={cy + s * 0.04} width={s * 0.12} height={s * 0.08} />
      </g>
    );
  },
  contract: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={Math.max(1, s / 16)} fill="none">
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
        fill="none" stroke={colour} strokeWidth={Math.max(1, s / 16)}
      />
    );
  },
  representation: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={Math.max(1, s / 16)} fill="none">
        <path d={`M ${cx - s * 0.24} ${cy - s * 0.22} Q ${cx} ${cy - s * 0.28} ${cx + s * 0.24} ${cy - s * 0.22} L ${cx + s * 0.24} ${cy + s * 0.22} Q ${cx} ${cy + s * 0.28} ${cx - s * 0.24} ${cy + s * 0.22} Z`} />
      </g>
    );
  },
  stakeholder: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={Math.max(1, s / 16)} fill="none">
        <circle cx={cx - s * 0.1} cy={cy - s * 0.16} r={s * 0.08} fill={colour} />
        <circle cx={cx + s * 0.1} cy={cy - s * 0.16} r={s * 0.08} fill={colour} />
        <path d={`M ${cx - s * 0.22} ${cy + s * 0.2} Q ${cx} ${cy - s * 0.02} ${cx + s * 0.22} ${cy + s * 0.2}`} />
      </g>
    );
  },
  driver: ({ cx, cy, size, colour }) => (
    <g stroke={colour} strokeWidth={Math.max(1, size / 16)} fill="none" transform={`translate(${cx}, ${cy})`}>
      <circle cx={0} cy={0} r={size * 0.22} />
      <line x1={0} y1={-size * 0.1} x2={0} y2={size * 0.12} />
      <line x1={-size * 0.08} y1={0} x2={size * 0.08} y2={0} />
    </g>
  ),
  assessment: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={Math.max(1, s / 16)} fill="none">
        <circle cx={cx} cy={cy} r={s * 0.22} />
        <path d={`M ${cx - s * 0.12} ${cy - s * 0.04} L ${cx - s * 0.04} ${cy + s * 0.06} L ${cx + s * 0.14} ${cy - s * 0.12}`} strokeWidth={Math.max(1, s / 14)} />
      </g>
    );
  },
  goal: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={Math.max(1, s / 16)} fill="none">
        <circle cx={cx} cy={cy} r={s * 0.22} />
        <circle cx={cx} cy={cy} r={s * 0.1} fill={colour} />
      </g>
    );
  },
  outcome: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={Math.max(1, s / 16)} fill="none">
        <path d={`M ${cx - s * 0.22} ${cy - s * 0.1} L ${cx + s * 0.22} ${cy - s * 0.1} L ${cx + s * 0.1} ${cy + s * 0.2} L ${cx - s * 0.1} ${cy + s * 0.2} Z`} />
      </g>
    );
  },
  principle: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={Math.max(1, s / 16)} fill="none">
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
      <g stroke={colour} strokeWidth={Math.max(1, s / 16)} fill="none">
        <path d={`M ${cx - s * 0.22} ${cy - s * 0.12} L ${cx + s * 0.22} ${cy - s * 0.12} L ${cx + s * 0.22} ${cy + s * 0.12} L ${cx - s * 0.22} ${cy + s * 0.12} Z`} />
      </g>
    );
  },
  constraint: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={Math.max(1, s / 16)} fill="none">
        <path d={`M ${cx - s * 0.22} ${cy - s * 0.12} L ${cx + s * 0.22} ${cy - s * 0.12} L ${cx + s * 0.22} ${cy + s * 0.12} L ${cx - s * 0.22} ${cy + s * 0.12} Z`} />
        <line x1={cx - s * 0.18} y1={cy - s * 0.08} x2={cx + s * 0.18} y2={cy + s * 0.08} />
      </g>
    );
  },
  meaning: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={Math.max(1, s / 16)} fill="none">
        <path d={`M ${cx - s * 0.22} ${cy - s * 0.12} Q ${cx} ${cy - s * 0.3} ${cx + s * 0.22} ${cy - s * 0.12} Q ${cx + s * 0.1} ${cy + s * 0.22} ${cx - s * 0.22} ${cy - s * 0.12} Z`} />
      </g>
    );
  },
  value: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={Math.max(1, s / 16)} fill="none">
        <path d={`M ${cx} ${cy - s * 0.22} L ${cx + s * 0.22} ${cy} L ${cx} ${cy + s * 0.22} L ${cx - s * 0.22} ${cy} Z`} />
      </g>
    );
  },
  resource: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={Math.max(1, s / 16)} fill="none">
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
        fill="none" stroke={colour} strokeWidth={Math.max(1, s / 14)}
      />
    );
  },
  "course-of-action": ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <path
        d={`M ${cx - s * 0.22} ${cy - s * 0.12} L ${cx + s * 0.05} ${cy - s * 0.12} L ${cx + s * 0.05} ${cy - s * 0.22} L ${cx + s * 0.22} ${cy} L ${cx + s * 0.05} ${cy + s * 0.22} L ${cx + s * 0.05} ${cy + s * 0.12} L ${cx - s * 0.22} ${cy + s * 0.12} Z`}
        fill="none" stroke={colour} strokeWidth={Math.max(1, s / 16)}
      />
    );
  },
  "value-stream": ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <path
        d={`M ${cx - s * 0.3} ${cy - s * 0.1} L ${cx + s * 0.1} ${cy - s * 0.2} L ${cx + s * 0.3} ${cy} L ${cx + s * 0.1} ${cy + s * 0.2} L ${cx - s * 0.3} ${cy + s * 0.1} L ${cx - s * 0.16} ${cy} Z`}
        fill="none" stroke={colour} strokeWidth={Math.max(1, s / 16)}
      />
    );
  },
  junction: ({ cx, cy, size, colour }) => (
    <circle cx={cx} cy={cy} r={size * 0.2} fill={colour} stroke={colour} />
  ),
  "junction-and": ({ cx, cy, size, colour }) => (
    <circle cx={cx} cy={cy} r={size * 0.22} fill={colour} stroke={colour} />
  ),
  "junction-or": ({ cx, cy, size, colour }) => (
    <circle cx={cx} cy={cy} r={size * 0.22} fill="none" stroke={colour} strokeWidth={Math.max(1, size / 14)} />
  ),
  location: ({ cx, cy, size, colour }) => {
    const s = size;
    return (
      <g stroke={colour} strokeWidth={Math.max(1, s / 16)} fill="none">
        <path d={`M ${cx} ${cy - s * 0.22} C ${cx + s * 0.2} ${cy - s * 0.22} ${cx + s * 0.18} ${cy} ${cx} ${cy + s * 0.22} C ${cx - s * 0.18} ${cy} ${cx - s * 0.2} ${cy - s * 0.22} ${cx} ${cy - s * 0.22} Z`} />
        <circle cx={cx} cy={cy - s * 0.08} r={s * 0.05} fill={colour} />
      </g>
    );
  },
};
