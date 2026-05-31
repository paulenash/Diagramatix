"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The Matrix — pure-canvas katakana rain. Self-contained, auth-gated by
 * being inside the (dashboard) route group. Visit /matrix to use.
 */
export default function MatrixPage() {
  const [running, setRunning] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!running) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Tunables. Lower FADE_ALPHA = longer trails (each frame paints a less
    // opaque black over the canvas before drawing the next head).
    const FONT_SIZE = 16;
    const FADE_ALPHA = 0.06;
    const RESET_PROBABILITY = 0.025; // chance per frame a finished column restarts
    const CHARS =
      "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン" +
      "0123456789ABCDEF" +
      "ﾊﾋﾌﾍﾎﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛ";
    const CHAR_ARRAY = CHARS.split("");

    // One drop position per column (in row units; negative values stagger the
    // initial entry so columns don't all start at row 0).
    let drops: number[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const cols = Math.floor(canvas.width / FONT_SIZE);
      drops = new Array(cols).fill(0).map(() => Math.floor(Math.random() * -100));
      ctx.font = `${FONT_SIZE}px monospace`;
      ctx.textBaseline = "top";
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      // Semi-transparent black wipe — gives the trail fade.
      ctx.fillStyle = `rgba(0, 0, 0, ${FADE_ALPHA})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < drops.length; i++) {
        const y = drops[i] * FONT_SIZE;
        if (y >= 0 && y < canvas.height + FONT_SIZE) {
          // Head a touch brighter than the trail — the fade overlay above
          // dims earlier chars on every subsequent frame, so this single
          // bright write is enough to make the leading character pop.
          ctx.fillStyle = drops[i] < 2 ? "#D4FFD4" : "#22FF22";
          ctx.fillText(
            CHAR_ARRAY[Math.floor(Math.random() * CHAR_ARRAY.length)],
            i * FONT_SIZE,
            y,
          );
        }
        drops[i]++;
        if (y > canvas.height && Math.random() < RESET_PROBABILITY) drops[i] = 0;
      }
    };

    let raf = 0;
    const loop = () => {
      draw();
      raf = window.requestAnimationFrame(loop);
    };
    loop();

    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      setRunning(false);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      window.cancelAnimationFrame(raf);
    };
  }, [running]);

  return (
    <div className="fixed inset-0 z-50 bg-black overflow-hidden">
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 ${running ? "block" : "hidden"}`}
      />
      {!running ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            onClick={() => setRunning(true)}
            className="px-8 py-3 text-lg font-mono tracking-wider text-green-400 border-2 border-green-400 rounded hover:bg-green-400/10 hover:shadow-[0_0_20px_rgba(74,222,128,0.5)] transition"
          >
            ▶ Enter the Matrix
          </button>
        </div>
      ) : (
        <p className="absolute bottom-4 right-4 text-xs text-green-400/40 font-mono pointer-events-none select-none">
          press any key to exit
        </p>
      )}
    </div>
  );
}
