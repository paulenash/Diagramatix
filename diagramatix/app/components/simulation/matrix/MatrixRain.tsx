"use client";

/**
 * The cascade — a canvas of glyphs falling down the screen, used for the
 * Simulator's and the Miner's entry bursts and as ambient chrome.
 *
 * WHAT falls is a parameter, not a constant. Paul, 2026-09-07: the Simulator's
 * becomes "a cascade of small green BPMN symbols", the Miner's "small brown
 * jagged rocks (50%) small brown BPMN symbols (50%)". Both are the same
 * animation; only the glyph set and the colours differ, which is why they read
 * as two versions of one thing rather than two effects.
 *
 * Fills its positioned parent. Optional `durationMs` fires `onDone` once (for
 * the entry burst). Honours prefers-reduced-motion by skipping straight to
 * onDone.
 */

import { useEffect, useRef } from "react";
import { drawGlyph, type GlyphSet } from "./glyphs";

export function MatrixRain({
  durationMs,
  onDone,
  fontSize = 16,
  className = "",
  color = "#22FF22",
  headColor = "#D4FFD4",
  glyphs = "katakana",
  speedDivisor = 4,
}: {
  durationMs?: number;
  onDone?: () => void;
  /** The box each glyph is drawn in, and the column width. */
  fontSize?: number;
  className?: string;
  /** Trailing-glyph colour (default Matrix green). The Miner uses a brown. */
  color?: string;
  /** Leading "head" glyph colour. */
  headColor?: string;
  /** What falls: katakana, BPMN symbols, or the Miner's rocks-and-BPMN mix. */
  glyphs?: GlyphSet;
  /**
   * Frames skipped between redraws, so a BIGGER number is a SLOWER cascade.
   * 4 is the original Matrix rate; 8 is half of it.
   */
  speedDivisor?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const reduced = typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      const t = window.setTimeout(() => onDone?.(), Math.min(durationMs ?? 0, 300));
      return () => window.clearTimeout(t);
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const FADE_ALPHA = 0.06;
    const RESET_PROBABILITY = 0.025;

    let drops: number[] = [];
    const resize = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      const cols = Math.max(1, Math.floor(canvas.width / fontSize));
      drops = new Array(cols).fill(0).map(() => Math.floor(Math.random() * -100));
      ctx.font = `${fontSize}px monospace`;
      ctx.textBaseline = "top";
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      ctx.fillStyle = `rgba(0, 0, 0, ${FADE_ALPHA})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < drops.length; i++) {
        const y = drops[i] * fontSize;
        if (y >= 0 && y < canvas.height + fontSize) {
          drawGlyph(ctx, glyphs, i * fontSize, y, fontSize, drops[i] < 2 ? headColor : color);
        }
        drops[i]++;
        if (y > canvas.height && Math.random() < RESET_PROBABILITY) drops[i] = 0;
      }
    };

    let raf = 0;
    let frame = 0;
    const loop = () => {
      if (frame % speedDivisor === 0) draw();
      frame++;
      raf = window.requestAnimationFrame(loop);
    };
    loop();

    const timer = durationMs ? window.setTimeout(() => onDone?.(), durationMs) : 0;
    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(raf);
      if (timer) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} className={`absolute inset-0 w-full h-full ${className}`} />;
}
