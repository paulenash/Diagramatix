/**
 * Where a gateway's OUTGOING branch labels sit, in a generated diagram (rule R8.46 — Paul, 2026-10-07: "the labels on outgoing Gateway
 * connectors need to be more regulated and closer to the actual gateway itself").
 *
 * THE POSITION. From the gateway vertex the connector leaves by, walk GATEWAY_LABEL_ALONG_OFFSET (50 px) along the connector. That point
 * decides the label:
 *   • a TOP or BOTTOM vertex connector — the label's text box has its LEFT edge GATEWAY_LABEL_CLEAR_OFFSET (30 px) to the right of the
 *     point, centred on it vertically;
 *   • a MIDDLE vertex connector (the side or "right" one) — the text box has its BOTTOM edge GATEWAY_LABEL_UP_OFFSET (30 px) above the
 *     point, its left edge at the point (so a wide label starts clear of the diamond, not over it).
 *
 * THE NUDGE. Labels of one gateway whose text then overlaps each other are moved apart: the TOP connector's label UP, the BOTTOM
 * connector's label DOWN (the middle one stays), in small steps, until nothing overlaps.
 *
 * This replaces the earlier per-label search for a clear spot (R5.12 / R5.13) for these labels: a label is where the rule puts it, always,
 * so every gateway in every generated diagram reads the same way. Pure geometry; the label box's size comes from connectorLabelBox, the
 * same measure the renderer and the readability checks use.
 */
import type { Connector, DiagramElement } from "./types";
import type { DiagramData } from "./types";
import { baseLabelAnchor, connectorLabelBox, findLayoutViolations, findReadabilityViolations } from "./checks/layoutViolations";

export const GATEWAY_LABEL_ALONG_OFFSET = 50;
export const GATEWAY_LABEL_CLEAR_OFFSET = 30;
export const GATEWAY_LABEL_UP_OFFSET = 30;
/** Nudge step, and a ceiling so a pathological gateway cannot loop. */
const NUDGE_STEP = 2;
const NUDGE_MAX_STEPS = 300;

type Pt = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };
export type BranchRole = "top" | "bottom" | "middle";

/** The part of the route that is actually drawn — the same trimming connectorLabelBox does. */
function visiblePath(c: Connector): Pt[] {
  let vis = c.waypoints ?? [];
  if (c.sourceInvisibleLeader && vis.length > 2) vis = vis.slice(1);
  if (c.targetInvisibleLeader && vis.length > 2) vis = vis.slice(0, -1);
  return vis;
}

/** The point `dist` px along a polyline from its first point; the last point if the line is shorter. */
export function pointAlong(pts: Pt[], dist: number): Pt {
  return walk(pts, dist).p;
}

/** The point `dist` along, and whether the segment it falls on is horizontal. */
function walk(pts: Pt[], dist: number): { p: Pt; horizontal: boolean } {
  let left = dist;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len >= left && len > 0) {
      const t = left / len;
      return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, horizontal: Math.abs(b.y - a.y) < 0.5 };
    }
    left -= len;
  }
  const n = pts.length;
  return { p: pts[n - 1], horizontal: n > 1 && Math.abs(pts[n - 1].y - pts[n - 2].y) < 0.5 };
}

/** Clear gap kept between a label and the horizontal run it names, when the label cannot sit beside a vertical one. */
const RUN_GAP = 4;

export const branchRole = (c: Connector): BranchRole =>
  c.sourceSide === "top" ? "top" : c.sourceSide === "bottom" ? "bottom" : "middle";

/** The box the rule puts this label in (before any nudge), or null when it has no label / no route. */
export function ruleLabelBox(c: Connector, els: DiagramElement[]): { box: Box; role: BranchRole } | null {
  const size = connectorLabelBox(c, els);              // width/height of the text box as drawn
  const vis = visiblePath(c);
  if (!size || vis.length < 2) return null;
  const { p, horizontal } = walk(vis, GATEWAY_LABEL_ALONG_OFFSET);
  const role = branchRole(c);
  // Top / bottom: beside the line, centred on the point — unless the line has already turned horizontal there, when the label would sit
  // ON it (a branch label is not drawn across its own run), so it goes just above (top branch) / below (bottom branch) the run.
  const y = role === "top" && horizontal ? p.y - RUN_GAP - size.h
    : role === "bottom" && horizontal ? p.y + RUN_GAP
    : p.y - size.h / 2;
  const box: Box = role === "middle"
    ? { x: p.x, y: p.y - GATEWAY_LABEL_UP_OFFSET - size.h, w: size.w, h: size.h }
    : { x: p.x + GATEWAY_LABEL_CLEAR_OFFSET, y, w: size.w, h: size.h };
  return { box, role };
}

const violationCount = (elements: DiagramElement[], connectors: Connector[]): number => {
  const d = { elements, connectors } as unknown as DiagramData;
  return findLayoutViolations(d).length + findReadabilityViolations(d).length;
};

const overlap = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Write a label's offsets so that its text box lands exactly at `box` (the renderer measures them from the label anchor). */
function setOffsets(c: Connector, box: Box): void {
  const a = baseLabelAnchor(c);
  if (!a) return;
  c.labelOffsetX = Math.round((box.x + box.w / 2 - a.x) * 100) / 100;
  c.labelOffsetY = Math.round((box.y - a.y) * 100) / 100;
}

/**
 * Place every labelled outgoing sequence connector of every gateway by the rule, then nudge overlapping labels of a gateway apart.
 * Mutates the connectors' labelOffsetX / labelOffsetY. Returns how many labels it placed.
 */
export function placeGatewayBranchLabels(elements: DiagramElement[], connectors: Connector[]): number {
  let placed = 0;
  for (const g of elements) {
    if (g.type !== "gateway") continue;
    const outs = connectors.filter((c) => c.type === "sequence" && c.sourceId === g.id && (c.label ?? "").trim());
    if (outs.length === 0) continue;

    const items = outs
      .map((c) => { const r = ruleLabelBox(c, elements); return r ? { c, role: r.role, box: r.box } : null; })
      .filter((x): x is { c: Connector; role: BranchRole; box: Box } => !!x);
    if (items.length === 0) continue;

    // Nudge: top labels up, bottom labels down; a middle label stays where it is. Two middles (a vertex shared by two branches): the upper
    // one moves up and the lower one down, so they too come apart.
    for (let step = 0; step < NUDGE_MAX_STEPS; step++) {
      let moved = false;
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i], b = items[j];
          if (!overlap(a.box, b.box)) continue;
          const [upper, lower] = a.box.y <= b.box.y ? [a, b] : [b, a];
          const up = (x: typeof a) => { x.box = { ...x.box, y: x.box.y - NUDGE_STEP }; moved = true; };
          const down = (x: typeof a) => { x.box = { ...x.box, y: x.box.y + NUDGE_STEP }; moved = true; };
          if (upper.role === "top" || (upper.role === "middle" && lower.role === "middle")) up(upper);
          if (lower.role === "bottom" || (lower.role === "middle" && upper.role === "middle")) down(lower);
          if (!moved) {
            // top/middle or middle/bottom pairs with the mover below/above: move whichever of the two is the top or bottom label.
            if (upper.role === "middle" && lower.role === "top") up(lower);
            else if (upper.role === "bottom" && lower.role === "middle") down(upper);
            else if (lower.role === "middle" && upper.role === "bottom") down(upper);
            else if (upper.role === "bottom" && lower.role === "top") { down(upper); up(lower); }
            else if (upper.role === "middle" && lower.role === "bottom") down(lower);
            else if (upper.role === "top" && lower.role === "middle") up(upper);
          }
        }
      }
      if (!moved) break;
    }

    // The rule's spot is taken only where it does no harm. The checker the readability ratchet uses is the judge: a label moves to the rule
    // position only if that does not ADD a violation (over a task, over another label, along its own run…). Otherwise it keeps the place the
    // earlier label passes found — a label a little further from its gateway is better than one sitting on something.
    for (const it of items) {
      const before = violationCount(elements, connectors);
      const was = { x: it.c.labelOffsetX, y: it.c.labelOffsetY };
      setOffsets(it.c, it.box);
      if (violationCount(elements, connectors) > before) { it.c.labelOffsetX = was.x; it.c.labelOffsetY = was.y; continue; }
      placed++;
    }
  }
  return placed;
}
