"use client";
/**
 * Tier-1 next-step "ghost" suggestions (assist-while-you-draw). When a single
 * element is selected, translucent candidate chips appear to its right; the
 * first is primary (⇥ Tab or click), the rest are click-to-pick. Rendered inside
 * the Canvas world <g> so it pans/zooms with the diagram.
 */
import type { DiagramElement } from "@/app/lib/diagram/types";
import type { NextStepCandidate } from "@/app/lib/diagram/nextSteps";

const GAP = 70;   // horizontal gap from the source's right edge
const W = 112, H = 58, VGAP = 12;

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
  return (
    <g data-interactive style={{ pointerEvents: "all" }}>
      {candidates.map((c, i) => {
        const y = source.y + i * (H + VGAP);
        const midY = y + H / 2;
        const primary = i === 0;
        return (
          <g
            key={`${c.symbolType}-${i}`}
            // Act on mousedown, not click: a bubbling mousedown would reach the
            // canvas background handler, start a pan gesture and clear the
            // selection — which unmounts this ghost before a click could land.
            // preventDefault + stopPropagation keeps the selection intact so the
            // accept handler still sees the source element.
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onAccept(c); }}
            style={{ cursor: "pointer" }}
          >
            {primary && (
              <line x1={source.x + source.width} y1={srcMidY} x2={x} y2={midY}
                stroke="#9333ea" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.55} />
            )}
            <rect x={x} y={y} width={W} height={H} rx={8}
              fill="#faf5ff" stroke="#9333ea" strokeWidth={primary ? 2 : 1.2}
              strokeDasharray="5 4" opacity={primary ? 0.97 : 0.72} />
            <text x={x + W / 2} y={midY - 2} textAnchor="middle" fontSize={13} fontWeight={600} fill="#6b21a8">{c.label}</text>
            <text x={x + W / 2} y={midY + 14} textAnchor="middle" fontSize={9} fill="#9333ea">
              {primary ? "⇥ Tab · click" : "click"}
            </text>
          </g>
        );
      })}
    </g>
  );
}
