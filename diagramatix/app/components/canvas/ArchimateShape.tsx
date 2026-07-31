/**
 * Generic ArchiMate 3.1 shape renderer.
 *
 * One component renders every shape in the catalogue. The specific shape
 * is chosen by `element.properties.shapeKey`. Geometry is picked from the
 * catalogue entry's `shapeFamily` (rectangle / rounded-rect / ellipse /
 * hexagon / custom), fill colour is resolved by category theme (with
 * element-level override), and an ArchiMate icon overlay is drawn in the
 * top-right corner.
 */

"use client";

import { useEffect, useState, useContext, type ReactNode } from "react";
import type { DiagramElement } from "@/app/lib/diagram/types";
import {
  loadArchimateCatalogue,
  findShapeByKey,
  getCachedCatalogue,
  type ArchimateShapeEntry,
} from "@/app/lib/archimate/catalogue";
import { getThemeFor, type ArchimateCategoryTheme } from "@/app/lib/archimate/themes";
import { ICON_DRAWERS } from "@/app/lib/archimate/icons";
import { effectiveIconLayout, type IconLayout } from "@/app/lib/archimate/iconLayout";
import { useArchimateIconLayout } from "@/app/lib/archimate/useArchimateIconLayout";
import { useArchimateIconBuffers } from "@/app/lib/archimate/useArchimateIconBuffers";
import { useArchimateCustomIcon } from "@/app/lib/archimate/useArchimateCustomIcon";
import { effectiveCustomIcon } from "@/app/lib/archimate/customIcon";
import { drawCustomIcon } from "@/app/lib/archimate/iconShapes";
import { ArchimateDepthCtx } from "./SymbolRenderer";
import { archiNodeDepth } from "@/app/lib/diagram/nodeGeometry";

const STROKE_WIDTH = 2.4;               // 2× the previous 1.2

function lightenHex(hex: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${[mix(r), mix(g), mix(b)].map(v => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Darken a hex colour toward black by `amount` (0..1). */
function darkenHex(hex: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c: number) => Math.round(c * (1 - amount));
  return `#${[mix(r), mix(g), mix(b)].map(v => v.toString(16).padStart(2, "0")).join("")}`;
}

// Corner-glyph default geometry (size + top-right nudge + Technology tweak) now
// lives in iconLayout.ts so the SuperAdmin Icon Maintenance tool and this renderer
// share one source of truth; effectiveIconLayout() overlays any saved override.

/** Render a corner glyph at its effective layout. The drawers paint a square of
 *  `size`; when width ≠ height we scale vertically about the glyph centre so a
 *  non-square override still positions correctly. */
function renderGlyph(
  drawIcon: (a: { cx: number; cy: number; size: number; colour: string }) => ReactNode,
  el: DiagramElement,
  layout: IconLayout,
  colour: string,
): ReactNode {
  const cx = el.x + el.width - layout.xOffset;
  const cy = el.y + layout.yOffset;
  const glyph = drawIcon({ cx, cy, size: layout.width, colour });
  if (layout.height === layout.width) return glyph;
  const scaleY = layout.height / layout.width;
  return (
    <g transform={`translate(${cx} ${cy}) scale(1 ${scaleY}) translate(${-cx} ${-cy})`}>{glyph}</g>
  );
}

// ────────────────────────────────────────────────────────────────────
// Outline renderers per shape family
// ────────────────────────────────────────────────────────────────────
function drawOutline(
  family: ArchimateShapeEntry["shapeFamily"],
  x: number, y: number, w: number, h: number,
): string {
  switch (family) {
    case "ellipse":
      return `M ${x + w / 2} ${y} A ${w / 2} ${h / 2} 0 1 0 ${x + w / 2} ${y + h} A ${w / 2} ${h / 2} 0 1 0 ${x + w / 2} ${y} Z`;
    case "rounded-rect": {
      const r = Math.min(w, h) * 0.14;
      return `M ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} L ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;
    }
    case "hexagon": {
      const pad = w * 0.15;
      return `M ${x + pad} ${y} L ${x + w - pad} ${y} L ${x + w} ${y + h / 2} L ${x + w - pad} ${y + h} L ${x + pad} ${y + h} L ${x} ${y + h / 2} Z`;
    }
    case "octagon": {
      // Rectangle with the four corners cut off — the ArchiMate Motivation shape.
      const c = Math.min(w, h) * 0.22;
      return `M ${x + c} ${y} L ${x + w - c} ${y} L ${x + w} ${y + c} L ${x + w} ${y + h - c} L ${x + w - c} ${y + h} L ${x + c} ${y + h} L ${x} ${y + h - c} L ${x} ${y + c} Z`;
    }
    case "rectangle":
    case "custom":
    default:
      return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
  }
}

export function ArchimateShape({ el }: { el: DiagramElement }) {
  const shapeKey = el.properties?.shapeKey as string | undefined;
  const [, forceRender] = useState(0);
  const iconOverrides = useArchimateIconLayout();
  const categoryBuffers = useArchimateIconBuffers();
  const { assignments: customAssignments, iconsById } = useArchimateCustomIcon();

  // Ensure the catalogue is loaded — trigger a re-render once it arrives
  useEffect(() => {
    if (!getCachedCatalogue()) {
      loadArchimateCatalogue().then(() => forceRender(n => n + 1)).catch(() => {});
    }
  }, []);

  const entry = shapeKey ? findShapeByKey(shapeKey) : undefined;

  // If the catalogue hasn't loaded yet OR the shapeKey is missing, render a
  // neutral placeholder rectangle. Labels still render via the outer frame.
  if (!entry) {
    return (
      <rect
        x={el.x} y={el.y} width={el.width} height={el.height}
        fill="#f5f5f5" stroke="#bbbbbb" strokeDasharray="3 3"
      />
    );
  }

  // Resolve theme (category default or user override on this element)
  const theme: ArchimateCategoryTheme | undefined = getThemeFor(entry.category);
  // Location renders in a light, dull purple (element box + symbol), distinct
  // from the neutral-grey Composite category default.
  const isLocation = entry.iconType === "location";
  const locFill = "#efd1e4", locInk = "#8f77a6";
  // Grouping renders as a dark-grey dashed boundary with a fully transparent
  // interior (ArchiMate notation) so enclosed elements show through.
  const isGrouping = entry.iconType === "grouping";
  const elOverrideFill = el.properties?.fill as string | undefined;
  const elOverrideStroke = el.properties?.stroke as string | undefined;
  let fill = elOverrideFill ?? (isLocation ? locFill : theme?.fill) ?? entry.fill ?? "#f5f5f5";
  // Un-shaded base fill (before the depth-lightening below) — the Node 3D faces are
  // coloured relative to THIS, so they aren't washed out by containment shading.
  const baseFill = fill;
  const stroke = elOverrideStroke ?? (isLocation ? locInk : theme?.stroke) ?? entry.stroke ?? "#666666";
  const iconColour = (el.properties?.iconColour as string | undefined) ?? (isLocation ? locInk : theme?.iconColour) ?? stroke;

  // Depth-based container fill: each level of nesting makes the parent
  // ~30% lighter (capped at 85% toward white). A leaf (depth 0) keeps
  // its original colour. As soon as a child is added, the element
  // becomes depth 1 and lightens; adding a grandchild takes it to depth
  // 2 (two steps lighter), etc. When the last child is removed, the
  // depth reverts to 0 and the colour returns to the original.
  const depthMap = useContext(ArchimateDepthCtx);
  const depth = depthMap.get(el.id) ?? 0;
  if (depth > 0) {
    // ~38% lighter per level (was 25% — too subtle at 2 levels), capped at
    // 85% toward white so even a single nesting reads clearly.
    fill = lightenHex(fill, Math.min(0.85, depth * 0.38));
  }

  const iconOnly = !!el.properties?.archimateIconOnly;
  // A SuperAdmin-assigned custom library icon replaces the built-in drawer for
  // this element type (and carries a preferred glyph size). Junctions have their
  // own branch below and never use `drawIcon`, so they're excluded automatically.
  const custom = effectiveCustomIcon(entry.key, customAssignments, iconsById);
  const customBaseSize = custom ? { width: custom.defaultWidth, height: custom.defaultHeight } : undefined;
  const drawIcon: ((o: { cx: number; cy: number; size: number; colour: string }) => ReactNode) | undefined =
    custom ? (o) => drawCustomIcon(custom.primitives, { ...o, bg: fill }) // bg = element fill → "background" masks blend
    : (entry.iconType ? ICON_DRAWERS[entry.iconType] : undefined);

  // A Business Process linked to a BPMN diagram in the same project shows a
  // green corner glyph — mirrors the green marker on a linked BPMN subprocess.
  const hasLink = !!(el.properties?.linkedDiagramId as string | undefined);
  const glyphColour = hasLink ? "#16a34a" : iconColour;

  // Junctions have a dedicated centred-circle render below and must never take
  // the generic icon-only path — image ingestion sets `archimateIconOnly: true`
  // on them, and the icon-only fallback would draw a box + corner-glyph (the
  // "funny boundary" bug) instead of the filled/open circle notation.
  const isJunction = !!entry.iconType && entry.iconType.startsWith("junction");

  if (iconOnly && drawIcon && !isJunction) {
    // Icon-only rendering: the icon IS the shape. Fill the element bounds
    // with the glyph; no rectangular outline.
    //   - Actor: the stick figure (label rendered below by SymbolRenderer)
    //   - Service: the rounded-rect service icon (label rendered inside)
    //   - Event: the chevron+half-circle (label rendered inside)
    // For service and event we also draw a filled background shape in the
    // category theme colour so the label stays readable.
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const isActor = entry.iconType === "actor";
    // Actor: scale figure to the box HEIGHT (not min) so the stick
    // figure fills the box vertically and the label can hug the feet.
    // Other icon-only shapes still use the smaller dimension.
    const size = isActor ? el.height : Math.min(el.width, el.height);
    // Service & Event want a filled background shape in theme colour
    if (!isActor) {
      // Component (and System Software, which shares the "component" iconType): the
      // WHOLE shape is a rectangle with two small tabs straddling its left edge.
      if (entry.iconType === "component") {
        const tabW = Math.min(el.width * 0.16, 22);
        const tabH = Math.min(el.height * 0.22, 18);
        const tabLen = tabW * 1.5;               // tabs 50% longer than before…
        const bodyLeft = el.x + tabW;            // …body inset so the longer tabs stay in bounds
        const bodyW = el.width - tabW;
        const tabX = bodyLeft - tabW;            // = el.x; inside portion (right of bodyLeft) stays tabW/2
        return (
          <g stroke={stroke} strokeWidth={STROKE_WIDTH} strokeLinejoin="round">
            <rect x={bodyLeft} y={el.y} width={bodyW} height={el.height} fill={fill} />
            <rect x={tabX} y={el.y + el.height * 0.20} width={tabLen} height={tabH} fill={fill} />
            <rect x={tabX} y={el.y + el.height * 0.55} width={tabLen} height={tabH} fill={fill} />
          </g>
        );
      }
      // Node: a 3D box. The FRONT rectangle is the containment boundary (fill follows
      // the element/containment shading); the top + right TRAPEZIUMS are external
      // decorations, capped at 80px, coloured relative to the un-shaded base green
      // (top = 2 shades darker, right = very dark) so they aren't washed out by nesting.
      if (entry.iconType === "node") {
        const depth = archiNodeDepth(el.width, el.height);
        const fx = el.x, fy = el.y + depth, fw = el.width - depth, fh = el.height - depth;
        const green = /^#[0-9a-f]{6}$/i.test(baseFill) ? baseFill : "#c5e0b4"; // technology green
        const topFill = darkenHex(green, 0.30);
        const rightFill = darkenHex(green, 0.55);
        const front = `M ${fx} ${fy} L ${fx + fw} ${fy} L ${fx + fw} ${fy + fh} L ${fx} ${fy + fh} Z`;
        const top = `M ${fx} ${fy} L ${fx + depth} ${fy - depth} L ${fx + fw + depth} ${fy - depth} L ${fx + fw} ${fy} Z`;
        const right = `M ${fx + fw} ${fy} L ${fx + fw + depth} ${fy - depth} L ${fx + fw + depth} ${fy + fh - depth} L ${fx + fw} ${fy + fh} Z`;
        return (
          <g stroke={stroke} strokeWidth={STROKE_WIDTH} strokeLinejoin="round">
            <path d={top} fill={topFill} />
            <path d={right} fill={rightFill} />
            <path d={front} fill={fill} />
          </g>
        );
      }
      let bg: string;
      if (entry.iconType === "service") {
        // Stadium / pill shape: rectangle with semicircle ends. Drawn 15% shorter than
        // the element height (a flatter pill), centred vertically — the standard look
        // for a Service across all layers.
        const sh = el.height * 0.85;
        const sy = el.y + (el.height - sh) / 2;
        const r = sh / 2;
        bg = `M ${el.x + r} ${sy} L ${el.x + el.width - r} ${sy} A ${r} ${r} 0 0 1 ${el.x + el.width - r} ${sy + sh} L ${el.x + r} ${sy + sh} A ${r} ${r} 0 0 1 ${el.x + r} ${sy} Z`;
      } else if (entry.iconType === "event") {
        // Right bulge (semicircle) + an inward isosceles-triangle notch on the
        // left (apex pointing right; only the two equal sides drawn). Notch depth
        // = 60% of the bulge radius.
        const top = el.y;
        const bot = el.y + el.height;
        const left = el.x;
        const right = el.x + el.width;
        const radius = el.height / 2;
        const archStart = right - radius;
        const apexX = left + 0.6 * radius;
        const midY = (top + bot) / 2;
        bg = `M ${left} ${top} L ${archStart} ${top} A ${radius} ${radius} 0 0 1 ${archStart} ${bot} L ${left} ${bot} L ${apexX} ${midY} L ${left} ${top} Z`;
      } else if (entry.iconType === "value-stream") {
        // Value Stream — a right-pointing chevron; the shape IS the element.
        // Tip depth matches routing's chevronPolygon so connectors dock to it.
        const tip = Math.min(el.height / 2, el.width * 0.22);
        const x = el.x, y = el.y, w = el.width, h = el.height;
        bg = `M ${x} ${y} L ${x + w - tip} ${y} L ${x + w} ${y + h / 2} L ${x + w - tip} ${y + h} L ${x} ${y + h} L ${x + tip} ${y + h / 2} Z`;
      } else {
        bg = `M ${el.x} ${el.y} L ${el.x + el.width} ${el.y} L ${el.x + el.width} ${el.y + el.height} L ${el.x} ${el.y + el.height} Z`;
      }
      // Service / Event / Value Stream ARE their own glyph shape. Every other
      // icon-only type (interface, role, product, data-object, …) draws a plain
      // rectangle, so overlay its ArchiMate glyph in the top-right corner —
      // otherwise it renders as a blank box.
      const cornerGlyph = entry.iconType !== "service" && entry.iconType !== "event" && entry.iconType !== "value-stream";
      const layout = effectiveIconLayout(entry.key, entry.category, iconOverrides, customBaseSize, categoryBuffers);
      return (
        <g>
          <path d={bg} fill={fill} stroke={stroke} strokeWidth={STROKE_WIDTH} strokeLinejoin="round" />
          {cornerGlyph && drawIcon ? renderGlyph(drawIcon, el, layout, glyphColour) : null}
        </g>
      );
    }
    // Actor icon-only: draw the stick figure large, no background
    return (
      <g>
        {drawIcon({ cx, cy, size, colour: stroke })}
      </g>
    );
  }

  // Junction (And/Or) — a small BLACK circle that fills its (fixed-size) element
  // bounds, so its circular edge IS the connection boundary. No box / corner /
  // label. And-Junction is filled; Or-Junction is an open ring.
  if (entry.iconType && entry.iconType.startsWith("junction")) {
    const jcx = el.x + el.width / 2;
    const jcy = el.y + el.height / 2;
    const r = Math.min(el.width, el.height) / 2 - 1;
    const filled = entry.iconType === "junction-and" || entry.iconType === "junction";
    return (
      <circle
        cx={jcx} cy={jcy} r={Math.max(2, r)}
        fill={filled ? "#000000" : "#ffffff"}
        stroke="#000000"
        strokeWidth={filled ? 1 : Math.max(1.5, Math.min(el.width, el.height) / 8)}
      />
    );
  }

  // Standard box rendering — outline + corner icon glyph. Position + size come
  // from the effective icon layout (category default, overlaid with any saved
  // SuperAdmin override from ArchiMate Icon Maintenance).
  const d = drawOutline(entry.shapeFamily, el.x, el.y, el.width, el.height);
  const layout = effectiveIconLayout(entry.key, entry.category, iconOverrides, customBaseSize, categoryBuffers);
  // Grouping has a fully TRANSPARENT interior (ArchiMate notation), so a plain
  // fill="none" rect only catches clicks on the thin dashed stroke — making the
  // grouping almost impossible to grab. Add invisible hit surfaces so the user
  // can select / drag / double-click it from (a) a HEADER strip across the top
  // (covers the label text + the top-right corner icon) and (b) a BAND hugging
  // every boundary edge. Enclosed child elements paint LATER (on top) and keep
  // their own clicks, so these surfaces never block selecting a nested shape.
  const groupHitBand = Math.min(16, el.width / 3, el.height / 3);
  const groupHeaderH = Math.min(28, el.height * 0.45);
  return (
    <g>
      <path
        d={d}
        fill={isGrouping ? "none" : fill}
        stroke={isGrouping ? "#555555" : stroke}
        strokeWidth={STROKE_WIDTH}
        strokeDasharray={isGrouping ? "8 4" : undefined}
      />
      {isGrouping && (
        <>
          {/* Boundary band — a fat transparent stroke on the perimeter; catches
              clicks "near any boundary" (half inside / half outside each edge). */}
          <rect
            x={el.x} y={el.y} width={el.width} height={el.height}
            fill="none" stroke="transparent" strokeWidth={groupHitBand}
            pointerEvents="stroke"
          />
          {/* Header strip — the top band holding the label + corner icon; the
              primary select / drag / double-click-to-edit surface. */}
          <rect
            x={el.x} y={el.y} width={el.width} height={groupHeaderH}
            fill="transparent" pointerEvents="all"
          />
        </>
      )}
      {drawIcon ? renderGlyph(drawIcon, el, layout, isGrouping ? "#555555" : glyphColour) : null}
    </g>
  );
}
