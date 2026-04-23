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

import { useEffect, useState } from "react";
import type { DiagramElement } from "@/app/lib/diagram/types";
import {
  loadArchimateCatalogue,
  findShapeByKey,
  getCachedCatalogue,
  type ArchimateShapeEntry,
} from "@/app/lib/archimate/catalogue";
import { getThemeFor, type ArchimateCategoryTheme } from "@/app/lib/archimate/themes";
import { ICON_DRAWERS } from "@/app/lib/archimate/icons";

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
  const fill = elOverrideFill ?? theme?.fill ?? entry.fill ?? "#f5f5f5";
  const stroke = elOverrideStroke ?? theme?.stroke ?? entry.stroke ?? "#666666";
  const iconColour = (el.properties?.iconColour as string | undefined) ?? theme?.iconColour ?? stroke;

  const d = drawOutline(entry.shapeFamily, el.x, el.y, el.width, el.height);

  // Icon overlay — ALWAYS top-right corner regardless of variant.
  const iconBoxSize = 18;
  const iconCx = el.x + el.width - iconBoxSize / 2 - 6;
  const iconCy = el.y + iconBoxSize / 2 + 6;

  const drawIcon = entry.iconType ? ICON_DRAWERS[entry.iconType] : undefined;

  return (
    <g>
      <path d={d} fill={fill} stroke={stroke} strokeWidth={1.2} />
      {drawIcon ? drawIcon({ cx: iconCx, cy: iconCy, size: iconBoxSize, colour: iconColour }) : null}
    </g>
  );
}
