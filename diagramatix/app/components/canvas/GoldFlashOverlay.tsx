"use client";

/**
 * The gold flash: outline what the last command touched, three times, with
 * sparks coming off it (Paul, 2026-09-17).
 *
 * Rendered INSIDE the canvas's world-coordinate group, so the outline sits on
 * the items wherever the canvas is panned or zoomed, with no coordinate maths
 * of its own. Purely decorative: `pointerEvents: none` throughout, so it can
 * never swallow a click on the diagram underneath it.
 *
 * Everything animates in CSS rather than on a timer. A React state tick per
 * frame would re-render the whole canvas thirty times a second for an effect
 * that is over in a second and a half; a keyframe runs on the compositor and
 * costs nothing. The component unmounts itself when the run is over.
 */
import React, { useEffect, useState } from "react";
import {
  GOLD,
  GOLD_FLASH_PULSES,
  GOLD_FLASH_PULSE_MS,
  GOLD_FLASH_TOTAL_MS,
  sparksFor,
} from "@/app/lib/assist/goldFlash";

export interface GoldFlashTarget {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  /**
   * Bumped by the editor each time a command finishes. A new number starts a
   * new run; the same number does nothing, so an unrelated re-render of the
   * canvas cannot re-trigger the effect.
   */
  runId: number;
  /** World-space boxes of the items the command touched. */
  targets: readonly GoldFlashTarget[];
}

/** Unique per mount so two overlays' keyframes and filters cannot collide. */
let seq = 0;

export function GoldFlashOverlay({ runId, targets }: Props) {
  const [live, setLive] = useState<{ runId: number; targets: readonly GoldFlashTarget[] } | null>(null);
  const [uid] = useState(() => `gf${++seq}`);

  useEffect(() => {
    if (!runId || targets.length === 0) return;
    // `window.__DIAG_GOLD_FLASH = true` in the console to watch runs arrive.
    // Cheap to leave in: this is the one place that knows a flash was asked for,
    // and "nothing happened" is otherwise indistinguishable from "never armed".
    if (typeof window !== "undefined" && (window as { __DIAG_GOLD_FLASH?: boolean }).__DIAG_GOLD_FLASH) {
      console.log("[goldFlash] run", runId, "→", targets.map((t) => t.id).join(", "));
    }
    setLive({ runId, targets });
    // Clear when the last pulse has finished, so nothing is left in the tree.
    const t = setTimeout(() => setLive(null), GOLD_FLASH_TOTAL_MS + 120);
    return () => clearTimeout(t);
  }, [runId, targets]);

  if (!live) return null;

  const glowId = `${uid}-glow`;

  return (
    <g style={{ pointerEvents: "none" }} aria-hidden="true" data-gold-flash={live.runId}>
      <defs>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <style>{`
        @keyframes ${uid}-pulse {
          0%, 100% { opacity: 0; }
          18%      { opacity: 1; }
          62%      { opacity: 0.85; }
        }
        /* Translate only — NO scale(). On an SVG element CSS transforms take
           their origin from the SVG user space, not the shape, so a scale()
           here would move each spark toward the top-left of the DIAGRAM rather
           than shrink it in place. The taper comes from the radius instead. */
        @keyframes ${uid}-spark {
          0%   { opacity: 0; transform: translate(0, 0); }
          14%  { opacity: 1; }
          100% { opacity: 0; transform: translate(var(--dx), var(--dy)); }
        }
        /* Someone who has asked for less motion gets the outline, held steady,
           and no sparks at all. The information is in the gold, not the movement. */
        @media (prefers-reduced-motion: reduce) {
          .${uid}-ring  { animation: none !important; opacity: 0.95 !important; }
          .${uid}-spark { display: none !important; }
        }
      `}</style>

      {live.targets.map((t) => {
        const pad = 4;
        const cx = t.x + t.width / 2;
        const cy = t.y + t.height / 2;
        // Sparks leave from the item's edge, so the reach is scaled to its size.
        const radius = Math.max(t.width, t.height) / 2 + pad;
        return (
          <g key={t.id}>
            {/* Two rings: a soft deep edge under a bright core, so it reads as
                metal rather than a flat yellow box. */}
            <rect
              className={`${uid}-ring`}
              x={t.x - pad - 1.5} y={t.y - pad - 1.5}
              width={t.width + (pad + 1.5) * 2} height={t.height + (pad + 1.5) * 2}
              rx={6} fill="none" stroke={GOLD.deep} strokeWidth={5}
              filter={`url(#${glowId})`}
              style={{
                animation: `${uid}-pulse ${GOLD_FLASH_PULSE_MS}ms ease-in-out ${GOLD_FLASH_PULSES}`,
                opacity: 0,
              }}
            />
            <rect
              className={`${uid}-ring`}
              x={t.x - pad} y={t.y - pad}
              width={t.width + pad * 2} height={t.height + pad * 2}
              rx={5} fill="none" stroke={GOLD.bright} strokeWidth={2}
              style={{
                animation: `${uid}-pulse ${GOLD_FLASH_PULSE_MS}ms ease-in-out ${GOLD_FLASH_PULSES}`,
                opacity: 0,
              }}
            />

            {sparksFor(t.id).map((s, i) => {
              const dist = radius * (1 + s.reach);
              const dx = Math.cos(s.angle) * dist;
              const dy = Math.sin(s.angle) * dist;
              // Start on the item's edge in the spark's own direction.
              const sx = cx + Math.cos(s.angle) * radius;
              const sy = cy + Math.sin(s.angle) * radius;
              return (
                <circle
                  key={i}
                  className={`${uid}-spark`}
                  cx={sx} cy={sy} r={2.2}
                  fill={GOLD.bright}
                  filter={`url(#${glowId})`}
                  style={{
                    // The CSS variables the keyframe reads. Set per spark so one
                    // keyframe serves all of them.
                    ["--dx" as string]: `${dx}px`,
                    ["--dy" as string]: `${dy}px`,
                    animation: `${uid}-spark ${GOLD_FLASH_PULSE_MS}ms ease-out ${s.delay * GOLD_FLASH_PULSE_MS}ms ${GOLD_FLASH_PULSES}`,
                    opacity: 0,
                  }}
                />
              );
            })}
          </g>
        );
      })}
    </g>
  );
}
