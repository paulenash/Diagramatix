/**
 * Domain (UML class) layout that PRESERVES the geometry read from an uploaded
 * image — the sibling of layoutStateMachinePreserved. When the AI emits
 * per-element fractional `bounds` (plus optional `parent` package nesting and
 * connector `sourceSide`/`targetSide`), reproduce the drawing instead of
 * grid-flowing. Returns null when the geometry is missing/sparse so the caller
 * falls back to auto-layout.
 */
import type { DiagramData, DiagramElement, Connector, Side, Point } from "./types";
import { isUmlConnType } from "./types";
import { computeWaypoints, spreadUmlEndpoints, deconflictUmlSegments, selfLoopWaypoints, SELF_LOOP_BULGE } from "./routing";
import { autoResizeUmlElement, sizeUmlNote } from "./umlAutoSize";
import { parseConstraintText, parseEndRole, buildConstraintText } from "./umlConstraints";

/** Map an image-read constraint string to the per-end connector fields. */
function endConstraintFields(end: "source" | "target", raw?: string): Record<string, unknown> {
  if (!raw || !raw.trim()) return {};
  const c = parseConstraintText(raw);
  const out: Record<string, unknown> = {};
  if (c.ordered)  out[`${end}Ordered`] = true;
  if (c.unique)   out[`${end}Unique`] = true;
  if (c.readOnly) out[`${end}ReadOnly`] = true;
  if (c.union)    out[`${end}Union`] = true;
  if (c.other)    out[`${end}ConstraintOther`] = c.other;
  return out;
}

// ── Constraint de-overlap ────────────────────────────────────────────────
// The multiplicity + role labels stay anchored close to the connector end
// (Paul); only the {…} CONSTRAINT box is nudged perpendicular-outward to clear
// overlaps with elements, the end's own role/multiplicity, and other
// constraints. Mirrors the renderer's offset tables so the estimate matches.
const FS = 10, LINE_H = 13, CHAR_W = 5.5, CONSTRAINT_MAXW = 130;
type Rect = { x: number; y: number; w: number; h: number };
const rectsOverlap = (a: Rect, b: Rect, gap = 3) =>
  a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
const multOff = (s: Side) => ({ bottom: { x: -15, y: 15 }, left: { x: -15, y: -15 }, top: { x: -15, y: -15 }, right: { x: 15, y: -15 } }[s]);
const roleOff = (s: Side) => ({ bottom: { x: 15, y: 15 }, left: { x: -15, y: 15 }, top: { x: 15, y: -15 }, right: { x: 15, y: 15 } }[s]);
const constraintBase = (s: Side) => { const m = multOff(s); switch (s) { case "bottom": return { x: m.x, y: m.y + LINE_H }; case "top": return { x: m.x, y: m.y - LINE_H }; case "left": return { x: m.x - LINE_H, y: m.y }; case "right": return { x: m.x + LINE_H, y: m.y }; } };
const outwardDir = (s: Side) => ({ top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[s]);

function constraintBoxRect(pt: Point, side: Side, text: string, dx: number, dy: number): Rect {
  const textW = text.length * CHAR_W;
  const w = Math.min(CONSTRAINT_MAXW, textW + 6);
  const lines = Math.max(1, Math.ceil(textW / (CONSTRAINT_MAXW - 6)));
  const h = lines * LINE_H + 4;
  const base = constraintBase(side);
  const anchorX = pt.x + base.x + dx, anchorY = pt.y + base.y + dy;
  const x = base.x < 0 ? anchorX - w : anchorX; // grows away from the element
  return { x, y: anchorY, w, h };
}

function deOverlapConstraints(connectors: Connector[], elements: DiagramElement[]): Connector[] {
  const obstacles: Rect[] = elements.map(e => ({ x: e.x, y: e.y, w: e.width, h: e.height }));
  interface CEnd { idx: number; end: "source" | "target"; pt: Point; side: Side; text: string; }
  const cEnds: CEnd[] = [];
  const endPt = (c: Connector, which: "s" | "t"): Point | null => {
    const w = c.waypoints; if (!w || w.length < 2) return null;
    return which === "s" ? (c.sourceInvisibleLeader ? w[1] : w[0])
                         : (c.targetInvisibleLeader ? w[w.length - 2] : w[w.length - 1]);
  };
  const labelRect = (pt: Point, off: { x: number; y: number }, text: string): Rect => {
    const w = Math.max(10, text.length * CHAR_W);
    return { x: pt.x + off.x - w / 2, y: pt.y + off.y - LINE_H / 2, w, h: LINE_H };
  };
  connectors.forEach((c, idx) => {
    if (!isUmlConnType(c.type)) return;
    const sp = endPt(c, "s"), tp = endPt(c, "t");
    // Roles + multiplicities are fixed obstacles (kept near the endpoint).
    if (sp) {
      if (c.sourceMultiplicity) obstacles.push(labelRect(sp, multOff(c.sourceSide), c.sourceMultiplicity));
      const sr = `${c.sourceVisibility ?? ""}${c.sourceRole ?? ""}`;
      if (sr) obstacles.push(labelRect(sp, roleOff(c.sourceSide), sr));
    }
    if (tp) {
      if (c.targetMultiplicity) obstacles.push(labelRect(tp, multOff(c.targetSide), c.targetMultiplicity));
      const tr = `${c.targetVisibility ?? ""}${c.targetRole ?? ""}`;
      if (tr) obstacles.push(labelRect(tp, roleOff(c.targetSide), tr));
    }
    const sc = buildConstraintText({ ordered: c.sourceOrdered, unique: c.sourceUnique, readOnly: c.sourceReadOnly, union: c.sourceUnion, other: c.sourceConstraintOther });
    const tc = buildConstraintText({ ordered: c.targetOrdered, unique: c.targetUnique, readOnly: c.targetReadOnly, union: c.targetUnion, other: c.targetConstraintOther });
    if (sp && sc) cEnds.push({ idx, end: "source", pt: sp, side: c.sourceSide, text: sc });
    if (tp && tc) cEnds.push({ idx, end: "target", pt: tp, side: c.targetSide, text: tc });
  });

  const placed: Rect[] = [];
  const out = connectors.map(c => ({ ...c }));
  const STEP = LINE_H, MAX_STEPS = 8;
  for (const ce of cEnds) {
    const dir = outwardDir(ce.side);
    let best = { dx: 0, dy: 0 };
    for (let s = 0; s <= MAX_STEPS; s++) {
      const dx = dir.x * STEP * s, dy = dir.y * STEP * s;
      const rect = constraintBoxRect(ce.pt, ce.side, ce.text, dx, dy);
      const hit = obstacles.some(o => rectsOverlap(rect, o)) || placed.some(o => rectsOverlap(rect, o));
      if (!hit) { best = { dx, dy }; placed.push(rect); break; }
      if (s === MAX_STEPS) { best = { dx, dy }; placed.push(rect); } // give up: keep furthest tried
    }
    if (best.dx !== 0 || best.dy !== 0) {
      const field = ce.end === "source" ? "sourceConstraintOffset" : "targetConstraintOffset";
      (out[ce.idx] as unknown as Record<string, Point>)[field] = { x: best.dx, y: best.dy };
    }
  }
  return out;
}

interface AiBounds { x: number; y: number; w: number; h: number }
interface AiEl {
  id?: string; type: string; label?: string; name?: string;
  bounds?: unknown; parent?: string; stereotype?: string;
  isAbstract?: boolean; abstractDisplay?: string;
  attributes?: Array<Record<string, unknown>>;
  operations?: Array<Record<string, unknown>>;
  values?: string[];
}
interface AiConn {
  sourceId: string; targetId: string; type?: string; label?: string;
  routingType?: string;
  sourceSide?: string; targetSide?: string;
  sourceMultiplicity?: string; targetMultiplicity?: string;
  sourceRole?: string; targetRole?: string;
  sourceConstraint?: string; targetConstraint?: string;
  sourceDerived?: boolean; targetDerived?: boolean;
  // Navigability: an OPEN arrowhead drawn at that end.
  sourceArrow?: boolean; targetArrow?: boolean;
  // Self-connector geometry read off the image.
  sourceOffsetAlong?: number; targetOffsetAlong?: number;
  selfLoopDepthFrac?: number; // loop extension as a fraction of image width
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function validBounds(b: unknown): b is AiBounds {
  if (!b || typeof b !== "object") return false;
  const o = b as Record<string, unknown>;
  return ["x", "y", "w", "h"].every(k => typeof o[k] === "number" && Number.isFinite(o[k] as number));
}

/** UML properties (attributes / operations / enum values / stereotype). */
function domainProps(e: AiEl): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  if (e.type === "uml-class") {
    // Only show a stereotype the drawing actually had (issue #4) — a plain class
    // has none; the AI supplies `stereotype` when it reads a «guillemet» tag.
    if (e.stereotype) { props.stereotype = e.stereotype; props.showStereotype = true; }
    // Abstract entity (italic name in the image → default "italics").
    if (e.isAbstract) {
      props.isAbstract = true;
      props.abstractDisplay = e.abstractDisplay === "text" ? "text" : "italics";
    }
    if (Array.isArray(e.attributes) && e.attributes.length) {
      props.showAttributes = true;
      props.attributes = e.attributes.map((a, i) => {
        // A "/name" in the image marks a derived attribute; the model may report
        // it via isDerived OR by leaving the slash on the name — handle both.
        let name = (a.name as string) ?? `attr${i}`;
        let derived = a.isDerived === true;
        if (name.startsWith("/")) { derived = true; name = name.slice(1).trim(); }
        return {
          visibility: (a.visibility as string) ?? "+",
          name,
          ...(derived ? { isDerived: true } : {}),
          ...(a.type ? { type: a.type as string } : {}),
          ...(a.multiplicity ? { multiplicity: a.multiplicity as string } : {}),
          ...(a.defaultValue ? { defaultValue: a.defaultValue as string } : {}),
        };
      });
    }
    if (Array.isArray(e.operations) && e.operations.length) {
      props.showOperations = true;
      props.operations = e.operations.map((o, i) => ({
        visibility: (o.visibility as string) ?? "+",
        name: (o.name as string) ?? `op${i}`,
      }));
    }
  } else if (e.type === "uml-enumeration" && Array.isArray(e.values)) {
    props.stereotype = "enumeration"; props.showStereotype = true; props.values = e.values;
  }
  return props;
}

export function layoutDomainPreserved(
  aiElements: AiEl[],
  aiConnections: AiConn[],
  imageAspect?: { w: number; h: number },
): DiagramData | null {
  const ided = aiElements.filter(e => e.id);
  const withBounds = ided.filter(e => validBounds(e.bounds));
  // Need most elements to carry geometry, else the reproduction would mix image
  // positions with (0,0) fallbacks — bail so the caller auto-lays.
  if (ided.length === 0 || withBounds.length < Math.ceil(ided.length * 0.6)) return null;

  const byId = new Map(ided.map(e => [e.id!, e]));

  // Normalised → px, aspect-preserving (keeps the source diagram's proportions).
  const TARGET_W = 1400;
  const aspect = imageAspect && imageAspect.w > 0 ? imageAspect.h / imageAspect.w : 0.7;
  const TARGET_H = TARGET_W * (Number.isFinite(aspect) && aspect > 0 ? aspect : 0.7);
  const OX = 60, OY = 60;

  const elements: DiagramElement[] = [];
  for (const e of ided) {
    let x = OX, y = OY, w = 200, h = 100;
    if (validBounds(e.bounds)) {
      const b = e.bounds;
      x = OX + clamp01(b.x) * TARGET_W;
      y = OY + clamp01(b.y) * TARGET_H;
      w = Math.max(0.01, b.w) * TARGET_W;
      h = Math.max(0.01, b.h) * TARGET_H;
    }
    if (e.type === "uml-package") { w = Math.max(220, w); h = Math.max(140, h); }
    else if (e.type === "uml-note") { w = Math.max(120, w); h = Math.max(60, h); }
    else if (e.type === "uml-enumeration") { w = Math.max(140, w); h = Math.max(70, h); }
    else { w = Math.max(150, w); h = Math.max(70, h); }
    const parent = e.parent && byId.has(e.parent) && byId.get(e.parent)!.type === "uml-package"
      ? e.parent : undefined;
    elements.push({
      id: e.id!, type: e.type as DiagramElement["type"],
      label: e.label ?? e.name ?? "",
      x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h),
      ...(parent ? { parentId: parent } : {}),
      properties: domainProps(e),
    } as DiagramElement);
  }

  // Honour the IMAGE class/enum DIMENSIONS (Paul): use the box the AI measured
  // off the drawing, and only GROW it when the transcribed content wouldn't fit
  // (so text is never clipped) — max(image, content). Re-centre on the original
  // image position so the box stays exactly where it was drawn.
  let sumOW = 0, sumNW = 0, sumOH = 0, sumNH = 0;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.type !== "uml-class" && el.type !== "uml-enumeration") continue;
    const cx = el.x + el.width / 2, cy = el.y + el.height / 2;
    // Content MINIMUM (50px clear each side of the name; 14px domain font).
    const contentMin = autoResizeUmlElement(el, 50, 14 / 12);
    const w = Math.max(el.width, contentMin.width);
    const h = Math.max(el.height, contentMin.height);
    sumOW += el.width; sumOH += el.height; sumNW += w; sumNH += h;
    elements[i] = {
      ...contentMin, width: w, height: h,
      x: Math.round(cx - w / 2),
      y: Math.round(cy - h / 2),
    };
  }

  // Notes: size each note's box to JUST contain its wrapped text (squarish,
  // multi-line), matching the renderer at the 14px domain font. Re-centre on
  // the original position so it stays where the eye expects it.
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.type !== "uml-note") continue;
    const cx = el.x + el.width / 2, cy = el.y + el.height / 2;
    const s = sizeUmlNote(el.label, { fontScale: 14 / 12 });
    elements[i] = { ...el, x: Math.round(cx - s.width / 2), y: Math.round(cy - s.height / 2), width: s.width, height: s.height };
  }

  // COMPACT: the boxes just shrank but their centres still sit on a canvas laid
  // out for the ORIGINAL sizes, so the gaps between them are exaggerated. Pull
  // every (non-package) centre toward the layout's top-left corner in proportion
  // to how much the boxes shrank — this keeps rows/columns aligned (an affine
  // scale preserves collinearity). Back the scale off toward 1.0 if it would
  // make any two boxes collide, so compaction never introduces an overlap.
  const movers = elements.filter(e => e.type !== "uml-package");
  if (sumOW > 0 && sumOH > 0 && movers.length >= 2) {
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const targetSx = clamp(sumNW / sumOW, 0.5, 1);
    const targetSy = clamp(sumNH / sumOH, 0.5, 1);
    // Original centres (captured before we move anything).
    const base = movers.map(e => ({ e, cx: e.x + e.width / 2, cy: e.y + e.height / 2 }));
    const minCx = Math.min(...base.map(b => b.cx));
    const minCy = Math.min(...base.map(b => b.cy));
    const GAP = 24; // keep at least this much clear between boxes
    const overlaps = (sx: number, sy: number) => {
      const boxes = base.map(b => ({
        x: minCx + (b.cx - minCx) * sx - b.e.width / 2,
        y: minCy + (b.cy - minCy) * sy - b.e.height / 2,
        w: b.e.width, h: b.e.height,
      }));
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], c = boxes[j];
          if (a.x < c.x + c.w + GAP && a.x + a.w + GAP > c.x &&
              a.y < c.y + c.h + GAP && a.y + a.h + GAP > c.y) return true;
        }
      return false;
    };
    let sx = targetSx, sy = targetSy;
    // Ease both factors up toward 1 together until the packed layout is clean.
    for (let step = 0; step < 20 && overlaps(sx, sy); step++) {
      sx = Math.min(1, sx + 0.025);
      sy = Math.min(1, sy + 0.025);
      if (sx >= 1 && sy >= 1) break;
    }
    for (const b of base) {
      b.e.x = Math.round(minCx + (b.cx - minCx) * sx - b.e.width / 2);
      b.e.y = Math.round(minCy + (b.cy - minCy) * sy - b.e.height / 2);
    }
  }

  // D4.06 — SEPARATE overlapping entities/enums. The compaction above only
  // avoids INTRODUCING overlaps; boxes that already overlap (the image drew them
  // touching, or content-sizing grew a box past its neighbour's gap) still need
  // pulling apart. Push any pair closer than the minimum gap apart along their
  // axis of least penetration — the horizontal gap is larger, so overlaps
  // resolve sideways by preference (Paul: "especially in the horizontal
  // direction"). Iterative relaxation converges quickly for the handful of
  // boxes in a class diagram.
  if (movers.length >= 2) {
    const HGAP = 40, VGAP = 24;
    for (let pass = 0; pass < 60; pass++) {
      let moved = false;
      for (let i = 0; i < movers.length; i++) {
        for (let j = i + 1; j < movers.length; j++) {
          const a = movers[i], b = movers[j];
          const ax2 = a.x + a.width, ay2 = a.y + a.height;
          const bx2 = b.x + b.width, by2 = b.y + b.height;
          // Signed overlap incl. the required gap on each axis (>0 == too close).
          const ox = Math.min(ax2 + HGAP, bx2 + HGAP) - Math.max(a.x - HGAP, b.x - HGAP) - HGAP;
          const oy = Math.min(ay2 + VGAP, by2 + VGAP) - Math.max(a.y - VGAP, b.y - VGAP) - VGAP;
          if (ox <= 0 || oy <= 0) continue; // already clear on at least one axis
          const acx = a.x + a.width / 2, bcx = b.x + b.width / 2;
          const acy = a.y + a.height / 2, bcy = b.y + b.height / 2;
          // Push apart along the axis the boxes are already more separated on,
          // biased HORIZONTAL (Paul: "especially in the horizontal direction").
          // Side-by-side boxes spread sideways; a genuine parent-above-child
          // stack (centres near-aligned in x) still resolves vertically.
          const dcx = Math.abs(bcx - acx), dcy = Math.abs(bcy - acy);
          if (dcx * 1.6 >= dcy) {
            const push = ox / 2, dir = acx <= bcx ? -1 : 1;
            a.x = Math.round(a.x + dir * push); b.x = Math.round(b.x - dir * push);
          } else {
            const push = oy / 2, dir = acy <= bcy ? -1 : 1;
            a.y = Math.round(a.y + dir * push); b.y = Math.round(b.y - dir * push);
          }
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  // Grow each package to enclose its members (image bounds are approximate).
  const HEADER = 30, PAD = 16;
  for (const c of elements) {
    if (c.type !== "uml-package") continue;
    const kids = elements.filter(k => k.parentId === c.id);
    if (!kids.length) continue;
    const minX = Math.min(...kids.map(k => k.x)) - PAD;
    const minY = Math.min(...kids.map(k => k.y)) - PAD - HEADER;
    const maxX = Math.max(...kids.map(k => k.x + k.width)) + PAD;
    const maxY = Math.max(...kids.map(k => k.y + k.height)) + PAD;
    const nx = Math.min(c.x, minX), ny = Math.min(c.y, minY);
    c.width = Math.max(c.x + c.width, maxX) - nx;
    c.height = Math.max(c.y + c.height, maxY) - ny;
    c.x = nx; c.y = ny;
  }

  // Packages first so they render UNDER their members.
  elements.sort((a, b) => Number(b.type === "uml-package") - Number(a.type === "uml-package"));

  const elIds = new Set(elements.map(e => e.id));
  const SIDES = new Set<Side>(["top", "right", "bottom", "left"]);
  const connectors: Connector[] = aiConnections
    .filter(c => elIds.has(c.sourceId) && elIds.has(c.targetId))
    .map((c, i) => {
      const type = (c.type ?? "uml-association") as Connector["type"];
      // Parse a leading visibility (+ - # ~) and derived "/" out of each role.
      const sr = parseEndRole(c.sourceRole);
      const tr = parseEndRole(c.targetRole);
      // Mimic how the connector was drawn in the image when the AI reports it
      // (straight = direct, right-angled = rectilinear); note-anchor / containment
      // are always direct.
      const alwaysDirect = type === "uml-note-anchor" || type === "uml-containment";
      const routingType: Connector["routingType"] = alwaysDirect ? "direct"
        : c.routingType === "direct" ? "direct"
        : c.routingType === "rectilinear" ? "rectilinear"
        : "rectilinear";
      // Self-connector (a relationship from a class to ITSELF): both ends sit on
      // one side; use the attachment points + extension the image reported so the
      // loop matches the drawing (fall back to sensible defaults).
      const isSelf = c.sourceId === c.targetId;
      const selfSide = (SIDES.has(c.sourceSide as Side) ? c.sourceSide : "top") as Connector["sourceSide"];
      const selfSrcOff = typeof c.sourceOffsetAlong === "number" ? clamp01(c.sourceOffsetAlong) : 0.3;
      const selfTgtOff = typeof c.targetOffsetAlong === "number" ? clamp01(c.targetOffsetAlong) : 0.7;
      const selfBulge = typeof c.selfLoopDepthFrac === "number" && c.selfLoopDepthFrac > 0
        ? Math.max(24, Math.min(320, c.selfLoopDepthFrac * TARGET_W)) : SELF_LOOP_BULGE;
      // Navigability: map open arrowheads to the directed/both direction model.
      // Only associations carry navigability arrows (agg/comp/etc. have their own
      // end markers).
      const srcArrow = type === "uml-association" && c.sourceArrow === true;
      const tgtArrow = type === "uml-association" && c.targetArrow === true;
      const directionType: Connector["directionType"] =
        srcArrow && tgtArrow ? "both"
        : srcArrow || tgtArrow ? "open-directed"
        : "non-directed";
      return {
        // Index-suffixed so two connectors between the SAME pair of elements
        // (e.g. the upperValue and lowerValue compositions here) get DISTINCT
        // ids — duplicate ids collapse to a single rendered connector.
        id: `conn-${c.sourceId}-${c.targetId}-${i}`,
        sourceId: c.sourceId, targetId: c.targetId,
        sourceSide: isSelf ? selfSide : (SIDES.has(c.sourceSide as Side) ? c.sourceSide : "right") as Connector["sourceSide"],
        targetSide: isSelf ? selfSide : (SIDES.has(c.targetSide as Side) ? c.targetSide : "left") as Connector["targetSide"],
        type,
        directionType,
        // Open arrow at the SOURCE end → arrowAtSource (renderer flips the marker).
        ...(srcArrow && !tgtArrow ? { arrowAtSource: true } : {}),
        routingType: isSelf ? "rectilinear" : routingType,
        ...(isSelf ? { sourceOffsetAlong: selfSrcOff, targetOffsetAlong: selfTgtOff, selfLoopBulge: selfBulge } : {}),
        sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [],
        ...(c.sourceMultiplicity ? { sourceMultiplicity: c.sourceMultiplicity } : {}),
        ...(c.targetMultiplicity ? { targetMultiplicity: c.targetMultiplicity } : {}),
        ...(sr.role ? { sourceRole: sr.role } : {}),
        ...(tr.role ? { targetRole: tr.role } : {}),
        ...(sr.visibility ? { sourceVisibility: sr.visibility } : {}),
        ...(tr.visibility ? { targetVisibility: tr.visibility } : {}),
        ...((c.sourceDerived || sr.derived) ? { sourceDerived: true } : {}),
        ...((c.targetDerived || tr.derived) ? { targetDerived: true } : {}),
        ...endConstraintFields("source", c.sourceConstraint),
        ...endConstraintFields("target", c.targetConstraint),
        ...(c.label ? { label: c.label } : {}),
      } as Connector;
    });

  // Spread connectors that share an element side (D4.04/D4.05), then build each
  // one's waypoints DIRECTLY from the face the image reported — NOT the sticky
  // router's geometrically-optimal face, which would override the drawn
  // attachment side. A self-loop keeps its 3-segment geometry.
  const spread = spreadUmlEndpoints(connectors, elements);
  const elMap = new Map(elements.map(e => [e.id, e]));
  const routed = spread.map(conn => {
    const src = elMap.get(conn.sourceId);
    const tgt = elMap.get(conn.targetId);
    if (!src || !tgt) return conn;
    if (conn.sourceId === conn.targetId) {
      return { ...conn,
        waypoints: selfLoopWaypoints(src, conn.sourceSide, conn.sourceOffsetAlong ?? 0.3, conn.targetOffsetAlong ?? 0.7, conn.selfLoopBulge ?? SELF_LOOP_BULGE),
        sourceInvisibleLeader: true, targetInvisibleLeader: true };
    }
    try {
      const r = computeWaypoints(src, tgt, elements, conn.sourceSide, conn.targetSide, conn.routingType, conn.sourceOffsetAlong ?? 0.5, conn.targetOffsetAlong ?? 0.5);
      return { ...conn, waypoints: r.waypoints, sourceInvisibleLeader: r.sourceInvisibleLeader, targetInvisibleLeader: r.targetInvisibleLeader };
    } catch { return conn; }
  });
  return {
    elements,
    // D4.05: pull apart overlapping trunks, then nudge constraint boxes clear of
    // roles/multiplicities/elements/other constraints (roles + mults stay put).
    connectors: deOverlapConstraints(deconflictUmlSegments(routed), elements),
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}
