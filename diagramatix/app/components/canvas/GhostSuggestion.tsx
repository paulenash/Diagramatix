"use client";
/**
 * Tier-1 next-step "ghost" suggestions (assist-while-you-draw). When a single
 * element is selected, translucent candidate chips appear to its right, the
 * stack vertically centred on the source. The first chip is primary (⇥ Tab or
 * click), the rest are click-to-pick. Chips are styled per kind:
 *   element (purple) · boundary (blue) · template (emerald) · intent (amber, filled).
 * Rendered inside the Canvas world <g> so it pans/zooms with the diagram.
 */
import type { DiagramElement } from "@/app/lib/diagram/types";
import type { NextStepCandidate, CandidateKind } from "@/app/lib/diagram/nextSteps";

const GAP = 70;             // horizontal gap from the source's right edge
const W = 118, H = 40, VGAP = 8;

const STYLE: Record<CandidateKind, { fill: string; stroke: string; text: string; icon: string; filled?: boolean }> = {
  element:  { fill: "#faf5ff", stroke: "#9333ea", text: "#6b21a8", icon: "" },
  boundary: { fill: "#eff6ff", stroke: "#2563eb", text: "#1e40af", icon: "◔ " },
  template: { fill: "#f0fdf4", stroke: "#16a34a", text: "#166534", icon: "🧩 " },
  intent:   { fill: "#fef3c7", stroke: "#d97706", text: "#92400e", icon: "✨ ", filled: true },
  dataobject: { fill: "#f8fafc", stroke: "#64748b", text: "#334155", icon: "📄 " },
};

export function GhostSuggestion({
  source,
  candidates,
  onAccept,
}: {
  source: DiagramElement;
  candidates: NextStepCandidate[];
  onAccept: (c: NextStepCandidate) => void;
}) {
  if (candidates.length === 0) return null;
  const x = source.x + source.width + GAP;
  const srcMidY = source.y + source.height / 2;
  const n = candidates.length;
  const stackH = n * H + (n - 1) * VGAP;
  const startY = srcMidY - stackH / 2;
  const primary = candidates[0];

  return (
    <g data-interactive style={{ pointerEvents: "all" }}>
      {/* Connector preview only when the primary actually draws one (elements). */}
      {primary.kind === "element" && (
        <line x1={source.x + source.width} y1={srcMidY} x2={x} y2={startY + H / 2}
          stroke="#9333ea" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.55} />
      )}
      {candidates.map((c, i) => {
        const y = startY + i * (H + VGAP);
        const midY = y + H / 2;
        const isPrimary = i === 0;
        const s = STYLE[c.kind];
        return (
          <g
            key={`${c.kind}-${c.symbolType}-${i}`}
            // Act on mousedown, not click: a bubbling mousedown would reach the
            // canvas background handler, start a pan gesture and clear the
            // selection — which unmounts this ghost before a click could land.
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onAccept(c); }}
            style={{ cursor: "pointer" }}
          >
            <rect x={x} y={y} width={W} height={H} rx={8}
              fill={s.filled ? s.stroke : s.fill} stroke={s.stroke}
              strokeWidth={isPrimary ? 2 : 1.2}
              strokeDasharray={s.filled ? undefined : "5 4"}
              opacity={s.filled ? 0.95 : isPrimary ? 0.97 : 0.72} />
            <text x={x + W / 2} y={midY - 1} textAnchor="middle" fontSize={12} fontWeight={600}
              fill={s.filled ? "#ffffff" : s.text}>{s.icon}{c.label}</text>
            <text x={x + W / 2} y={midY + 12} textAnchor="middle" fontSize={8}
              fill={s.filled ? "#fffbeb" : s.stroke}>
              {isPrimary ? "⇥ Tab · click" : "click"}
            </text>
          </g>
        );
      })}
    </g>
  );
}
