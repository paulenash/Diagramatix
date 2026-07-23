/**
 * Pure style resolution for ArchiMate relationship connectors.
 *
 * Extracted from ArchimateConnectorRenderer.tsx so the per-type visual rules
 * (line dash + start/end marker) are testable without React. The renderer
 * imports `styleFor` from here and renders exactly what this returns — no
 * behavioural change versus the previous inline switch.
 *
 * Each of the 11 ArchiMate relationship types maps to a DISTINCT visual per the
 * authoritative ArchiMate 3.x notation (source-end / line / target-end):
 *   composition    — filled diamond at SOURCE,  solid line, no target head
 *   aggregation    — open  diamond at SOURCE,  solid line, no target head
 *   assignment     — filled ball  at SOURCE,  solid line, filled arrow at target
 *   serving        —                           solid line, open  arrow  at target
 *   access         —                           dotted line, open  arrow  at target
 *   influence      —                           dashed line, open  arrow  at target
 *   triggering     —                           solid line, filled arrow at target
 *   flow           —                           dashed line, filled arrow at target
 *   specialisation —                           solid line, hollow triangle at target
 *   realisation    —                           dotted line, hollow triangle at target
 *   association    —                           solid line, no arrowhead
 *
 * Dash convention used by this module: dotted ≈ "2 3", dashed ≈ "6 3"; solid =
 * no dash array. The structural diamonds sit at the SOURCE (the "whole" end) per
 * the spec — the renderer's diamond marker is source-oriented.
 */
import type { ArchimateConnectorType } from "./types";

/** Human display name for each ArchiMate relationship type — shown as the
 *  connector label when a connector is highlighted (individually or via the
 *  tree-traversal highlight). */
export const ARCHI_REL_NAME: Record<ArchimateConnectorType, string> = {
  "archi-composition": "Composition",
  "archi-aggregation": "Aggregation",
  "archi-assignment": "Assignment",
  "archi-realisation": "Realisation",
  "archi-serving": "Serving",
  "archi-access": "Access",
  "archi-influence": "Influence",
  "archi-association": "Association",
  "archi-triggering": "Triggering",
  "archi-flow": "Flow",
  "archi-specialisation": "Specialisation",
};

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
    // Structural — the diamond/ball sits at the SOURCE ("whole") end; no
    // target arrowhead. SOLID line.
    case "archi-composition":
      return { ...base, startMarker: "diamond-filled", endMarker: null };
    case "archi-aggregation":
      return { ...base, startMarker: "diamond-open", endMarker: null };
    case "archi-assignment":
      // Filled ball at source + filled (solid) arrowhead at target, solid line.
      return { ...base, startMarker: "circle-filled", endMarker: "arrow-filled" };
    case "archi-realisation":
      // DOTTED line + hollow (open) triangle at target.
      return { ...base, endMarker: "triangle-open", dash: "2 3" };
    // Dependency
    case "archi-serving":
      // SOLID line + open (line) arrowhead.
      return { ...base, endMarker: "arrow-open" };
    case "archi-access":
      // DOTTED line + open arrowhead.
      return { ...base, endMarker: "arrow-open", dash: "2 3" };
    case "archi-influence":
      // DASHED line + open arrowhead. Distinct from access's dotted line
      // (the two previously collapsed to the same rendering).
      return { ...base, endMarker: "arrow-open", dash: "6 3" };
    case "archi-association":
      // SOLID line, no arrowhead.
      return { ...base, endMarker: null };
    // Dynamic
    case "archi-triggering":
      // SOLID line + filled (solid) arrowhead. (Previously wrongly dashed.)
      return { ...base, endMarker: "arrow-filled" };
    case "archi-flow":
      // DASHED line + filled (solid) arrowhead. (Previously wrongly dash-dot
      // + open arrow.)
      return { ...base, endMarker: "arrow-filled", dash: "6 3" };
    // Other
    case "archi-specialisation":
      // SOLID line + hollow (open) triangle at target.
      return { ...base, endMarker: "triangle-open" };
  }
}
