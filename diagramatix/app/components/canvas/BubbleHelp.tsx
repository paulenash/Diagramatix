"use client";

/**
 * Comic-style help cloud rendered inside the Canvas SVG world (so it
 * pans/zooms with the diagram). Anchors EITHER to the upper-right of
 * a clicked element OR to a literal click point on empty canvas.
 * Semi-transparent so the diagram remains visible beneath the cloud.
 *
 * Text is passed as a single string; embedded `\n` newlines split into
 * lines at render time so admin-typed multi-line text works directly.
 * The cloud's bounding box auto-sizes to fit the current text — wider
 * for long lines, taller for many lines — with comfortable padding so
 * text never crowds the lobed perimeter.
 */

interface Props {
  /** World-space x of the user's click — bubble sits upper-right of this. */
  pointX: number;
  /** World-space y of the user's click. */
  pointY: number;
  /** Bubble text; `\n` splits into lines. */
  text: string;
}

const FONT_SIZE = 20;
const LINE_HEIGHT = 26;
// Approximate average character width at 20-pt system-ui. SVG can't
// measure text without DOM, so we approximate; the generous padding
// below covers any slack.
const AVG_CHAR_W = 11;
// Padding (in world units) between the text block and the cloud's
// nominal bounding box on each side. The bumpy cloud lobes consume
// the outer ~10 % so the effective inner zone is smaller — these
// values are tuned so 3–6 lines of typical hint text fit cleanly.
const PAD_X = 36;
const PAD_Y = 32;
const MIN_W = 220;
const MIN_H = 130;
const ANCHOR_GAP = 12;

/**
 * Bumpy cloud silhouette. Eight cubic curve segments form lobes
 * around the perimeter; the shape reads as a comic-book speech cloud
 * at a glance and scales correctly to any width × height.
 */
function cloudPath(w: number, h: number): string {
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

export function BubbleHelp({ pointX, pointY, text }: Props) {
  const lines = text.split("\n");
  const longestLine = lines.reduce((max, l) => Math.max(max, l.length), 0);
  const cloudW = Math.max(MIN_W, longestLine * AVG_CHAR_W + PAD_X * 2);
  const cloudH = Math.max(MIN_H, lines.length * LINE_HEIGHT + PAD_Y * 2);

  // Cloud's bottom-left sits just above-and-right of the click point.
  // Falls back to below-and-right when the upper position would clip
  // above world y=0.
  let x = pointX + ANCHOR_GAP;
  let y = pointY - cloudH - ANCHOR_GAP;
  if (y < 0) y = pointY + ANCHOR_GAP;

  const textCx = x + cloudW / 2;
  const totalTextH = lines.length * LINE_HEIGHT;
  const textTopY = y + (cloudH - totalTextH) / 2 + FONT_SIZE * 0.85;

  // Comic-style thought-bubble tail — three small circles between the
  // click point and the cloud, growing larger as they approach the
  // cloud. The endpoint anchors to the bubble's nearest lobe so the
  // tail visually connects to the silhouette.
  const tailEndX = x + cloudW * 0.18;
  const tailEndY = y > pointY
    ? y + cloudH * 0.20   // bubble below click — tail goes to bubble's TOP
    : y + cloudH * 0.85;  // bubble above click — tail goes to bubble's BOTTOM
  const tailDots = [
    { t: 0.30, r: 3 },
    { t: 0.55, r: 5 },
    { t: 0.80, r: 7 },
  ].map(d => ({
    cx: pointX + (tailEndX - pointX) * d.t,
    cy: pointY + (tailEndY - pointY) * d.t,
    r: d.r,
  }));

  return (
    <g
      opacity={0.78}
      style={{ pointerEvents: "none" }}
    >
      {tailDots.map((d, i) => (
        <circle key={`dot-${i}`}
          cx={d.cx} cy={d.cy} r={d.r}
          fill="#ffffff" stroke="#475569" strokeWidth={1}
        />
      ))}
      <path
        d={cloudPath(cloudW, cloudH)}
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
