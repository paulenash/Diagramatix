/**
 * Per-diagram-type visual identity: a 2-character code, a label, and a
 * pastel colour pair (background + text). Used by the nav-tree badge, the
 * editor top bar, and the diagram-type chips shown across the app.
 *
 * The defaults below are the single source of truth and render
 * synchronously (no fetch needed for first paint). A SuperAdmin can
 * override the code / colours per type via /dashboard/admin/diagram-types,
 * persisted in the DiagramTypeStyle table; those overrides are layered on
 * top of these defaults at runtime (see useDiagramTypeStyles + the server
 * getDiagramTypeStyleMap helper).
 *
 * Colour rule (Paul, 2026-06): contrasting pastels per type, and NEVER
 * purple or yellow — those are reserved for the sharing / publish colour
 * codes elsewhere in the app.
 */

export interface DiagramTypeStyle {
  /** Internal diagram-type key (matches DiagramType). */
  typeKey: string;
  /** Human-readable label, e.g. "Process Context". */
  label: string;
  /** 2-character badge code, e.g. "PC". */
  code: string;
  /** Pastel background colour (hex). */
  bgColor: string;
  /** Readable text/foreground colour (hex). */
  textColor: string;
  /** Display order in the admin editor + pickers. */
  sortOrder: number;
}

/**
 * The eight editable diagram types, in the default sort order
 * (CO, VC, PC, AM, BP, FC, SM, DM). The DB `DiagramTypeStyle.sortOrder` (set
 * via the Diagram Type Sort Order admin tile) overrides this at runtime.
 * `basic` is a legacy alias for `context` and is resolved to the context style
 * — it is deliberately NOT a separately-editable row.
 */
export const DEFAULT_DIAGRAM_TYPE_STYLES: DiagramTypeStyle[] = [
  { typeKey: "context",         label: "Context",            code: "CO", bgColor: "#ccfbf1", textColor: "#093e3a", sortOrder: 0 },
  { typeKey: "value-chain",     label: "Value Chain",        code: "VC", bgColor: "#ffedd5", textColor: "#c2410c", sortOrder: 1 },
  { typeKey: "process-context", label: "Process Context",    code: "PC", bgColor: "#e1feea", textColor: "#748b04", sortOrder: 2 },
  { typeKey: "archimate",       label: "Archimate",          code: "AM", bgColor: "#fce7f3", textColor: "#be185c", sortOrder: 3 },
  { typeKey: "bpmn",            label: "BPMN",               code: "BP", bgColor: "#dcfefc", textColor: "#19a455", sortOrder: 4 },
  { typeKey: "flowchart",       label: "Standard Flowchart", code: "FC", bgColor: "#f3f4f6", textColor: "#333333", sortOrder: 5 },
  { typeKey: "state-machine",   label: "State Machine",      code: "SM", bgColor: "#efe6e7", textColor: "#bf6612", sortOrder: 6 },
  { typeKey: "domain",          label: "Domain",             code: "DM", bgColor: "#d1fae5", textColor: "#047857", sortOrder: 7 },
];

/** Canonical editable keys (excludes the `basic` alias). */
export const EDITABLE_DIAGRAM_TYPE_KEYS = DEFAULT_DIAGRAM_TYPE_STYLES.map((s) => s.typeKey);

/** Every key the app may persist on a diagram (includes the alias). */
export const ALL_DIAGRAM_TYPE_KEYS = [...EDITABLE_DIAGRAM_TYPE_KEYS, "basic"];

const DEFAULTS_BY_KEY: Record<string, DiagramTypeStyle> = Object.fromEntries(
  DEFAULT_DIAGRAM_TYPE_STYLES.map((s) => [s.typeKey, s]),
);

/** Neutral fallback for any unrecognised type key. */
function neutralStyle(typeKey: string): DiagramTypeStyle {
  return {
    typeKey,
    label: typeKey,
    code: (typeKey.replace(/[^a-z]/gi, "").slice(0, 2) || "??").toUpperCase(),
    bgColor: "#f1f5f9", // slate-100
    textColor: "#475569", // slate-600
    sortOrder: 99,
  };
}

/** Map an alias to its canonical key (`basic` -> `context`). */
export function canonicalDiagramTypeKey(typeKey: string): string {
  return typeKey === "basic" ? "context" : typeKey;
}

export type DiagramTypeStyleOverrides = Record<
  string,
  Partial<Pick<DiagramTypeStyle, "code" | "bgColor" | "textColor" | "sortOrder">>
>;

/**
 * Resolve the effective style for a diagram type, layering an optional
 * override map (from the DiagramTypeStyle table) over the static defaults.
 * Always returns a usable style — unknown keys get a neutral slate badge.
 */
export function resolveDiagramTypeStyle(
  typeKey: string | null | undefined,
  overrides?: DiagramTypeStyleOverrides,
): DiagramTypeStyle {
  const key = canonicalDiagramTypeKey(typeKey ?? "");
  const base = DEFAULTS_BY_KEY[key] ?? neutralStyle(key);
  const ov = overrides?.[key];
  if (!ov) return base;
  return {
    ...base,
    code: ov.code ?? base.code,
    bgColor: ov.bgColor ?? base.bgColor,
    textColor: ov.textColor ?? base.textColor,
    sortOrder: ov.sortOrder ?? base.sortOrder,
  };
}

/** Convenience: just the label for a type key. */
export function diagramTypeLabel(typeKey: string | null | undefined, overrides?: DiagramTypeStyleOverrides): string {
  return resolveDiagramTypeStyle(typeKey, overrides).label;
}

/**
 * Blend a hex colour toward white by `ratio` (0..1). Used to derive the
 * "lighter shade" tint for the editor top panel from a type's bgColor.
 */
export function lightenHex(hex: string, ratio: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  const mix = (c: number) => Math.round(c + (255 - c) * Math.max(0, Math.min(1, ratio)));
  const to2 = (v: number) => v.toString(16).padStart(2, "0");
  return `#${to2(mix(r))}${to2(mix(g))}${to2(mix(b))}`;
}

/** Basic hex validation for the admin editor / API. */
export function isHexColor(s: unknown): s is string {
  return typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s.trim());
}
