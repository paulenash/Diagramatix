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
  "pool":                "#d4a382",   // pool sidebar colour — slightly lighter than the historical #c8956a, still clearly darker than lane (#e8c4a0)
  "lane":                "#e8c4a0",   // lane sidebar colour
  "sublane":             "#faf0e6",   // sublane sidebar colour (visibly lighter than lane #e8c4a0)
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
  "system-boundary":     "#dbeafe",   // header colour
  "system-boundary-body": "#dbeafe",  // body fill colour (rendered with opacity)
  // State Machine
  "state":               "#dbeafe",
  "initial-state":       "#374151",   // disc colour
  "history-state":       "#374151",   // H glyph / border colour
  "deep-history-state":  "#374151",
  "final-state":         "#374151",   // inner disc colour
  "composite-state":     "#ede9fe",   // header colour
  "composite-state-body": "#ede9fe",  // body fill colour (rendered with opacity)
  "submachine":            "#bfdbfe",   // slightly darker blue than state (#dbeafe)
  "fork-join":           "#1f2937",   // dark grey bar
  // Context Diagram
  "external-entity":     "#bfdbfe",   // light blue
  "process-system":      "#e9d5ff",   // light purple
  // Value Chain Diagram
  "chevron":             "#fbd7bb",   // warm peach (AccentColor5 60% tint) — value chain process
  "chevron-collapsed":   "#fbd7bb",   // same as process
  "process-group":       "#fcebdd",   // lighter peach (AccentColor5 80% tint) — value chain container
  // Domain Diagram
  "uml-class":           "#fed7aa",   // light orange
  "uml-enumeration":     "#bbf7d0",   // light green
  "uml-package":         "#fef9c3",   // light yellow — container tint
  "uml-note":            "#fef3c7",   // note yellow
  "uml-pain-point":      "#fecaca",   // light red — problem marker
  "uml-issue":           "#15803d",   // dark green — issue marker (Pain Point twin)
  // ArchiMate — actual fill comes from the catalogue + category theme
  // at render time; this is only a fallback when rendering outside the
  // canvas (e.g. a minimap thumbnail).
  "archimate-shape":     "#ffffff",
  // Review (Phase 3) — pink note accent / link colour.
  "review-comment":      "#ec4899",
  // Standard Flowchart — strictly monochrome (white fill, black stroke).
  "flowchart-terminator": "#ffffff", "flowchart-process": "#ffffff", "flowchart-decision": "#ffffff",
  "flowchart-io": "#ffffff", "flowchart-document": "#ffffff", "flowchart-multidoc": "#ffffff",
  "flowchart-predefined": "#ffffff", "flowchart-preparation": "#ffffff", "flowchart-manual-input": "#ffffff",
  "flowchart-manual-op": "#ffffff", "flowchart-display": "#ffffff", "flowchart-delay": "#ffffff",
  "flowchart-database": "#ffffff", "flowchart-onpage": "#ffffff", "flowchart-offpage": "#ffffff",
  "flowchart-merge": "#ffffff", "flowchart-parallel": "#ffffff", "flowchart-comment": "#ffffff",
  "flowchart-vswimlane": "#ffffff",
  // EPC — the conventional ARIS palette. These colours ARE the notation: a
  // reader identifies an event or a function by its colour before reading a
  // word of it, so they are defaults worth matching rather than house style.
  "epc-event":       "#ffd6e7",  // pink   — passive: something has come about
  "epc-function":    "#c5e17a",  // green  — active: work being done
  "epc-xor":         "#ffffff",  // the three connectors stay white; a coloured
  "epc-and":         "#ffffff",  // one reads as a state rather than a junction
  "epc-or":          "#ffffff",
  "epc-org-unit":    "#ffe699",  // yellow — who is responsible
  "epc-position":    "#ffe699",
  "epc-data":        "#cce5ff",  // blue   — information
  "epc-application": "#e5ccff",  // purple — systems
  "epc-interface":   "#e5e5e5",  // grey   — a link out to another chain
  // The wider ARIS set. Deliberately MUTED next to the core notation: these
  // annotate a function, they do not carry the process, and a diagram where
  // they shout as loudly as the events is a diagram you cannot read.
  "epc-kpi":           "#dbeafe",  // pale blue   — a measure
  "epc-risk":          "#fecaca",  // pale red    — the only warm one; a risk should catch the eye
  "epc-product":       "#d9f2e6",  // pale green  — what comes out
  "epc-knowledge":     "#ede9fe",  // pale violet — what you must know
  "epc-business-rule": "#fef3c7",  // pale amber  — a policy
  "epc-screen":        "#e0f2fe",  // pale cyan   — a front end
  "epc-objective":     "#fae8ff",  // pale fuchsia— the goal it serves
  "epc-machine":       "#e5e7eb",  // pale grey   — equipment
  "epc-location":      "#dcfce7",  // pale mint   — where
  "epc-requirement":   "#ffe4e6",  // pale rose   — what it must satisfy
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
  "sublane":             "#ffffff",
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
  "system-boundary-body": "#ffffff",
  // State Machine
  "state":               "#ffffff",
  "initial-state":       "#000000",
  "history-state":       "#000000",
  "deep-history-state":  "#000000",
  "final-state":         "#000000",
  "composite-state":     "#ffffff",
  "composite-state-body": "#ffffff",
  "submachine":            "#ffffff",
  "fork-join":           "#000000",
  // Context Diagram
  "external-entity":     "#ffffff",
  "process-system":      "#ffffff",
  // Domain Diagram
  "chevron":             "#ffffff",
  "chevron-collapsed":   "#ffffff",
  "process-group":       "#ffffff",
  "uml-class":           "#ffffff",
  "uml-enumeration":     "#ffffff",
  "uml-package":         "#ffffff",
  "uml-note":            "#ffffff",
  "uml-pain-point":      "#ffffff",
  "uml-issue":           "#ffffff",
  "archimate-shape":     "#ffffff",
  "review-comment":      "#000000",
  "flowchart-terminator": "#ffffff", "flowchart-process": "#ffffff", "flowchart-decision": "#ffffff",
  "flowchart-io": "#ffffff", "flowchart-document": "#ffffff", "flowchart-multidoc": "#ffffff",
  "flowchart-predefined": "#ffffff", "flowchart-preparation": "#ffffff", "flowchart-manual-input": "#ffffff",
  "flowchart-manual-op": "#ffffff", "flowchart-display": "#ffffff", "flowchart-delay": "#ffffff",
  "flowchart-database": "#ffffff", "flowchart-onpage": "#ffffff", "flowchart-offpage": "#ffffff",
  "flowchart-merge": "#ffffff", "flowchart-parallel": "#ffffff", "flowchart-comment": "#ffffff",
  "flowchart-vswimlane": "#ffffff",
  // EPC in black and white. The shapes still distinguish an event from a
  // function — a hexagon from a rounded rectangle — which is why the notation
  // survives being printed on a mono office printer.
  "epc-event": "#ffffff", "epc-function": "#ffffff",
  "epc-xor": "#ffffff", "epc-and": "#ffffff", "epc-or": "#ffffff",
  "epc-org-unit": "#ffffff", "epc-position": "#ffffff",
  "epc-data": "#ffffff", "epc-application": "#ffffff", "epc-interface": "#ffffff",
  "epc-kpi": "#ffffff", "epc-risk": "#ffffff", "epc-product": "#ffffff",
  "epc-knowledge": "#ffffff", "epc-business-rule": "#ffffff", "epc-screen": "#ffffff",
  "epc-objective": "#ffffff", "epc-machine": "#ffffff", "epc-location": "#ffffff",
  "epc-requirement": "#ffffff",
};

/** Return the effective colour for a symbol type, preferring the project config over defaults. */
export function resolveColor(type: SymbolType, config?: SymbolColorConfig): string {
  return config?.[type] ?? DEFAULT_SYMBOL_COLORS[type] ?? "#e5e7eb";
}
