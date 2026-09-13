"use client";

/**
 * Chrome for the NEW AI Generate console — the Simulator / Miner grammar
 * (black ground, mono, a rain backdrop, capped centred column) themed by the
 * configured AI feature colour rather than by a hardcoded phosphor green.
 *
 * The tones are DERIVED from that one colour. The Simulator can hardcode
 * `text-green-400` because its colour is fixed; ours is whatever the org set
 * for AI Generate, and a mid-violet that reads perfectly on white is close to
 * invisible on black. So every tone here is a mix of the configured colour with
 * white (lighter, for text and borders) — if an org sets AI to navy, the
 * console goes pale blue rather than unreadable.
 */
import type { CSSProperties } from "react";

export interface AiTones {
  /** The configured colour itself — solid fills (panel headers, primary button). */
  accent: string;
  /** Lightened for body text and headings on the black ground. */
  bright: string;
  /** Mid tone for borders and rules. */
  line: string;
  /** Faint fill for hovers and selected rows. */
  wash: string;
}

/**
 * Mixes towards white by `pct` — 0 is the colour unchanged, 100 is white.
 * `color-mix` keeps this honest for any input format (hex, rgb, a named
 * colour), which a manual hex-lighten would not.
 */
const lighten = (colour: string, pct: number) =>
  `color-mix(in srgb, ${colour} ${100 - pct}%, white)`;

/**
 * The mix ratios are tuned to stay COLOURED, not merely legible. An earlier pass
 * lightened `bright` to 38% of the accent, which reads on black but is so close
 * to white that changing the configured colour barely showed — the console
 * looked the same whatever the org had set, which defeats the point of theming
 * it. 55% keeps a saturated tone that is still comfortably readable.
 */
export function aiTones(accent: string): AiTones {
  return {
    accent,
    bright: lighten(accent, 45),
    line: lighten(accent, 34),
    wash: `color-mix(in srgb, ${accent} 28%, transparent)`,
  };
}

/** A console panel: accent title bar, dark body, no inner scroll by default. */
export function AiPanel({
  title, hint, tones, children, className = "", bodyClassName = "", right,
}: {
  title: string;
  hint?: string;
  tones: AiTones;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Controls rendered at the right of the title bar. */
  right?: React.ReactNode;
}) {
  return (
    <section
      className={`rounded border bg-black/60 min-w-0 flex flex-col ${className}`}
      style={{ borderColor: tones.line }}
    >
      <div
        className="px-3 py-1.5 shrink-0 flex items-center justify-between gap-3 border-b"
        style={{ borderColor: tones.line, background: tones.wash }}
      >
        <span className="text-[11px] font-mono uppercase tracking-widest" style={{ color: tones.bright }}>
          {title}
        </span>
        <div className="flex items-center gap-2 min-w-0">
          {hint && <span className="text-[9px] truncate" style={{ color: tones.bright, opacity: 0.6 }}>{hint}</span>}
          {right}
        </div>
      </div>
      <div className={`p-3 min-w-0 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/**
 * A console button. `solid` is the accent-filled primary; `outline` the accent
 * border; `danger` and `muted` are fixed because they mean the same thing
 * whatever the feature colour is (red is destructive, grey is secondary).
 */
export function AiButton({
  children, onClick, tones, variant = "outline", disabled, title, className = "", style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tones: AiTones;
  variant?: "solid" | "outline" | "danger" | "muted";
  disabled?: boolean;
  title?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const base = "px-3 py-1 text-xs font-mono tracking-wider border rounded transition inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed";
  const themed: CSSProperties =
    variant === "solid" ? { background: tones.accent, color: "#fff", borderColor: tones.accent }
      : variant === "outline" ? { color: tones.bright, borderColor: tones.line }
        : {};
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{ ...themed, ...style }}
      className={`${base} ${
        variant === "danger" ? "text-red-300 border-red-400/60 hover:bg-red-400/10"
          : variant === "muted" ? "text-white/70 border-white/25 hover:bg-white/10"
            : "hover:brightness-110"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** The same inline spinner the plan panel uses, so busy states look identical. */
export function AiSpinner({ className = "w-3 h-3 text-current" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
