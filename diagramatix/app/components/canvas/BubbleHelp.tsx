"use client";

/**
 * Comic-style help cloud rendered inside the Canvas SVG world (so it
 * pans/zooms with the diagram). Anchors to the upper-right of the
 * clicked element. Semi-transparent so the diagram remains visible
 * beneath the cloud.
 */

interface Props {
  /** World-space top-left x of the clicked element. */
  anchorX: number;
  /** World-space top-left y of the clicked element. */
  anchorY: number;
  /** Width of the clicked element. */
  anchorWidth: number;
  /** Text lines to render inside the cloud. */
  lines: string[];
}

// Fixed cloud bounding-box dimensions, sized for three lines of 20-pt
// text. Wide enough for the longest expected line ("Click and Drag")
// with comfortable padding.
const CLOUD_W = 260;
const CLOUD_H = 150;
const FONT_SIZE = 20;
const LINE_HEIGHT = 26;
// Gap between the element and the cloud's bottom-left.
const ANCHOR_GAP = 12;

/**
 * Bumpy cloud silhouette, hand-tuned for a 260×150 bounding box.
 * Eight cubic curve segments form lobes around the perimeter; the
 * shape reads as a comic-book speech cloud at a glance.
 */
function cloudPath(w: number, h: number): string {
  // Normalised control points scaled to (w, h). Sequence is
  // clockwise from the left side.
  const p = (xp: number, yp: number) => `${(xp * w).toFixed(1)},${(yp * h).toFixed(1)}`;
  return [
    `M ${p(0.05, 0.55)}`,
    `C ${p(-0.02, 0.40)} ${p(0.05, 0.20)} ${p(0.18, 0.22)}`,
    `C ${p(0.18, 0.05)} ${p(0.38, 0.02)} ${p(0.42, 0.18)}`,
    `C ${p(0.50, 0.02)} ${p(0.72, 0.05)} ${p(0.70, 0.22)}`,
    `C ${p(0.88, 0.15)} ${p(1.02, 0.32)} ${p(0.92, 0.45)}`,
    `C ${p(1.05, 0.55)} ${p(1.00, 0.78)} ${p(0.82, 0.80)}`,
    `C ${p(0.85, 0.98)} ${p(0.60, 1.02)} ${p(0.55, 0.85)}`,
    `C ${p(0.50, 1.02)} ${p(0.25, 1.00)} ${p(0.25, 0.82)}`,
    `C ${p(0.05, 0.92)} ${p(-0.05, 0.72)} ${p(0.05, 0.55)}`,
    "Z",
  ].join(" ");
}

export function BubbleHelp({ anchorX, anchorY, anchorWidth, lines }: Props) {
  // Position upper-right of the element: cloud bottom-left sits at
  // (element right + gap, element top - gap), so the whole bubble
  // hovers above-right of the shape.
  const x = anchorX + anchorWidth + ANCHOR_GAP;
  const y = anchorY - CLOUD_H - ANCHOR_GAP;

  // Text block: centred horizontally inside the cloud, vertically
  // grouped around the middle.
  const textCx = x + CLOUD_W / 2;
  // Top of the first line, computed so the three lines sit centred.
  const totalTextH = lines.length * LINE_HEIGHT;
  const textTopY = y + (CLOUD_H - totalTextH) / 2 + FONT_SIZE * 0.85;

  return (
    <g
      // Whole bubble translucent + non-interactive — the user can
      // still click through to whatever's behind it.
      opacity={0.78}
      style={{ pointerEvents: "none" }}
    >
      <path
        d={cloudPath(CLOUD_W, CLOUD_H)}
        transform={`translate(${x.toFixed(1)}, ${y.toFixed(1)})`}
        fill="#ffffff"
        stroke="#475569"
        strokeWidth={1.5}
      />
      <text
        x={textCx}
        y={textTopY}
        textAnchor="middle"
        fontSize={FONT_SIZE}
        fontFamily="system-ui, sans-serif"
        fill="#1e293b"
        fontWeight={500}
      >
        {lines.map((line, i) => (
          <tspan key={i} x={textCx} dy={i === 0 ? 0 : LINE_HEIGHT}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}
