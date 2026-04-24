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

import { useEffect, useState, useContext } from "react";
import type { DiagramElement } from "@/app/lib/diagram/types";
import {
  loadArchimateCatalogue,
  findShapeByKey,
  getCachedCatalogue,
  type ArchimateShapeEntry,
} from "@/app/lib/archimate/catalogue";
import { getThemeFor, type ArchimateCategoryTheme } from "@/app/lib/archimate/themes";
import { ICON_DRAWERS } from "@/app/lib/archimate/icons";
import { ArchimateDepthCtx } from "./SymbolRenderer";

const STROKE_WIDTH = 2.4;               // 2× the previous 1.2

function lightenHex(hex: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${[mix(r), mix(g), mix(b)].map(v => v.toString(16).padStart(2, "0")).join("")}`;
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
    case "rectangle":
    case "custom":
    default:
      return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
  }
}

export function ArchimateShape({ el }: { el: DiagramElement }) {
  const shapeKey = el.properties?.shapeKey as string | undefined;
  const [, forceRender] = useState(0);

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
  const elOverrideFill = el.properties?.fill as string | undefined;
  const elOverrideStroke = el.properties?.stroke as string | undefined;
  let fill = elOverrideFill ?? theme?.fill ?? entry.fill ?? "#f5f5f5";
  const stroke = elOverrideStroke ?? theme?.stroke ?? entry.stroke ?? "#666666";
  const iconColour = (el.properties?.iconColour as string | undefined) ?? theme?.iconColour ?? stroke;

  // Depth-based container fill: each level of nesting makes the parent
  // ~30% lighter (capped at 85% toward white). A leaf (depth 0) keeps
  // its original colour. As soon as a child is added, the element
  // becomes depth 1 and lightens; adding a grandchild takes it to depth
  // 2 (two steps lighter), etc. When the last child is removed, the
  // depth reverts to 0 and the colour returns to the original.
  const depthMap = useContext(ArchimateDepthCtx);
  const depth = depthMap.get(el.id) ?? 0;
  if (depth > 0) {
    fill = lightenHex(fill, Math.min(0.75, depth * 0.15));
  }

  const iconOnly = !!el.properties?.archimateIconOnly;
  const drawIcon = entry.iconType ? ICON_DRAWERS[entry.iconType] : undefined;

  if (iconOnly && drawIcon) {
    // Icon-only rendering: the icon IS the shape. Fill the element bounds
    // with the glyph; no rectangular outline.
    //   - Actor: the stick figure (label rendered below by SymbolRenderer)
    //   - Service: the rounded-rect service icon (label rendered inside)
    //   - Event: the chevron+half-circle (label rendered inside)
    // For service and event we also draw a filled background shape in the
    // category theme colour so the label stays readable.
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const size = Math.min(el.width, el.height);
    const isActor = entry.iconType === "actor";
    // Service & Event want a filled background shape in theme colour
    if (!isActor) {
      let bg: string;
      if (entry.iconType === "service") {
        // Stadium / pill shape: rectangle with semicircle ends on the
        // left and right. The corner radius equals half the height so
        // the end caps are true semicircles.
        const r = el.height / 2;
        bg = `M ${el.x + r} ${el.y} L ${el.x + el.width - r} ${el.y} A ${r} ${r} 0 0 1 ${el.x + el.width - r} ${el.y + el.height} L ${el.x + r} ${el.y + el.height} A ${r} ${r} 0 0 1 ${el.x + r} ${el.y} Z`;
      } else if (entry.iconType === "event") {
        // ArchiMate 3.2: inward semi-circle scoop on the left + bulge on
        // the right. Both arcs use the element height as diameter.
        const top = el.y;
        const bot = el.y + el.height;
        const left = el.x;
        const right = el.x + el.width;
        const radius = el.height / 2;
        const archStart = right - radius;
        bg = `M ${left} ${top} L ${archStart} ${top} A ${radius} ${radius} 0 0 1 ${archStart} ${bot} L ${left} ${bot} A ${radius} ${radius} 0 0 0 ${left} ${top} Z`;
      } else {
        bg = `M ${el.x} ${el.y} L ${el.x + el.width} ${el.y} L ${el.x + el.width} ${el.y + el.height} L ${el.x} ${el.y + el.height} Z`;
      }
      return (
        <g>
          <path d={bg} fill={fill} stroke={stroke} strokeWidth={STROKE_WIDTH} strokeLinejoin="round" />
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

  // Standard box rendering — outline + corner icon glyph
  const d = drawOutline(entry.shapeFamily, el.x, el.y, el.width, el.height);
  const iconBoxSize = 22.5;
  const iconCx = el.x + el.width - iconBoxSize / 2 - 6;
  const iconCy = el.y + iconBoxSize / 2 + 6;
  return (
    <g>
      <path d={d} fill={fill} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {drawIcon ? drawIcon({ cx: iconCx, cy: iconCy, size: iconBoxSize, colour: iconColour }) : null}
    </g>
  );
}
