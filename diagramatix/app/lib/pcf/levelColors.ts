/**
 * APQC PCF level colour scheme. APQC colour-codes the five PCF levels
 * (Category · Process Group · Process · Activity · Task). Each level is a
 * two-tone pair derived from ONE editable input:
 *   • main   — the level's main (dark) colour
 *   • lightPct — how far to lighten the main toward white for the light tone
 *
 * Text-contrast rule (per product spec): white text on the dark main-colour
 * background; the main colour itself as text on the light-shade background.
 *
 * These are the built-in defaults; a SuperAdmin refines them in "APQC PCF
 * Hierarchy Colour Maintenance" and the chosen scheme is persisted as a single
 * global setting. All rendering derives from the (level → main, lightPct) map
 * so an edit re-colours every hierarchy view without re-importing.
 */

export interface PcfLevelColor {
  level: number;      // 1..5
  name: string;       // display name of the level
  main: string;       // "#RRGGBB" — the dark/main tone
  lightPct: number;   // 0..100 — % lightened toward white for the light tone
}

/** The five named PCF levels, in order. */
export const PCF_LEVEL_NAMES: Record<number, string> = {
  1: "Category",
  2: "Process Group",
  3: "Process",
  4: "Activity",
  5: "Task",
};

/** Built-in default scheme — APQC's per-level hues. SuperAdmin-overridable.
 *  Maroon · Green · Brown · Burnt Orange · Dark Blue (the dark "main" tone;
 *  the light tone is each lightened toward white by lightPct). */
export const DEFAULT_PCF_LEVEL_COLORS: PcfLevelColor[] = [
  { level: 1, name: "Category",      main: "#c51111", lightPct: 90 }, // Maroon
  { level: 2, name: "Process Group", main: "#19a422", lightPct: 90 }, // Green
  { level: 3, name: "Process",       main: "#816928", lightPct: 90 }, // Brown
  { level: 4, name: "Activity",      main: "#de6a17", lightPct: 90 }, // Burnt Orange
  { level: 5, name: "Task",          main: "#1f26e5", lightPct: 90 }, // Dark Blue
];

/** PCF level (1..5) from a dotted hierarchy code: "1.0"→1 (Category), "1.1"→2,
 *  "1.1.1"→3, deeper by segment count. Returns 0 for a non-PCF/blank code. */
export function pcfLevelFromCode(code: string | null | undefined): number {
  const c = (code ?? "").trim();
  if (!/^\d+(?:\.\d+)*$/.test(c)) return 0;
  if (/^\d+\.0$/.test(c)) return 1;
  return c.split(".").length;
}

const HEX_RE = /^#?([0-9a-fA-F]{6})$/;

/** Normalise a hex string to "#rrggbb" (lowercase), or null if invalid. */
export function normalizeHex(hex: string | null | undefined): string | null {
  const m = HEX_RE.exec((hex ?? "").trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}

function toRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex) ?? "#000000";
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

/** Lighten a hex colour toward white by `pct`% (0 = unchanged, 100 = white). */
export function lightenHex(hex: string, pct: number): string {
  const p = Math.max(0, Math.min(100, pct)) / 100;
  const [r, g, b] = toRgb(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * p);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export interface PcfLevelStyle {
  main: string;        // dark background colour
  light: string;       // light background colour (derived)
  textOnMain: string;  // text colour over the main (dark) background
  textOnLight: string; // text colour over the light background
}

/** Resolve the two-tone style for a level from a colour scheme. Levels beyond
 *  the table (deep PCF nodes) fall back to the deepest defined level. */
export function pcfLevelStyle(level: number, scheme: PcfLevelColor[] = DEFAULT_PCF_LEVEL_COLORS): PcfLevelStyle {
  const ordered = [...scheme].sort((a, b) => a.level - b.level);
  const entry = ordered.find((c) => c.level === level) ?? ordered[ordered.length - 1] ?? DEFAULT_PCF_LEVEL_COLORS[0];
  const main = normalizeHex(entry.main) ?? "#00426f";
  const light = lightenHex(main, entry.lightPct);
  return { main, light, textOnMain: "#ffffff", textOnLight: main };
}

/** Merge a (possibly partial / stored) scheme over the defaults so every level
 *  1..5 is always present and valid. Ignores malformed hex. */
export function normalizeScheme(input: unknown): PcfLevelColor[] {
  const byLevel = new Map<number, PcfLevelColor>(DEFAULT_PCF_LEVEL_COLORS.map((c) => [c.level, { ...c }]));
  if (Array.isArray(input)) {
    for (const raw of input) {
      const level = Number((raw as PcfLevelColor)?.level);
      if (!byLevel.has(level)) continue;
      const cur = byLevel.get(level)!;
      const main = normalizeHex((raw as PcfLevelColor)?.main);
      const lp = Number((raw as PcfLevelColor)?.lightPct);
      byLevel.set(level, {
        level,
        name: PCF_LEVEL_NAMES[level] ?? cur.name,
        main: main ?? cur.main,
        lightPct: Number.isFinite(lp) ? Math.max(0, Math.min(100, lp)) : cur.lightPct,
      });
    }
  }
  return [...byLevel.values()].sort((a, b) => a.level - b.level);
}
