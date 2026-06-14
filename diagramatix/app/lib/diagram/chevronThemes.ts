export interface ChevronTheme {
  name: string;
  colours: readonly string[];
}

// Each theme is now a single-hue ramp — 9 control shades of ONE underlying
// colour (light → dark), redistributed across SHADE_COUNT (12) evenly
// spaced shades. The ramp continues into the dark end of the hue (no longer
// capped); chevron labels switch to white text where a shade is too dark
// for black to read (see SymbolRenderer's chevron contrast check).
const THEME_SOURCES: { name: string; colours: string[] }[] = [
  // Amber
  { name: "Sunrise",  colours: ["#fffbeb", "#fef3c7", "#fde68a", "#fcd34d", "#fbbf24", "#f59e0b", "#d97706", "#b45309", "#92400e"] },
  // Sky / blue
  { name: "Ocean",    colours: ["#f0f9ff", "#e0f2fe", "#bae6fd", "#7dd3fc", "#38bdf8", "#0ea5e9", "#0284c7", "#0369a1", "#075985"] },
  // Green
  { name: "Garden",   colours: ["#f0fdf4", "#dcfce7", "#bbf7d0", "#86efac", "#4ade80", "#22c55e", "#16a34a", "#15803d", "#166534"] },
  // Fuchsia / berry
  { name: "Berry",    colours: ["#fdf4ff", "#fae8ff", "#f5d0fe", "#f0abfc", "#e879f9", "#d946ef", "#c026d3", "#a21caf", "#86198f"] },
  // Warm tan → brown
  { name: "Earth",    colours: ["#faf4ea", "#f0e2c8", "#e1c79c", "#cda870", "#b58a4c", "#966c34", "#745222", "#533a17", "#3a280f"] },
  // Orange
  { name: "Autumn",   colours: ["#fff7ed", "#ffedd5", "#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c", "#c2410c", "#9a3412"] },
  // Indigo
  { name: "Twilight", colours: ["#eef2ff", "#e0e7ff", "#c7d2fe", "#a5b4fc", "#818cf8", "#6366f1", "#4f46e5", "#4338ca", "#3730a3"] },
  // Rose
  { name: "Coral",    colours: ["#fff1f2", "#ffe4e6", "#fecdd3", "#fda4af", "#fb7185", "#f43f5e", "#e11d48", "#be123c", "#9f1239"] },
  // Emerald
  { name: "Mint",     colours: ["#ecfdf5", "#d1fae5", "#a7f3d0", "#6ee7b7", "#34d399", "#10b981", "#059669", "#047857", "#065f46"] },
  // Slate
  { name: "Slate",    colours: ["#f8fafc", "#f1f5f9", "#e2e8f0", "#cbd5e1", "#94a3b8", "#64748b", "#475569", "#334155", "#1e293b"] },
];

const SHADE_COUNT = 12;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const ch = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}

// Treat `source` as evenly-spaced control points on [0,1] and resample
// `count` colours linearly across the same range, so the 1st and last
// shades match the source endpoints and the rest are interpolated between.
function redistribute(source: string[], count: number): string[] {
  const pts = source.map(hexToRgb);
  const n = pts.length;
  if (n === 0) return [];
  if (n === 1) return Array.from({ length: count }, () => rgbToHex(pts[0][0], pts[0][1], pts[0][2]));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const pos = (i / (count - 1)) * (n - 1); // 0 .. n-1
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, n - 1);
    const f = pos - lo;
    const a = pts[lo];
    const b = pts[hi];
    out.push(rgbToHex(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f));
  }
  return out;
}

// Returns "#ffffff" or "#1f2937" — whichever reads better on `hex`. Used by
// the chevron renderer so dark theme shades get white labels. Uses the
// WCAG relative-luminance threshold (~0.5 on the perceptual curve).
export function readableTextOn(hex: string): string {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 0.42 ? "#ffffff" : "#1f2937";
}

export const CHEVRON_THEMES: readonly ChevronTheme[] = THEME_SOURCES.map((t) => ({
  name: t.name,
  colours: redistribute(t.colours, SHADE_COUNT),
}));

/**
 * Order chevrons (Processes / Collapsed Processes) for theming in READING
 * order: top row left→right, then down to the next row, left→right, and so
 * on — "top-left, then down and to the right". Buckets elements into rows by
 * vertical-centre proximity (within ~60% of the element height), so a Value
 * Chain split across two rows is themed as ONE continuous ramp regardless of
 * how the processes are split apart or combined.
 */
export function chevronReadingOrder<T extends { x: number; y: number; height: number }>(
  chevrons: T[],
): T[] {
  const sorted = [...chevrons].sort((a, b) => (a.y + a.height / 2) - (b.y + b.height / 2));
  const rows: { cy: number; items: T[] }[] = [];
  for (const c of sorted) {
    const cy = c.y + c.height / 2;
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.cy - cy) <= c.height * 0.6) {
      last.items.push(c);
    } else {
      rows.push({ cy, items: [c] });
    }
  }
  return rows.flatMap((r) => r.items.sort((a, b) => a.x - b.x));
}
