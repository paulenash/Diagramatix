export interface ChevronTheme {
  name: string;
  colours: readonly string[];
}

// Source palettes (light → dark). Per Paul's update: the darker tail
// (shades 8–10) reads too heavy in a value chain, so only the first
// SOURCE_CAP (7) shades are used, and that lighter range is REDISTRIBUTED
// across SHADE_COUNT (12) evenly-spaced shades. Edit a source palette here;
// the published 12-shade themes regenerate automatically below.
const THEME_SOURCES: { name: string; colours: string[] }[] = [
  { name: "Sunrise",  colours: ["#fef3c7", "#fde68a", "#fdba74", "#fca5a5", "#f9a8d4", "#d8b4fe", "#a5b4fc", "#93c5fd", "#67e8f9", "#99f6e4"] },
  { name: "Ocean",    colours: ["#cffafe", "#a5f3fc", "#7dd3fc", "#93c5fd", "#a5b4fc", "#c4b5fd", "#d8b4fe", "#f0abfc", "#fda4af", "#fecaca"] },
  { name: "Garden",   colours: ["#d9f99d", "#bef264", "#a3e635", "#86efac", "#6ee7b7", "#5eead4", "#67e8f9", "#7dd3fc", "#a5b4fc", "#c4b5fd"] },
  { name: "Berry",    colours: ["#fce7f3", "#fbcfe8", "#f9a8d4", "#f0abfc", "#d8b4fe", "#c4b5fd", "#a5b4fc", "#93c5fd", "#7dd3fc", "#67e8f9"] },
  { name: "Earth",    colours: ["#fef9c3", "#fde68a", "#fcd34d", "#fdba74", "#fed7aa", "#fecaca", "#e5e7eb", "#d1d5db", "#a8a29e", "#d6d3d1"] },
  { name: "Autumn",   colours: ["#fef3c7", "#fde68a", "#fcd34d", "#fbbf24", "#f59e0b", "#d97706", "#b45309", "#92400e", "#7c2d12", "#451a03"] },
  { name: "Twilight", colours: ["#e0e7ff", "#c7d2fe", "#a5b4fc", "#818cf8", "#6366f1", "#4f46e5", "#4338ca", "#3730a3", "#312e81", "#1e1b4b"] },
  { name: "Coral",    colours: ["#fff1f2", "#ffe4e6", "#fecdd3", "#fda4af", "#fb7185", "#f43f5e", "#e11d48", "#be123c", "#9f1239", "#881337"] },
  { name: "Mint",     colours: ["#ecfdf5", "#d1fae5", "#a7f3d0", "#6ee7b7", "#34d399", "#10b981", "#059669", "#047857", "#065f46", "#064e3b"] },
  { name: "Slate",    colours: ["#f8fafc", "#f1f5f9", "#e2e8f0", "#cbd5e1", "#94a3b8", "#64748b", "#475569", "#334155", "#1e293b", "#0f172a"] },
];

// Use shades 1..SOURCE_CAP only (cap out the too-dark tail), then resample
// that range to SHADE_COUNT evenly-spaced shades.
const SOURCE_CAP = 7;
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

export const CHEVRON_THEMES: readonly ChevronTheme[] = THEME_SOURCES.map((t) => ({
  name: t.name,
  colours: redistribute(t.colours.slice(0, SOURCE_CAP), SHADE_COUNT),
}));
