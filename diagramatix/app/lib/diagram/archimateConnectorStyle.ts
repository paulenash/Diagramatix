/**
 * Pure style resolution for ArchiMate relationship connectors.
 *
 * Extracted from ArchimateConnectorRenderer.tsx so the per-type visual rules
 * (line dash + start/end marker) are testable without React. The renderer
 * imports `styleFor` from here and renders exactly what this returns — no
 * behavioural change versus the previous inline switch.
 *
 * Each of the 11 ArchiMate relationship types maps to a DISTINCT visual per the
 * ArchiMate 3.x notation:
 *   composition    — solid line, filled diamond at the whole end
 *   aggregation    — solid line, open diamond at the whole end
 *   assignment     — solid line, filled ball at source + filled arrow at target
 *   realisation    — dotted line, hollow (open) triangle at target
 *   serving        — solid line, open arrowhead
 *   access         — dotted line, open arrowhead
 *   influence      — dashed line, open arrowhead          (dashed ≠ access's dotted)
 *   association    — solid line, no markers
 *   triggering     — dashed line, filled arrowhead
 *   flow           — dash-dot line, open arrowhead
 *   specialisation — solid line, hollow (open) triangle at target
 */
import type { ArchimateConnectorType } from "./types";

export type ArchimateMarkerKind =
  | "arrow-filled"
  | "arrow-open"
  | "triangle-open"
  | "diamond-filled"
  | "diamond-open"
  | "circle-filled";

export interface ArchimateStyle {
  dash?: string;
  strokeColor: string;
  startMarker: ArchimateMarkerKind | null;
  endMarker: ArchimateMarkerKind | null;
  strokeWidth: number;
  label?: string; // small overlay label (future use)
}

export function styleFor(type: ArchimateConnectorType, selected: boolean): ArchimateStyle {
  const color = selected ? "#2563eb" : "#333333";
  const base: ArchimateStyle = {
    strokeColor: color,
    startMarker: null,
    endMarker: null,
    strokeWidth: selected ? 1.8 : 1.4,
  };
  switch (type) {
    // Structural — diamond sits at the target (whole) end
    case "archi-composition":
      return { ...base, startMarker: null, endMarker: "diamond-filled" };
    case "archi-aggregation":
      return { ...base, startMarker: null, endMarker: "diamond-open" };
    case "archi-assignment":
      return { ...base, startMarker: "circle-filled", endMarker: "arrow-filled" };
    case "archi-realisation":
      return { ...base, endMarker: "triangle-open", dash: "5 3" };
    // Dependency
    case "archi-serving":
      return { ...base, endMarker: "arrow-open" };
    case "archi-access":
      // Access — dotted line + open arrowhead.
      return { ...base, endMarker: "arrow-open", dash: "2 3" };
    case "archi-influence":
      // Influence — DASHED line + open arrowhead. Distinct from access's
      // dotted line (the two previously collapsed to the same rendering).
      return { ...base, endMarker: "arrow-open", dash: "6 3" };
    case "archi-association":
      return { ...base, endMarker: null };
    // Dynamic
    case "archi-triggering":
      return { ...base, endMarker: "arrow-filled", dash: "6 3" };
    case "archi-flow":
      return { ...base, endMarker: "arrow-open", dash: "8 3 2 3" };
    // Other
    case "archi-specialisation":
      return { ...base, endMarker: "triangle-open" };
  }
}
