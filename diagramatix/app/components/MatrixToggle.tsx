"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Global Matrix-rain screensaver. The little green "M" pinned to the
 * bottom-left of every page is the on/off switch:
 *
 *   - OFF  → feature disabled, nothing happens.
 *   - ON   → after the idle timeout (default 30 s, configurable via the
 *            Dashboard System menu) the canvas overlay activates. Any
 *            keyboard/mouse activity dismisses the rain and re-arms the
 *            timer; clicking M again turns the whole feature off.
 *
 * Both the on/off state and the idle timeout persist in localStorage and
 * sync across components via a `diagramatix.matrix.config-changed` event.
 */
const ARMED_KEY = "diagramatix.matrix.armed";
const IDLE_KEY = "diagramatix.matrix.idleSeconds";
const CONFIG_EVENT = "diagramatix.matrix.config-changed";
const DEFAULT_IDLE_SECONDS = 30;

function readArmed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ARMED_KEY) === "1";
}
function readIdleSeconds(): number {
  if (typeof window === "undefined") return DEFAULT_IDLE_SECONDS;
  const n = parseInt(localStorage.getItem(IDLE_KEY) ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_IDLE_SECONDS;
}

export function MatrixToggle() {
  const [armed, setArmedState] = useState(false);
  const [running, setRunning] = useState(false);
  const [idleSeconds, setIdleSeconds] = useState(DEFAULT_IDLE_SECONDS);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Hydrate from localStorage on mount + react to config-changed events
  // dispatched by the System-menu settings dialog.
  useEffect(() => {
    setArmedState(readArmed());
    setIdleSeconds(readIdleSeconds());
    const onConfig = () => {
      setArmedState(readArmed());
      setIdleSeconds(readIdleSeconds());
    };
    window.addEventListener(CONFIG_EVENT, onConfig);
    return () => window.removeEventListener(CONFIG_EVENT, onConfig);
  }, []);

  const setArmed = (next: boolean) => {
    setArmedState(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(ARMED_KEY, next ? "1" : "0");
    }
    if (!next) setRunning(false); // turning off also exits any active rain
  };

  // Idle timer — runs while armed and not currently raining. Any keyboard
  // or pointer activity resets the countdown. Timer expiration starts the
  // rain. Mousemove is throttled to ~5 Hz so a moving cursor doesn't burn
  // a clearTimeout/setTimeout on every pixel.
  useEffect(() => {
    if (!armed || running) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const start = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setRunning(true), idleSeconds * 1000);
    };
    let lastMove = 0;
    const onMove = () => {
      const now = Date.now();
      if (now - lastMove < 200) return;
      lastMove = now;
      start();
    };
    const reset = () => start();
    start();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("keydown", reset);
    window.addEventListener("mousedown", reset);
    window.addEventListener("touchstart", reset);
    window.addEventListener("scroll", reset, true);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("keydown", reset);
      window.removeEventListener("mousedown", reset);
      window.removeEventListener("touchstart", reset);
      window.removeEventListener("scroll", reset, true);
    };
  }, [armed, running, idleSeconds]);

  // Rain animation — same as the dedicated /matrix page, runs while
  // `running` is true. Any keydown dismisses the rain and the idle effect
  // above re-arms a fresh timer.
  useEffect(() => {
    if (!running) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const FONT_SIZE = 16;
    const FADE_ALPHA = 0.06;
    const RESET_PROBABILITY = 0.025;
    const SPEED_DIVISOR = 4;
    const CHARS =
      "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン" +
      "0123456789ABCDEF" +
      "ﾊﾋﾌﾍﾎﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛ";
    const CHAR_ARRAY = CHARS.split("");

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
      ctx.fillStyle = `rgba(0, 0, 0, ${FADE_ALPHA})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < drops.length; i++) {
        const y = drops[i] * FONT_SIZE;
        if (y >= 0 && y < canvas.height + FONT_SIZE) {
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
    let frame = 0;
    const loop = () => {
      if (frame % SPEED_DIVISOR === 0) draw();
      frame++;
      raf = window.requestAnimationFrame(loop);
    };
    loop();

    const dismiss = (e: KeyboardEvent | MouseEvent | TouchEvent) => {
      if ("preventDefault" in e) e.preventDefault();
      setRunning(false);
    };
    window.addEventListener("keydown", dismiss);
    window.addEventListener("mousedown", dismiss);
    window.addEventListener("touchstart", dismiss);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", dismiss);
      window.removeEventListener("mousedown", dismiss);
      window.removeEventListener("touchstart", dismiss);
      window.cancelAnimationFrame(raf);
    };
  }, [running]);

  return (
    <>
      {running && <canvas ref={canvasRef} className="fixed inset-0 z-[60] bg-black" />}
      <button
        onClick={() => setArmed(!armed)}
        className={`fixed bottom-4 left-4 z-[70] w-10 h-10 flex items-center justify-center rounded-full border-2 font-mono font-bold text-lg transition-all bg-black ${
          armed
            ? "border-green-400 text-green-400 shadow-[0_0_15px_rgba(74,222,128,0.7)] hover:scale-110"
            : "border-green-700/60 text-green-700/60 hover:border-green-400 hover:text-green-400 hover:scale-110"
        }`}
        title={
          armed
            ? `Matrix screensaver ON — fires after ${idleSeconds}s idle. Click to disable.`
            : "Matrix screensaver OFF. Click to enable."
        }
        aria-label="Toggle Matrix screensaver"
        aria-pressed={armed}
      >
        M
      </button>
    </>
  );
}
