"use client";

/**
 * The green flash: the connectors that heal-on-load moved when this diagram was opened, three pulses, then gone
 * (connector-endpoint plan, slice 5; Paul, 2026-10-04: "heal-on-load should flash the affected connectors green").
 *
 * Rendered INSIDE the canvas's world-coordinate group, like the gold flash, so each line sits on its connector wherever the
 * canvas is panned or zoomed. Only the VISIBLE part of each connector is lit — between its two attachment points — never
 * the invisible leader that runs on to the middle of the element behind it. Purely decorative: `pointerEvents: none`.
 *
 * Animates in CSS (a keyframe, not a React tick per frame), and unmounts itself when the run is over. Someone who asked
 * for less motion gets the green held steady for a moment instead.
 */
import React, { useEffect, useState } from "react";

export interface HealFlashLine {
  id: string;
  points: { x: number; y: number }[];
}

/** Three pulses, as the gold flash. */
export const HEAL_FLASH_PULSES = 3;
export const HEAL_FLASH_PULSE_MS = 560;
export const HEAL_FLASH_TOTAL_MS = HEAL_FLASH_PULSES * HEAL_FLASH_PULSE_MS;
export const HEAL_GREEN = { deep: "#15803d", bright: "#4ade80" } as const;

let seq = 0;

export function HealFlashOverlay({ runId, lines }: { runId: number; lines: readonly HealFlashLine[] }) {
  const [live, setLive] = useState<{ runId: number; lines: readonly HealFlashLine[] } | null>(null);
  const [uid] = useState(() => `hf${++seq}`);

  useEffect(() => {
    if (!runId || lines.length === 0) return;
    setLive({ runId, lines });
    const t = setTimeout(() => setLive(null), HEAL_FLASH_TOTAL_MS + 120);
    return () => clearTimeout(t);
  }, [runId, lines]);

  if (!live) return null;
  return (
    <g style={{ pointerEvents: "none" }} aria-hidden="true" data-heal-flash={live.runId}>
      <style>{`
        @keyframes ${uid}-pulse { 0%, 100% { opacity: 0; } 20% { opacity: 1; } 65% { opacity: 0.85; } }
        @media (prefers-reduced-motion: reduce) { .${uid}-line { animation: none !important; opacity: 0.95 !important; } }
      `}</style>
      {live.lines.map((l) => {
        const pts = l.points.map((p) => `${p.x},${p.y}`).join(" ");
        const anim = `${uid}-pulse ${HEAL_FLASH_PULSE_MS}ms ease-in-out ${HEAL_FLASH_PULSES}`;
        return (
          <g key={l.id}>
            <polyline className={`${uid}-line`} points={pts} fill="none" stroke={HEAL_GREEN.deep} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round"
              vectorEffect="non-scaling-stroke" style={{ animation: anim, opacity: 0 }} data-heal-flash-line={l.id} />
            <polyline className={`${uid}-line`} points={pts} fill="none" stroke={HEAL_GREEN.bright} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round"
              vectorEffect="non-scaling-stroke" style={{ animation: anim, opacity: 0 }} />
          </g>
        );
      })}
    </g>
  );
}
