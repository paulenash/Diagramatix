/**
 * How the canvas PAINTS an element or a connector — its fill, stroke and body
 * tint — as one pure module.
 *
 * Paul, 2026-09-27: "Redo the diagram images displayed on the Diagram tiles in
 * more realistic colour matching the actual diagram colours better. In BPMN
 * diagrams the pool and lane background colours are shown too dark. Archimate
 * diagrams are all washed out. Improve them for all diagram types."
 *
 * The tile picture had its own idea of every colour: a pool filled edge to edge
 * with its HEADER colour (the canvas draws a light body and a coloured strip),
 * every ArchiMate element white (the canvas takes its layer colour from the
 * category theme), themed value-chain chevrons in the default peach, and so on.
 * It had drifted because it was a copy. So the rules live here, once, and both
 * sides call them: SymbolRenderer / ArchimateShape / ConnectorRenderer for the
 * canvas, `diagramThumbnail.ts` for the tile (and templateThumbnail's
 * true-colour mode for the mobile viewer + partner PDF).
 *
 * Pure: no React, no DOM, no catalogue fetch — it runs in a test and on the
 * server.
 */
import type { ArchimateConnectorType, DiagramElement, SymbolType } from "./types";
import { DEFAULT_SYMBOL_COLORS, resolveColor, type SymbolColorConfig } from "./colors";
import { getThemeFor } from "@/app/lib/archimate/themes";
import { styleFor } from "./archimateConnectorStyle";

// ── Line colours ────────────────────────────────────────────────────────────

/** The outline every BPMN / state / UML / EPC shape is drawn with. */
export const SHAPE_STROKE = "#374151";
/** Standard Flowchart is strictly monochrome: a near-black outline. */
export const FLOWCHART_STROKE = "#111111";
/** Pain Point / Issue starburst outlines. */
export const PAIN_POINT_STROKE = "#b91c1c";
export const ISSUE_STROKE = "#166534";

/** A BPMN Group's dash-dot boundary (its colour is the "group" config colour). */
export const GROUP_DASH = "10 3.5 2 3.5";

/** A state-machine fork/join bar (drawn in this colour whatever the config). */
export const FORK_JOIN_FILL = "#1f2937";
/** The paper colour of a BOXED text annotation (PCF element descriptions). */
export const ANNOTATION_BOX_FILL = "#FFFDF5";

/** Text-annotation bracket colours, keyed by `properties.annotationColor`. */
export const ANNOTATION_COLORS: Record<string, string> = {
  black: "#000000", green: "#16a34a", orange: "#ea580c", red: "#dc2626", purple: "#9333ea",
};

/** The bracket (or box) colour of a text annotation. */
export function annotationColor(el: Pick<DiagramElement, "properties">): string {
  const key = (el.properties?.annotationColor as string | undefined) ?? "black";
  return ANNOTATION_COLORS[key] ?? "#000000";
}

/** Pale pastel palette for review comments — index 0 (pink) is the default /
 *  first author; each additional distinct author gets the next colour so
 *  different users' comments are easily told apart (item G). */
export const REVIEW_COMMENT_PALETTE = [
  { fill: "#fce7f3", stroke: "#ec4899", fold: "#f9a8d4", text: "#831843" }, // pink
  { fill: "#dbeafe", stroke: "#3b82f6", fold: "#93c5fd", text: "#1e3a8a" }, // blue
  { fill: "#dcfce7", stroke: "#22c55e", fold: "#86efac", text: "#14532d" }, // green
  { fill: "#fef3c7", stroke: "#f59e0b", fold: "#fcd34d", text: "#78350f" }, // amber
  { fill: "#ede9fe", stroke: "#8b5cf6", fold: "#c4b5fd", text: "#4c1d95" }, // purple
  { fill: "#ccfbf1", stroke: "#14b8a6", fold: "#5eead4", text: "#134e4a" }, // teal
  { fill: "#ffe4e6", stroke: "#f43f5e", fold: "#fda4af", text: "#881337" }, // rose
  { fill: "#ecfccb", stroke: "#84cc16", fold: "#bef264", text: "#365314" }, // lime
];

/** The original 12-point starburst, on the element's (now golden-ratio) box.
 *  Shared by the canvas shape, the palette preview and the tile picture. */
export function painPointStarPoints(cx: number, cy: number, rx: number, ry: number): string {
  const spikes = 12;
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const ang = (Math.PI * i) / spikes - Math.PI / 2;
    const r = i % 2 === 0 ? 1 : 0.62;
    pts.push(`${cx + Math.cos(ang) * rx * r},${cy + Math.sin(ang) * ry * r}`);
  }
  return pts.join(" ");
}

// ── Colour arithmetic ───────────────────────────────────────────────────────

const HEX6 = /^#[0-9a-f]{6}$/i;

/** Linear interpolate between two #rrggbb colours. `frac=0` returns `hex`,
 *  `frac=1` returns `toward`. Anything that is not #rrggbb comes back as-is
 *  (a named colour cannot be blended, and "#NaNNaNNaN" paints black). */
export function lerpHex(hex: string, toward: string, frac: number): string {
  if (!HEX6.test(hex) || !HEX6.test(toward)) return hex;
  const parse = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [r1, g1, b1] = parse(hex);
  const [r2, g2, b2] = parse(toward);
  const c = (a: number, b: number) => Math.round(a + (b - a) * frac).toString(16).padStart(2, "0");
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

/** A nested container's fill: each level of nesting blends `step` further
 *  toward white, capped at `cap`. Depth 0 is the colour itself. */
export function nestedTint(base: string, depth: number, step: number, cap: number): string {
  return depth > 0 ? lerpHex(base, "#ffffff", Math.min(depth * step, cap)) : base;
}

/** How far toward white a pool / lane BODY sits from its header colour. (The
 *  header strip's WIDTH is containerMetrics' getPoolHeaderWidth /
 *  getLaneHeaderWidth.) */
export const BAND_BODY_TINT = 0.93;

/** Height of the solid header band on a system boundary / composite state
 *  (SymbolRenderer's HEADER_H). */
export const CONTAINER_HEADER_H = 28;

/** Opacity of a headed container's body (its header is solid). */
export const SYSTEM_BOUNDARY_BODY_OPACITY = 0.3;
export const COMPOSITE_STATE_BODY_OPACITY = 0.4;
export const UML_PACKAGE_BODY_OPACITY = 0.35;

// ── Elements ────────────────────────────────────────────────────────────────

/** The types whose canvas shape honours a per-element `properties.fillColor`
 *  (a value-chain theme, the mining heat map) over the colour config. */
const FILL_COLOR_OVERRIDE_TYPES = new Set<string>([
  "task", "gateway", "start-event", "intermediate-event", "end-event",
  "state", "chevron", "chevron-collapsed", "process-group",
]);

/**
 * An element's own colour, exactly as the canvas resolves it: the body fill of
 * a filled shape; for the line-drawn ones (actor, team, group) the line colour;
 * for initial / final states the disc colour.
 *
 *   ArchiMate          → its layer theme (see `archimatePaint`)
 *   EPC / Flowchart    → `properties.fill` ?? colour config
 *   task, gateway, events, state, chevrons, process group
 *                      → `properties.fillColor` ?? colour config
 *   everything else    → colour config ?? default
 *
 * An unrecognised type is drawn by the canvas as a task, so it takes the
 * task colour here too.
 */
export function elementFill(el: Pick<DiagramElement, "type" | "properties" | "id">, colors?: SymbolColorConfig): string {
  const props = el.properties ?? {};
  // A typeless element (legacy or hand-made data) is a task here, as below —
  // never a throw: the mobile viewer and the partner PDF render through this.
  const t = (el.type ?? "") as SymbolType;
  if (t === "archimate-shape") return archimatePaint(el).fill;
  if (t.startsWith("epc-") || t.startsWith("flowchart-")) {
    return (props.fill as string | undefined) ?? resolveColor(t, colors);
  }
  const type: SymbolType = t in DEFAULT_SYMBOL_COLORS ? t : "task";
  const own = FILL_COLOR_OVERRIDE_TYPES.has(type) ? (props.fillColor as string | undefined) : undefined;
  return own ?? resolveColor(type, colors);
}

/**
 * The fill of a container that lightens with nesting — `depth` counts
 * ancestors of the element's own type (sameTypeAncestorDepths):
 *   process group, expanded subprocess → 25% lighter a level, capped at 90%
 *   UML package                        → 22% lighter a level, capped at 80%
 * Any other type is just its elementFill.
 */
export function nestedContainerFill(
  el: Pick<DiagramElement, "type" | "properties" | "id">,
  colors: SymbolColorConfig | undefined,
  depth: number,
): string {
  const base = elementFill(el, colors);
  if (el.type === "process-group" || el.type === "subprocess-expanded") return nestedTint(base, depth, 0.25, 0.9);
  if (el.type === "uml-package") return nestedTint(base, depth, 0.22, 0.8);
  return base;
}

/** A pool: its header strip colour and its (very light) body tint. */
export function poolPaint(colors?: SymbolColorConfig): { header: string; body: string } {
  const header = resolveColor("pool", colors);
  return { header, body: lerpHex(header, "#ffffff", BAND_BODY_TINT) };
}

/**
 * A lane band: `kind` is "sublane" for a lane whose parent is a lane (it takes
 * the sublane colour), else "lane". `laneDepth` is the number of lane ancestors
 * (0 = top-level lane, 1 = sub-lane, 2+ = sub-sub-lane); each level past a
 * sub-lane lightens 25% (capped at 80%). The body is a very light tint of the
 * header.
 */
export function lanePaint(laneDepth: number, kind: "lane" | "sublane", colors?: SymbolColorConfig): { header: string; body: string } {
  const base = resolveColor(kind, colors);
  const header = nestedTint(base, laneDepth - 1, 0.25, 0.8);
  return { header, body: lerpHex(header, "#ffffff", BAND_BODY_TINT) };
}

/** A system boundary or composite state: solid header band, translucent body. */
export function headedContainerPaint(
  type: "system-boundary" | "composite-state",
  colors?: SymbolColorConfig,
): { header: string; body: string; bodyOpacity: number } {
  if (type === "system-boundary") {
    return {
      header: resolveColor("system-boundary", colors),
      body: resolveColor("system-boundary-body", colors),
      bodyOpacity: SYSTEM_BOUNDARY_BODY_OPACITY,
    };
  }
  return {
    header: resolveColor("composite-state", colors),
    body: resolveColor("composite-state-body", colors),
    bodyOpacity: COMPOSITE_STATE_BODY_OPACITY,
  };
}

// ── ArchiMate ───────────────────────────────────────────────────────────────

/** The parts of a catalogue entry that decide colour. */
export interface ArchimateEntryLike {
  category: string;
  iconType?: string;
  fill?: string;
  stroke?: string;
}

/** Catalogue category ids, longest first so "implementation-migration-…" is
 *  not mistaken for something shorter. Every catalogue key starts with its
 *  category id and a hyphen (guarded by a test over the whole catalogue). */
const ARCHI_CATEGORY_IDS = ["implementation-migration", "application", "technology", "motivation", "composite", "business", "strategy"];

/** The icon types that change how an element is COLOURED, recognised from the
 *  key alone. Everything else is coloured by its category. */
const ARCHI_SPECIAL_ICON_BY_KEY: Record<string, string> = {
  "composite-location": "location",
  "composite-grouping": "grouping",
  "composite-junction-and": "junction-and",
  "composite-junction-or": "junction-or",
};

/**
 * What the colour rules need from a catalogue entry, worked out from the
 * shapeKey alone — so a picture can colour an ArchiMate element correctly
 * without fetching the 40 KB catalogue. The canvas passes the real entry.
 */
export function archimateEntryFromKey(shapeKey: string | undefined): ArchimateEntryLike | undefined {
  if (!shapeKey) return undefined;
  const category = ARCHI_CATEGORY_IDS.find((c) => shapeKey.startsWith(c + "-"));
  if (!category) return undefined;
  const iconType = ARCHI_SPECIAL_ICON_BY_KEY[shapeKey]
    ?? (/-actor-(box|icon)$/.test(shapeKey) ? "actor" : undefined);
  return { category, iconType };
}

/** Location renders in a light, dull purple (box + symbol), distinct from the
 *  neutral-grey Composite category default. */
export const ARCHI_LOCATION_FILL = "#efd1e4";
export const ARCHI_LOCATION_INK = "#8f77a6";
/** Grouping: a dark-grey dashed boundary with a transparent interior. */
export const ARCHI_GROUPING_STROKE = "#555555";
export const ARCHI_GROUPING_DASH = "8 4";
/** ArchiMate outlines are drawn heavier than the other notations' 1.5 — part
 *  of why the layer colours read so strongly on the canvas. */
export const ARCHI_STROKE_WIDTH = 2.4;

export interface ArchimatePaint {
  /** Body fill, after the containment lightening for `depth`. */
  fill: string;
  /** Body fill BEFORE containment lightening (the Node's 3D faces use it). */
  baseFill: string;
  stroke: string;
  iconColour: string;
  /** The entry's icon type, as far as it is known (always, from the real
   *  catalogue entry; from the key, only the ones that change colour/shape). */
  iconType: string | undefined;
  isLocation: boolean;
  isGrouping: boolean;
  isJunction: boolean;
}

/**
 * An ArchiMate element's colours, in the canvas's order of precedence:
 *   1. the element's own `properties.fill` / `properties.stroke`
 *   2. Location's fixed purple
 *   3. the category theme (Business yellow, Application cyan, …)
 *   4. the catalogue entry's raw stencil colour
 * `depth` is the element's descendant depth (0 = leaf): a container lightens
 * ~38% per level, capped at 85% toward white.
 */
export function archimatePaint(
  el: Pick<DiagramElement, "properties">,
  entry?: ArchimateEntryLike,
  depth = 0,
): ArchimatePaint {
  const shapeKey = el.properties?.shapeKey as string | undefined;
  const e = entry ?? archimateEntryFromKey(shapeKey);
  const theme = e ? getThemeFor(e.category) : undefined;
  const isLocation = e?.iconType === "location";
  const isGrouping = e?.iconType === "grouping";
  const isJunction = !!e?.iconType && e.iconType.startsWith("junction");
  const ownFill = el.properties?.fill as string | undefined;
  const ownStroke = el.properties?.stroke as string | undefined;
  const baseFill = ownFill ?? (isLocation ? ARCHI_LOCATION_FILL : theme?.fill) ?? e?.fill ?? "#f5f5f5";
  const stroke = ownStroke ?? (isLocation ? ARCHI_LOCATION_INK : theme?.stroke) ?? e?.stroke ?? "#666666";
  const iconColour = (el.properties?.iconColour as string | undefined)
    ?? (isLocation ? ARCHI_LOCATION_INK : theme?.iconColour) ?? stroke;
  const fill = depth > 0 ? lerpHex(baseFill, "#ffffff", Math.min(0.85, depth * 0.38)) : baseFill;
  return { fill, baseFill, stroke, iconColour, iconType: e?.iconType, isLocation, isGrouping, isJunction };
}

// ── Connectors ──────────────────────────────────────────────────────────────

/** A connector's resting line colour (not selected, not highlighted). */
export function connectorStroke(type: string): string {
  if (type.startsWith("archi-")) return styleFor(type as ArchimateConnectorType, false).strokeColor;
  switch (type) {
    case "messageBPMN": return "#b0b7c3";
    case "associationBPMN": return "#9ca3af";
    case "flowchart-association": return "#9333ea";  // dotted comment association (purple)
    case "epc-information-flow": return "#3b82f6";   // blue, like the information objects it joins
    case "epc-org-assignment": return "#b45309";     // amber, like the organisational units
    case "review-comment-link": return "#ec4899";
    default: return "#6b7280";
  }
}

/** A connector's dash pattern (undefined = a solid line): dashed message
 *  flows, dotted associations, dashed UML dependencies, and each ArchiMate
 *  relationship's own pattern. */
export function connectorDash(c: { type: string; dashed?: boolean }): string | undefined {
  if (c.type.startsWith("archi-")) return styleFor(c.type as ArchimateConnectorType, false).dash;
  switch (c.type) {
    case "uml-dependency":
    case "uml-realisation":
    case "uml-note-anchor": return "6 4";
    case "uml-association": return c.dashed ? "6 4" : undefined;
    case "messageBPMN": return "10 5";
    case "associationBPMN": return "0.5 3";
    case "flowchart-association": return "1 3";
    case "review-comment-link": return "4 3";
    case "message": return "6 3";
    default: return undefined;
  }
}

/** The waypoints the canvas actually draws: an invisible leader (the hidden
 *  run from an element's centre to its boundary) is not part of the line. */
export function visibleWaypoints<P>(c: { waypoints: P[]; sourceInvisibleLeader?: boolean; targetInvisibleLeader?: boolean }): P[] {
  const wps = c.waypoints ?? [];
  const start = c.sourceInvisibleLeader ? 1 : 0;
  const end = c.targetInvisibleLeader ? wps.length - 2 : wps.length - 1;
  return wps.slice(start, end + 1);
}
