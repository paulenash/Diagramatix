"use client";

/**
 * Reusable Matrix katakana-rain canvas — the digital-rain effect, lifted from
 * the standalone /matrix page so the Simulator can reuse it for the entry
 * burst and as ambient chrome. Fills its positioned parent. Optional
 * `durationMs` fires `onDone` once (for the entry burst). Honours
 * prefers-reduced-motion by skipping straight to onDone.
 */

import { useEffect, useRef } from "react";

export function MatrixRain({
  durationMs,
  onDone,
  fontSize = 16,
  className = "",
}: {
  durationMs?: number;
  onDone?: () => void;
  fontSize?: number;
  className?: string;
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
    const SPEED_DIVISOR = 4;
    const CHARS = (
      "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン" +
      "0123456789ABCDEF" +
      "ﾊﾋﾌﾍﾎﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛ"
    ).split("");

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
          ctx.fillStyle = drops[i] < 2 ? "#D4FFD4" : "#22FF22";
          ctx.fillText(CHARS[Math.floor(Math.random() * CHARS.length)], i * fontSize, y);
        }
        drops[i]++;
        if (y > canvas.height && Math.random() < RESET_PROBABILITY) drops[i] = 0;
      }
    };

    let raf = 0;
    let frame = 0;
    const loop = () => {
      if (frame % SPEED_DIVISOR === 0) draw();
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
