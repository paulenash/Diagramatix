"use client";

/**
 * The little coloured circles against a diagram's name — AI, SI, MN, AP, RC.
 *
 * Each takes its FEATURE COLOUR, so the badge for simulation data is the same
 * teal as the Simulator tiles and the Simulator Examples menu entry. That is the
 * whole point of the pairing: the colour, not the two letters, is what makes it
 * recognisable at a glance in a list of sixty rows.
 *
 * The letters still have to be readable, which a pale feature background alone
 * does not guarantee — so the fill is the feature's background and the ring and
 * text are its (darker) text tone, and `readableTextOn` rescues any custom
 * palette a SuperAdmin has pushed into an unreadable combination.
 */
import { useFeatureColors } from "@/app/lib/theme/useFeatureColors";
import { readableTextOn, tonesFor } from "@/app/lib/theme/featureColors";
import type { DiagramBadge } from "@/app/lib/diagram/diagramFeatureBadges";

export function DiagramFeatureBadges({ badges, className = "" }: { badges: DiagramBadge[]; className?: string }) {
  const scheme = useFeatureColors();
  if (badges.length === 0) return null;

  return (
    // shrink-0 so a long diagram name truncates instead of squeezing the badges
    // out — the name already has its own ellipsis, and a half-drawn circle reads
    // as a rendering fault rather than as a name that was too long.
    <span className={`flex items-center gap-0.5 shrink-0 ${className}`}>
      {badges.map((b) => {
        const { bg, text } = tonesFor(scheme, b.color);
        const fg = readableTextOn(bg, text);
        return (
          <span
            key={b.key}
            title={b.title}
            aria-label={b.title}
            className="inline-flex items-center justify-center rounded-full border font-semibold select-none"
            style={{
              width: 15, height: 15,
              fontSize: 7.5, lineHeight: 1, letterSpacing: "0.02em",
              backgroundColor: bg, color: fg, borderColor: fg,
            }}
          >
            {b.code}
          </span>
        );
      })}
    </span>
  );
}
