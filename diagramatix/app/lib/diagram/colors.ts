import type { SymbolType } from "./types";

export type SymbolColorConfig = Partial<Record<SymbolType, string>>;

/** Default fill/characteristic colours for every symbol type, matching the hardcoded
 *  values in SymbolRenderer.tsx.  New projects always start with these colours. */
export const DEFAULT_SYMBOL_COLORS: Record<SymbolType, string> = {
  // BPMN
  "task":                "#fef9c3",
  "gateway":             "#f3e8ff",
  "start-event":         "#dcfce7",
  "intermediate-event":  "#fed7aa",
  "end-event":           "#fca5a5",
  "subprocess":          "#fef08a",
  "subprocess-expanded": "#fef4a7",
  "pool":                "#c8956a",   // pool sidebar colour
  "lane":                "#e8c4a0",   // lane sidebar colour
  "data-object":         "#bfdbfe",
  "data-store":          "#60a5fa",
  "group":               "#374151",   // boundary line colour
  "text-annotation":     "#374151",   // bracket line colour
  // Process Context
  "use-case":            "#fef9c3",
  "actor":               "#374151",   // stroke/line colour for stick figure
  "team":                "#374151",
  "system":              "#f8fafc",
  "hourglass":           "#ffffff",
  "system-boundary":     "#dbeafe",   // header colour; body is a transparent tint
  // State Machine
  "state":               "#dbeafe",
  "initial-state":       "#374151",   // disc colour
  "final-state":         "#374151",   // inner disc colour
  "composite-state":     "#ede9fe",   // header colour; body is a transparent tint
};

/** Black & white colour scheme: fills → white, lines/strokes → black. */
export const BW_SYMBOL_COLORS: Record<SymbolType, string> = {
  // BPMN
  "task":                "#ffffff",
  "gateway":             "#ffffff",
  "start-event":         "#ffffff",
  "intermediate-event":  "#ffffff",
  "end-event":           "#ffffff",
  "subprocess":          "#ffffff",
  "subprocess-expanded": "#ffffff",
  "pool":                "#ffffff",
  "lane":                "#ffffff",
  "data-object":         "#ffffff",
  "data-store":          "#ffffff",
  "group":               "#000000",
  "text-annotation":     "#000000",
  // Process Context
  "use-case":            "#ffffff",
  "actor":               "#000000",
  "team":                "#000000",
  "system":              "#ffffff",
  "hourglass":           "#ffffff",
  "system-boundary":     "#ffffff",
  // State Machine
  "state":               "#ffffff",
  "initial-state":       "#000000",
  "final-state":         "#000000",
  "composite-state":     "#ffffff",
};

/** Return the effective colour for a symbol type, preferring the project config over defaults. */
export function resolveColor(type: SymbolType, config?: SymbolColorConfig): string {
  return config?.[type] ?? DEFAULT_SYMBOL_COLORS[type] ?? "#e5e7eb";
}
