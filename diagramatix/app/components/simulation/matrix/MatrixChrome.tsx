"use client";

/**
 * Matrix-style UI kit for the Simulator console — green-phosphor mono chrome
 * (black bg, #22FF22 text, glow) reused across the intro, managers and results.
 */

import { useEffect, useState } from "react";

export function MatrixButton({
  children,
  onClick,
  variant = "default",
  className = "",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "danger";
  className?: string;
  type?: "button" | "submit";
}) {
  const colour = variant === "danger" ? "text-red-400 border-red-400 hover:bg-red-400/10" : "text-green-400 border-green-400 hover:bg-green-400/10";
  return (
    <button
      type={type}
      onClick={onClick}
      className={`px-3 py-1 text-xs font-mono tracking-wider border rounded transition hover:shadow-[0_0_12px_rgba(74,222,128,0.45)] ${colour} ${className}`}
    >
      {children}
    </button>
  );
}

export function MatrixPanel({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`border border-green-500/40 rounded bg-black/60 ${className}`}>
      {title && (
        <div className="px-3 py-1.5 border-b border-green-500/30 text-[11px] font-mono uppercase tracking-widest text-green-400/80">
          {title}
        </div>
      )}
      <div className="p-3">{children}</div>
    </div>
  );
}

/** Types `text` character-by-character, then calls onDone. A blinking caret
 *  trails the output. */
export function MatrixTypewriter({
  text,
  speedMs = 45,
  onDone,
  className = "",
  colorClass = "text-green-400",
}: {
  text: string;
  speedMs?: number;
  onDone?: () => void;
  className?: string;
  /** Text colour utility (default Matrix green; the Miner passes amber). */
  colorClass?: string;
}) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= text.length) { onDone?.(); return; }
    const t = window.setTimeout(() => setN((v) => v + 1), speedMs);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, text]);
  return (
    <span className={`font-mono ${colorClass} ${className}`}>
      {text.slice(0, n)}
      <span className="animate-pulse">▋</span>
    </span>
  );
}
