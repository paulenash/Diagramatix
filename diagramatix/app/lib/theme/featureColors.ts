/**
 * Feature Colours — the app-wide palette that gives each product / role area its
 * own distinctive colour (dashboard menu options, SuperAdmin & OrgAdmin tiles, AI
 * Generation controls, the Entity-Drift ring). Each feature stores just a
 * Background + Text colour; the Highlight (hover / selected) is DERIVED by
 * darkening the background a global percentage. SuperAdmin can override any value
 * (persisted in AppSetting["feature.colors"]); reads always return a full, valid,
 * defaulted scheme.
 *
 * Colours are runtime hex (user-configurable) so surfaces render via inline
 * styles / CSS variables — Tailwind can't compile classes from dynamic values.
 */

export type FeatureColorKey =
  | "simulator" | "mining" | "riskControl" | "apqc" | "portal"
  | "ai" | "entityLists" | "superAdmin" | "orgAdmin";

export interface FeatureColor { bg: string; text: string }

export interface FeatureColorScheme {
  highlightPct: number;                       // 0–40, background darken % for hover/selected
  colors: Record<FeatureColorKey, FeatureColor>;
}

/** Ordered metadata for the admin editor (label + which group it sits in). */
export const FEATURE_META: { key: FeatureColorKey; label: string; group: "product" | "accent" | "role"; note: string }[] = [
  { key: "simulator",   label: "Simulator",           group: "product", note: "Simulator Examples (menu + tile), Simulator admin" },
  { key: "mining",      label: "Process Mining",      group: "product", note: "Mining Examples, DiagramatixMINER admin" },
  { key: "riskControl", label: "Risk & Control",      group: "product", note: "Risk & Control Examples, RCM / GRC admin" },
  { key: "apqc",        label: "APQC PCF",            group: "product", note: "APQC tiles, Create APQC Process" },
  { key: "portal",      label: "Portal / Publishing", group: "product", note: "Process Portal & publishing surfaces" },
  { key: "ai",          label: "AI Generation",       group: "accent",  note: "Toolbar AI Generate + every AI-generation trigger" },
  { key: "entityLists", label: "Entity Lists / Drift", group: "accent", note: "Entity Lists admin + the Entity-Drift ring" },
  { key: "superAdmin",  label: "SuperAdmin (fallback)", group: "role",  note: "Fallback for unmapped SuperAdmin Tools tiles" },
  { key: "orgAdmin",    label: "OrgAdmin (fallback)",  group: "role",   note: "Fallback for unmapped OrgAdmin tiles" },
];

export const FEATURE_KEYS: FeatureColorKey[] = FEATURE_META.map((m) => m.key);
export const FEATURE_LABELS: Record<FeatureColorKey, string> =
  Object.fromEntries(FEATURE_META.map((m) => [m.key, m.label])) as Record<FeatureColorKey, string>;

export const DEFAULT_HIGHLIGHT_PCT = 8;

export const DEFAULT_FEATURE_COLORS: Record<FeatureColorKey, FeatureColor> = {
  simulator:   { bg: "#f0fdfa", text: "#0f766e" }, // teal
  mining:      { bg: "#fffbeb", text: "#92400e" }, // amber
  riskControl: { bg: "#f0f9ff", text: "#075985" }, // sky
  apqc:        { bg: "#eef2ff", text: "#4338ca" }, // indigo
  portal:      { bg: "#eff6ff", text: "#1d4ed8" }, // blue
  ai:          { bg: "#f5f3ff", text: "#6d28d9" }, // violet
  entityLists: { bg: "#fff1f2", text: "#be123c" }, // rose
  superAdmin:  { bg: "#fef2f2", text: "#b91c1c" }, // red
  orgAdmin:    { bg: "#fff7ed", text: "#c2410c" }, // orange
};

export const DEFAULT_FEATURE_SCHEME: FeatureColorScheme = {
  highlightPct: DEFAULT_HIGHLIGHT_PCT,
  colors: DEFAULT_FEATURE_COLORS,
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export const isHex = (s: unknown): s is string => typeof s === "string" && HEX_RE.test(s);

/** Darken a #rrggbb by `pct` percent (0 = unchanged, 100 = black). */
export function shade(hex: string, pct: number): string {
  if (!isHex(hex)) return hex;
  const f = Math.max(0, Math.min(100, pct)) / 100;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 0xff) * (1 - f));
  const g = Math.round(((n >> 8) & 0xff) * (1 - f));
  const b = Math.round((n & 0xff) * (1 - f));
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** The highlight (hover / selected) tone for a background at a given darken %. */
export const highlightOf = (bg: string, pct: number): string => shade(bg, pct);

/** Normalise arbitrary input into a full, valid scheme (defaults fill any gap). */
export function resolveFeatureScheme(input: unknown): FeatureColorScheme {
  const src = (input && typeof input === "object") ? input as Record<string, unknown> : {};
  const rawColors = (src.colors && typeof src.colors === "object") ? src.colors as Record<string, unknown> : {};
  const colors = {} as Record<FeatureColorKey, FeatureColor>;
  for (const key of FEATURE_KEYS) {
    const d = DEFAULT_FEATURE_COLORS[key];
    const c = (rawColors[key] && typeof rawColors[key] === "object") ? rawColors[key] as Record<string, unknown> : {};
    colors[key] = { bg: isHex(c.bg) ? c.bg : d.bg, text: isHex(c.text) ? c.text : d.text };
  }
  const pctRaw = typeof src.highlightPct === "number" ? src.highlightPct : DEFAULT_HIGHLIGHT_PCT;
  const highlightPct = Math.max(0, Math.min(40, Math.round(pctRaw)));
  return { highlightPct, colors };
}

/** The three resolved tones for one feature. */
export function tonesFor(scheme: FeatureColorScheme, key: FeatureColorKey): { bg: string; text: string; hi: string } {
  const fc = scheme.colors[key] ?? DEFAULT_FEATURE_COLORS[key];
  return { bg: fc.bg, text: fc.text, hi: highlightOf(fc.bg, scheme.highlightPct) };
}

/**
 * CSS custom properties for a feature, to spread into an inline `style`. Pair with
 * the `.feature-tile` class (globals.css) so hover swaps bg → highlight with no JS.
 */
export function featureVars(scheme: FeatureColorScheme, key: FeatureColorKey): Record<string, string> {
  const { bg, text, hi } = tonesFor(scheme, key);
  return { "--fb": bg, "--ft": text, "--fh": hi };
}
