/**
 * AI-planning throbber. Diagramatix icon with the central triangle
 * (lines + 3 dots) rotating around its centroid, and a throbbing
 * light-blue aura pulsing behind the icon.
 *
 * Used in two surfaces:
 *   1. PlanPanel sidebar banner — small (size=28).
 *   2. Centred canvas overlay — large (size=120+) while Sonnet plans,
 *      so the user staring at the canvas has a visible wait cue.
 *
 * Implementation note: animations use SMIL `<animateTransform>` /
 * `<animate>` elements rather than CSS keyframes + transform-box.
 * SMIL is universally supported wherever SVG is and sidesteps the
 * `transform-box: view-box` / `fill-box` coordinate maths that broke
 * the first cut of this throbber. The aura circle is wrapped in a
 * `translate(50 50)` group so its scaling stays centred without a
 * compensating translate, and the triangle rotation uses the
 * three-arg `rotate(angle cx cy)` form to pivot around the centroid.
 *
 * ViewBox is enlarged from the icon's native 0 0 100 100 to
 * -25 -25 150 150 so the throbbing aura has room to grow past the
 * icon's bounds without clipping.
 *
 * Centroid (38.64, 50.92) computed from the three vertex circles in
 * public/logos/diagramatix-icon.svg.
 */
export function DiagramatixThrobber({
  size = 36,
  /** @deprecated The throbbing blue aura was removed; this prop is kept
   *  only so existing call sites keep compiling. It has no effect. */
  auraRadius: _auraRadius,
}: {
  size?: number;
  auraRadius?: number;
}) {
  // No aura — the icon fills its native 0 0 100 100 viewBox so it
  // renders at the requested `size`. Only the triangle rotates; there
  // is no throbbing blue circle behind it any more.
  // Triangle shifted 10 units right via a wrapping <g translate(10 0)>;
  // the SMIL rotate stays around the triangle's local centroid
  // (38.64, 50.92), which post-translate visually rotates around
  // (48.64, 50.92) — visually closer to the centre of the D-shape's
  // body than the raw centroid was.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      role="img"
      aria-label="AI planning"
    >
      {/* Static outer D-shape — same path as the source SVG icon. */}
      <path
        d="M 5.5 5.5 L 50 5.5 A 44.5 44.5 0 0 1 50 94.5 L 5.5 94.5 Z"
        fill="white"
        stroke="#2E5BD6"
        strokeWidth="11"
        strokeLinejoin="round"
      />
      {/* Rotating triangle — wrapped in a +10 x-translate to nudge the
          rotation centre toward the centre of the D-shape body. Inner
          group carries the SMIL rotation around the triangle's local
          centroid (38.64, 50.92). */}
      <g transform="translate(10 0)">
        <g>
          <g stroke="#2E5BD6" strokeWidth="2.5" strokeLinecap="round">
            <line x1="26.03" y1="30.62" x2="61.48" y2="50" />
            <line x1="61.48" y1="50" x2="28.40" y2="72.14" />
            <line x1="26.03" y1="30.62" x2="28.40" y2="72.14" />
          </g>
          <g fill="#1B3A95">
            <circle cx="26.03" cy="30.62" r="5.5" />
            <circle cx="61.48" cy="50" r="5.5" />
            <circle cx="28.40" cy="72.14" r="5.5" />
          </g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 38.64 50.92"
            to="360 38.64 50.92"
            dur="2.4s"
            repeatCount="indefinite"
          />
        </g>
      </g>
    </svg>
  );
}
