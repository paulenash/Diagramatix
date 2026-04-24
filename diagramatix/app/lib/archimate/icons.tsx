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
  // Actor — stick figure: hollow head; torso shortened by 20% at the
  // leg-attach point (from cy + 0.22 to cy + 0.144)
  actor: ({ cx, cy, size, colour }) => {
    const s = size;
    const headR = s * 0.12;
    const legAttach = cy + s * 0.144;
    return (
      <g stroke={colour} strokeWidth={Math.max(1, s / 16)} fill="none" strokeLinecap="round">
        <circle cx={cx} cy={cy - s * 0.28} r={headR} fill="none" />
        <line x1={cx} y1={cy - s * 0.16} x2={cx} y2={legAttach} />
        <line x1={cx - s * 0.2} y1={cy - s * 0.04} x2={cx + s * 0.2} y2={cy - s * 0.04} />
        <line x1={cx} y1={legAttach} x2={cx - s * 0.18} y2={cy + s * 0.42} />
        <line x1={cx} y1={legAttach} x2={cx + s * 0.18} y2={cy + s * 0.42} />
      </g>
    );
  },
  // Role — horizontal "log" (cylinder on its side): two vertical
  // ellipses as end caps joined by top + bottom horizontal lines.
  // Only the LEFT half of the left ellipse is visible (the right
  // half would sit inside the body). The right ellipse shows BOTH
  // halves — the right half as the outline cap, the left half as
  // an inner arc representing the back of the cylinder.
  //
  // Ellipses are wider / rounder (eccentricity halved) so the end
  // caps read clearly as ovals rather than slivers.
  role: ({ cx, cy, size, colour }) => {
    const s = size;
    const rx = s * 0.14;              // ellipse width unchanged
    const ry = s * 0.20;              // ellipse height unchanged
    const leftCx = cx - s * 0.22;     // ← further apart (was 0.18) → longer top/bottom lines
    const rightCx = cx + s * 0.22;
    const topY = cy - ry;
    const bottomY = cy + ry;
    const sw = Math.max(1, s / 16);
    return (
      <g stroke={colour} strokeWidth={sw} fill="none">
        <path d={`M ${leftCx} ${topY} L ${rightCx} ${topY} A ${rx} ${ry} 0 0 1 ${rightCx} ${bottomY} L ${leftCx} ${bottomY} A ${rx} ${ry} 0 0 1 ${leftCx} ${topY} Z`} />
        <path d={`M ${rightCx} ${topY} A ${rx} ${ry} 0 0 0 ${rightCx} ${bottomY}`} />
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
  // Interface — lollipop. Circle diameter doubled from s × 0.26 to
  // s × 0.52 (radius 0.26). Stem shortened so the lollipop still fits.
  interface: ({ cx, cy, size, colour }) => {
    const s = size;
    const r = s * 0.26;                  // ← was 0.13 (2× diameter)
    const circleCx = cx + s * 0.08;      // centred slightly right of icon middle
    return (
      <g stroke={colour} strokeWidth={Math.max(1, s / 16)} fill="none">
        <circle cx={circleCx} cy={cy} r={r} />
        <line x1={cx - s * 0.30} y1={cy} x2={circleCx - r} y2={cy} />
      </g>
    );
  },
  // Process — outlined right-pointing block arrow. Thinner body,
  // taller arrowhead, unfilled.
  process: ({ cx, cy, size, colour }) => {
    const s = size;
    const body = s * 0.10;         // body half-height (was 0.14 — now thinner)
    const head = s * 0.26;         // arrowhead half-height (was 0.22 — now taller)
    const tailX = cx - s * 0.30;
    const shoulderX = cx + s * 0.06;
    const tipX = cx + s * 0.30;
    return (
      <path
        d={`M ${tailX} ${cy - body} L ${shoulderX} ${cy - body} L ${shoulderX} ${cy - head} L ${tipX} ${cy} L ${shoulderX} ${cy + head} L ${shoulderX} ${cy + body} L ${tailX} ${cy + body} Z`}
        fill="none" stroke={colour} strokeWidth={Math.max(1, s / 16)}
        strokeLinejoin="round"
      />
    );
  },
  // Function — two upward-pointing chevrons stacked vertically,
  // slightly wider than the old version and brought slightly closer
  // together. Line thickness matches the Role icon.
  function: ({ cx, cy, size, colour }) => {
    const s = size;
    const halfW = s * 0.30;              // ← wider (was 0.24)
    const chevHeight = s * 0.10;
    const gap = s * 0.30;                // ← closer (was 0.40)
    const topBase = cy - (gap + chevHeight) / 2;
    const topPeak = topBase - chevHeight;
    const bottomBase = topBase + gap;
    const bottomPeak = bottomBase - chevHeight;
    const leftX = cx - halfW;
    const rightX = cx + halfW;
    const sw = Math.max(1, s / 16);      // ← matches Role icon
    return (
      <g stroke={colour} strokeWidth={sw} fill="none" strokeLinejoin="round" strokeLinecap="round">
        <polyline points={`${leftX},${topBase} ${cx},${topPeak} ${rightX},${topBase}`} />
        <polyline points={`${leftX},${bottomBase} ${cx},${bottomPeak} ${rightX},${bottomBase}`} />
        <line x1={leftX} y1={topBase} x2={leftX} y2={bottomBase} />
        <line x1={rightX} y1={topBase} x2={rightX} y2={bottomBase} />
      </g>
    );
  },
  // Service — stadium / pill shape with semicircle ends on the left
  // and right (rx = height/2 gives true semicircles).
  service: ({ cx, cy, size, colour }) => {
    const s = size;
    const h = s * 0.3;
    return (
      <rect
        x={cx - s * 0.3} y={cy - h / 2}
        width={s * 0.6} height={h}
        rx={h / 2} ry={h / 2}
        fill="none" stroke={colour} strokeWidth={Math.max(1, s / 16)}
      />
    );
  },
  // Event (ArchiMate 3.2) — pill with an inward-facing semi-circle
  // scoop on the left and a half-circle bulge on the right.
  event: ({ cx, cy, size, colour }) => {
    const s = size;
    const top = cy - s * 0.18;
    const bot = cy + s * 0.18;
    const left = cx - s * 0.30;
    const right = cx + s * 0.30;
    const radius = (bot - top) / 2;
    const archStart = right - radius;
    return (
      <path
        d={`M ${left} ${top} L ${archStart} ${top} A ${radius} ${radius} 0 0 1 ${archStart} ${bot} L ${left} ${bot} A ${radius} ${radius} 0 0 0 ${left} ${top} Z`}
        fill="none" stroke={colour} strokeWidth={Math.max(1, s / 16)}
        strokeLinejoin="round"
      />
    );
  },
  // Interaction — two half-discs separated by a small gap. Left one
  // bulges LEFT (curve on left, flat edge on the right), right one
  // bulges RIGHT (curve on right, flat edge on the left).
  interaction: ({ cx, cy, size, colour }) => {
    const s = size;
    const sw = Math.max(1, s / 16);
    const r = s * 0.27;
    const gap = s * 0.06 + 1;
    const leftX = cx - gap / 2;   // flat edge x for left half-disc
    const rightX = cx + gap / 2;  // flat edge x for right half-disc
    const topY = cy - r;
    const botY = cy + r;
    return (
      <g stroke={colour} strokeWidth={sw} fill="none" strokeLinejoin="round">
        <path d={`M ${leftX} ${topY} A ${r} ${r} 0 0 0 ${leftX} ${botY} Z`} />
        <path d={`M ${rightX} ${topY} A ${r} ${r} 0 0 1 ${rightX} ${botY} Z`} />
      </g>
    );
  },
  // Object — a short rectangle sitting on top of the main body.
  // Both rectangles share the same width.
  object: ({ cx, cy, size, colour }) => {
    const s = size;
    const sw = Math.max(1, s / 16);
    const mainW = s * 0.55;
    const mainH = s * 0.35;
    const topH = s * 0.125;
    const mainLeft = cx - mainW / 2;
    const mainTop = cy - mainH / 2 + topH / 2; // nudge main down to leave room for top strip
    const topTop = mainTop - topH;
    return (
      <g stroke={colour} strokeWidth={sw} fill="none">
        <rect x={mainLeft} y={topTop} width={mainW} height={topH} />
        <rect x={mainLeft} y={mainTop} width={mainW} height={mainH} />
      </g>
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
  // Contract — short rectangles at the top AND bottom of a larger
  // middle rectangle. All three rectangles share the same width.
  contract: ({ cx, cy, size, colour }) => {
    const s = size;
    const sw = Math.max(1, s / 16);
    const mainW = s * 0.55;
    const mainH = s * 0.30;
    const stripH = s * 0.10;
    const gap = s * 0.025;
    const mainLeft = cx - mainW / 2;
    const mainTop = cy - mainH / 2;
    const topStripTop = mainTop - gap - stripH;
    const botStripTop = mainTop + mainH + gap;
    return (
      <g stroke={colour} strokeWidth={sw} fill="none">
        <rect x={mainLeft} y={topStripTop} width={mainW} height={stripH} />
        <rect x={mainLeft} y={mainTop} width={mainW} height={mainH} />
        <rect x={mainLeft} y={botStripTop} width={mainW} height={stripH} />
      </g>
    );
  },
  // Product — outer rectangle with a smaller inner rectangle in the
  // top-left corner, half the outer's width.
  product: ({ cx, cy, size, colour }) => {
    const s = size;
    const sw = Math.max(1, s / 16);
    const outerW = s * 0.625;
    const outerH = s * 0.45;
    const outerLeft = cx - outerW / 2;
    const outerTop = cy - outerH / 2;
    const innerW = outerW / 2;
    const innerH = outerH * 0.35;
    return (
      <g stroke={colour} strokeWidth={sw} fill="none">
        <rect x={outerLeft} y={outerTop} width={outerW} height={outerH} />
        <rect x={outerLeft} y={outerTop} width={innerW} height={innerH} />
      </g>
    );
  },
  // Representation — same frame as Object (short top strip + main body),
  // but the bottom edge of the main body is replaced by two semicircles:
  // left bulges downward (below baseline), right bulges upward (above) —
  // giving a wavy bottom.
  representation: ({ cx, cy, size, colour }) => {
    const s = size;
    const sw = Math.max(1, s / 16);
    const mainW = s * 0.55;
    const mainH = s * 0.35;
    const topH = s * 0.125;
    const mainLeft = cx - mainW / 2;
    const mainTop = cy - mainH / 2 + topH / 2;
    const topTop = mainTop - topH;
    const mainRight = mainLeft + mainW;
    const mainBot = mainTop + mainH;
    const halfW = mainW / 2;
    const midX = mainLeft + halfW;
    const radius = halfW / 2;
    // Body: top-left → top-right → down right side → along wavy bottom
    // (right semicircle bulges UP / sweep=0, then left semicircle
    // bulges DOWN / sweep=1) → up left side.
    const bodyPath =
      `M ${mainLeft} ${mainTop} ` +
      `L ${mainRight} ${mainTop} ` +
      `L ${mainRight} ${mainBot} ` +
      `A ${radius} ${radius} 0 0 0 ${midX} ${mainBot} ` +
      `A ${radius} ${radius} 0 0 1 ${mainLeft} ${mainBot} ` +
      `L ${mainLeft} ${mainTop} Z`;
    return (
      <g stroke={colour} strokeWidth={sw} fill="none">
        <rect x={mainLeft} y={topTop} width={mainW} height={topH} />
        <path d={bodyPath} strokeLinejoin="round" />
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
