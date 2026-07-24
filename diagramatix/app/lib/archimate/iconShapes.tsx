/**
 * Custom ArchiMate icon model — editable vector primitives.
 *
 * A custom icon is a list of primitives (line, path, rect, triangle, circle,
 * ellipse) authored in a normalised 0..100 box (centre 50,50), independent of
 * the element size. `drawCustomIcon` re-draws them as live SVG on every render —
 * the SAME mechanism as the hand-coded `ICON_DRAWERS` in icons.tsx, so a custom
 * icon recolours to the element theme and stays crisp at any zoom. The uploaded
 * raster is only ever a faint editing underlay; it is never rendered here.
 *
 * `validateIconPrimitives` is the single trust boundary: it runs on AI-vectorize
 * output AND on every DB read, never throws, and drops anything malformed while
 * keeping the valid remainder. Everything downstream builds typed React SVG
 * nodes from validated numeric/enum fields — never `dangerouslySetInnerHTML`.
 */

import React from "react";
import type { IconDrawer } from "./icons";

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

/** stroke/fill follow the element theme colour; "fixed" uses the stored hex. */
export type ColourRole = "stroke" | "fill" | "fixed";

export type ArrowStyle = "open" | "filled";
export interface ArrowSpec {
  style: ArrowStyle;
  /** Arrowhead length in normalised units (scales with the icon). */
  size: number;
  /** Degrees. Undefined = auto (segment tangent at the endpoint). */
  angle?: number;
}

interface BasePrim {
  z: number;
  strokeWidth: number;
  filled: boolean;
  colourRole?: ColourRole;
  /** Required only when colourRole === "fixed" (#rrggbb). */
  colour?: string;
}

export interface LinePrim extends BasePrim {
  type: "line";
  x1: number; y1: number; x2: number; y2: number;
  startArrow?: ArrowSpec; endArrow?: ArrowSpec;
}

export type PathSeg =
  | { t: "M"; x: number; y: number }
  | { t: "L"; x: number; y: number }
  | { t: "Q"; cx: number; cy: number; x: number; y: number }
  | { t: "C"; c1x: number; c1y: number; c2x: number; c2y: number; x: number; y: number };

export interface PathPrim extends BasePrim {
  type: "path";
  segments: PathSeg[];
  closed: boolean;
  startArrow?: ArrowSpec; endArrow?: ArrowSpec;
}

export interface RectPrim extends BasePrim { type: "rect"; x: number; y: number; w: number; h: number; rx?: number; }
export interface TrianglePrim extends BasePrim { type: "triangle"; x1: number; y1: number; x2: number; y2: number; x3: number; y3: number; }
export interface CirclePrim extends BasePrim { type: "circle"; cx: number; cy: number; r: number; }
export interface EllipsePrim extends BasePrim { type: "ellipse"; cx: number; cy: number; rx: number; ry: number; rotation?: number; }

export type IconPrimitive = LinePrim | PathPrim | RectPrim | TrianglePrim | CirclePrim | EllipsePrim;

export interface CustomIcon { primitives: IconPrimitive[]; }

export const MAX_PRIMITIVES = 120;
export const DEFAULT_STROKE_WIDTH = 6;   // ≈ the drawers' s/16 in the 0..100 box
export const DEFAULT_ARROW_SIZE = 8;

// ────────────────────────────────────────────────────────────────────
// Validator — the trust boundary
// ────────────────────────────────────────────────────────────────────

const isFiniteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const HEX = /^#[0-9a-f]{6}$/i;

function num(v: unknown, fallback: number, lo: number, hi: number): number {
  return isFiniteNum(v) ? clamp(v, lo, hi) : fallback;
}
/** Coord must be a real number to keep the primitive; returns null to signal drop. */
function coord(v: unknown): number | null {
  return isFiniteNum(v) ? clamp(v, -20, 120) : null;
}

function validateArrow(raw: unknown): ArrowSpec | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const style: ArrowStyle = o.style === "filled" ? "filled" : "open";
  const size = num(o.size, DEFAULT_ARROW_SIZE, 0.5, 40);
  const spec: ArrowSpec = { style, size };
  if (isFiniteNum(o.angle)) spec.angle = o.angle;
  return spec;
}

function validateBase(o: Record<string, unknown>, i: number): BasePrim {
  const base: BasePrim = {
    z: isFiniteNum(o.z) ? Math.round(o.z) : i,
    strokeWidth: num(o.strokeWidth, DEFAULT_STROKE_WIDTH, 0, 40),
    filled: !!o.filled,
  };
  const role = o.colourRole;
  if (role === "stroke" || role === "fill" || role === "fixed") base.colourRole = role;
  if (base.colourRole === "fixed") {
    if (typeof o.colour === "string" && HEX.test(o.colour)) base.colour = o.colour;
    else base.colourRole = "stroke"; // no valid hex → follow theme
  }
  return base;
}

function validateSeg(raw: unknown): PathSeg | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const x = coord(o.x), y = coord(o.y);
  switch (o.t) {
    case "M": case "L":
      return x !== null && y !== null ? { t: o.t, x, y } : null;
    case "Q": {
      const cx = coord(o.cx), cy = coord(o.cy);
      return x !== null && y !== null && cx !== null && cy !== null ? { t: "Q", cx, cy, x, y } : null;
    }
    case "C": {
      const c1x = coord(o.c1x), c1y = coord(o.c1y), c2x = coord(o.c2x), c2y = coord(o.c2y);
      return x !== null && y !== null && c1x !== null && c1y !== null && c2x !== null && c2y !== null
        ? { t: "C", c1x, c1y, c2x, c2y, x, y } : null;
    }
    default: return null;
  }
}

function validateOne(raw: unknown, i: number): IconPrimitive | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const base = validateBase(o, i);
  switch (o.type) {
    case "line": {
      const x1 = coord(o.x1), y1 = coord(o.y1), x2 = coord(o.x2), y2 = coord(o.y2);
      if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
      return { ...base, type: "line", x1, y1, x2, y2, startArrow: validateArrow(o.startArrow), endArrow: validateArrow(o.endArrow) };
    }
    case "path": {
      if (!Array.isArray(o.segments)) return null;
      const segments = (o.segments as unknown[]).map(validateSeg).filter((s): s is PathSeg => s !== null);
      if (segments.length < 2 || segments[0].t !== "M") return null;
      return { ...base, type: "path", segments, closed: !!o.closed, startArrow: validateArrow(o.startArrow), endArrow: validateArrow(o.endArrow) };
    }
    case "rect": {
      const x = coord(o.x), y = coord(o.y);
      if (x === null || y === null) return null;
      return { ...base, type: "rect", x, y, w: num(o.w, 0, 0, 140), h: num(o.h, 0, 0, 140), rx: isFiniteNum(o.rx) ? clamp(o.rx, 0, 70) : undefined };
    }
    case "triangle": {
      const x1 = coord(o.x1), y1 = coord(o.y1), x2 = coord(o.x2), y2 = coord(o.y2), x3 = coord(o.x3), y3 = coord(o.y3);
      if ([x1, y1, x2, y2, x3, y3].some((v) => v === null)) return null;
      return { ...base, type: "triangle", x1: x1!, y1: y1!, x2: x2!, y2: y2!, x3: x3!, y3: y3! };
    }
    case "circle": {
      const cx = coord(o.cx), cy = coord(o.cy);
      if (cx === null || cy === null) return null;
      return { ...base, type: "circle", cx, cy, r: num(o.r, 0, 0, 140) };
    }
    case "ellipse": {
      const cx = coord(o.cx), cy = coord(o.cy);
      if (cx === null || cy === null) return null;
      return { ...base, type: "ellipse", cx, cy, rx: num(o.rx, 0, 0, 140), ry: num(o.ry, 0, 0, 140), rotation: isFiniteNum(o.rotation) ? o.rotation : undefined };
    }
    default: return null;
  }
}

/** Validate + normalise raw input into a clean primitive list. Never throws. */
export function validateIconPrimitives(raw: unknown): IconPrimitive[] {
  if (!Array.isArray(raw)) return [];
  const out: IconPrimitive[] = [];
  for (let i = 0; i < raw.length && out.length < MAX_PRIMITIVES; i++) {
    const p = validateOne(raw[i], i);
    if (p) out.push(p);
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────
// Renderer — drawCustomIcon (same signature as IconDrawer)
// ────────────────────────────────────────────────────────────────────

const DEG = Math.PI / 180;

/** Build the SVG path `d` string from validated segments. */
function pathD(segments: PathSeg[], closed: boolean, mx: (n: number) => number, my: (n: number) => number): string {
  const parts: string[] = [];
  for (const s of segments) {
    if (s.t === "M") parts.push(`M ${mx(s.x)} ${my(s.y)}`);
    else if (s.t === "L") parts.push(`L ${mx(s.x)} ${my(s.y)}`);
    else if (s.t === "Q") parts.push(`Q ${mx(s.cx)} ${my(s.cy)} ${mx(s.x)} ${my(s.y)}`);
    else parts.push(`C ${mx(s.c1x)} ${my(s.c1y)} ${mx(s.c2x)} ${my(s.c2y)} ${mx(s.x)} ${my(s.y)}`);
  }
  if (closed) parts.push("Z");
  return parts.join(" ");
}

/** Tangent (dx,dy) of the FIRST segment leaving the move point (points into the path). */
function startTangent(segs: PathSeg[]): [number, number] {
  const p0 = segs[0] as { x: number; y: number };
  const s = segs[1];
  if (!s) return [1, 0];
  if (s.t === "L" || s.t === "M") return [s.x - p0.x, s.y - p0.y];
  if (s.t === "Q") return [s.cx - p0.x, s.cy - p0.y];
  return [s.c1x - p0.x, s.c1y - p0.y];
}
/** Tangent (dx,dy) arriving at the LAST point (points into the endpoint). */
function endTangent(segs: PathSeg[]): [number, number] {
  const last = segs[segs.length - 1];
  const prev = segs[segs.length - 2] as { x: number; y: number };
  if (last.t === "M") return [1, 0];
  if (last.t === "L") return [last.x - prev.x, last.y - prev.y];
  if (last.t === "Q") return [last.x - last.cx, last.y - last.cy];
  return [last.x - last.c2x, last.y - last.c2y];
}

/** An arrowhead marker: tip AT (px,py), pointing along `heading` (radians). */
function arrowNode(
  key: string, px: number, py: number, heading: number, len: number, style: ArrowStyle, colour: string, strokePx: number,
): React.ReactNode {
  const w = len * 0.85;                       // half-spread ≈ len*0.42 each side
  const bx = px - len * Math.cos(heading);
  const by = py - len * Math.sin(heading);
  const perp = heading + Math.PI / 2;
  const lx = bx + (w / 2) * Math.cos(perp), ly = by + (w / 2) * Math.sin(perp);
  const rx = bx - (w / 2) * Math.cos(perp), ry = by - (w / 2) * Math.sin(perp);
  if (style === "filled") {
    return <polygon key={key} points={`${px},${py} ${lx},${ly} ${rx},${ry}`} fill={colour} stroke={colour} strokeWidth={Math.max(0.4, strokePx * 0.5)} strokeLinejoin="round" />;
  }
  return <polyline key={key} points={`${lx},${ly} ${px},${py} ${rx},${ry}`} fill="none" stroke={colour} strokeWidth={Math.max(0.5, strokePx)} strokeLinecap="round" strokeLinejoin="round" />;
}

/**
 * Re-draw a custom icon as live SVG. Same contract as an ICON_DRAWERS entry, so
 * it is a drop-in wherever a built-in drawer is used and composes with
 * renderGlyph()/effectiveIconLayout() unchanged.
 */
export function drawCustomIcon(
  primitives: IconPrimitive[],
  { cx, cy, size, colour }: { cx: number; cy: number; size: number; colour: string },
): React.ReactNode {
  const mx = (n: number) => cx + ((n - 50) / 100) * size;
  const my = (n: number) => cy + ((n - 50) / 100) * size;
  const mlen = (n: number) => (n / 100) * size;
  const msw = (n: number) => Math.max(0.75, (n / 100) * size);

  const ordered = [...primitives].sort((a, b) => a.z - b.z);

  const nodes = ordered.map((p, i) => {
    const paint = p.colourRole === "fixed" && p.colour ? p.colour : colour;
    const sw = msw(p.strokeWidth);
    const stroke = p.strokeWidth > 0 ? paint : "none";
    const fill = p.filled ? paint : "none";
    const common = { stroke, strokeWidth: sw, fill, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
    const key = `p${i}`;

    switch (p.type) {
      case "line": {
        const x1 = mx(p.x1), y1 = my(p.y1), x2 = mx(p.x2), y2 = my(p.y2);
        const arrows: React.ReactNode[] = [];
        if (p.endArrow) {
          const h = p.endArrow.angle != null ? p.endArrow.angle * DEG : Math.atan2(y2 - y1, x2 - x1);
          arrows.push(arrowNode(`${key}ea`, x2, y2, h, mlen(p.endArrow.size), p.endArrow.style, paint, sw));
        }
        if (p.startArrow) {
          const h = p.startArrow.angle != null ? p.startArrow.angle * DEG : Math.atan2(y1 - y2, x1 - x2);
          arrows.push(arrowNode(`${key}sa`, x1, y1, h, mlen(p.startArrow.size), p.startArrow.style, paint, sw));
        }
        return <g key={key}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={sw} strokeLinecap="round" />{arrows}</g>;
      }
      case "path": {
        const d = pathD(p.segments, p.closed, mx, my);
        const arrows: React.ReactNode[] = [];
        const first = p.segments[0] as { x: number; y: number };
        const lastSeg = p.segments[p.segments.length - 1];
        const lastPt = "x" in lastSeg ? { x: lastSeg.x, y: lastSeg.y } : first;
        if (p.endArrow) {
          const [dx, dy] = endTangent(p.segments);
          const h = p.endArrow.angle != null ? p.endArrow.angle * DEG : Math.atan2(dy, dx);
          arrows.push(arrowNode(`${key}ea`, mx(lastPt.x), my(lastPt.y), h, mlen(p.endArrow.size), p.endArrow.style, paint, sw));
        }
        if (p.startArrow) {
          const [dx, dy] = startTangent(p.segments);
          const h = p.startArrow.angle != null ? p.startArrow.angle * DEG : Math.atan2(-dy, -dx);
          arrows.push(arrowNode(`${key}sa`, mx(first.x), my(first.y), h, mlen(p.startArrow.size), p.startArrow.style, paint, sw));
        }
        return <g key={key}><path d={d} {...common} />{arrows}</g>;
      }
      case "rect":
        return <rect key={key} x={mx(p.x)} y={my(p.y)} width={mlen(p.w)} height={mlen(p.h)} rx={p.rx ? mlen(p.rx) : undefined} {...common} />;
      case "triangle":
        return <polygon key={key} points={`${mx(p.x1)},${my(p.y1)} ${mx(p.x2)},${my(p.y2)} ${mx(p.x3)},${my(p.y3)}`} {...common} />;
      case "circle":
        return <circle key={key} cx={mx(p.cx)} cy={my(p.cy)} r={mlen(p.r)} {...common} />;
      case "ellipse": {
        const ecx = mx(p.cx), ecy = my(p.cy);
        const el = <ellipse cx={ecx} cy={ecy} rx={mlen(p.rx)} ry={mlen(p.ry)} {...common} />;
        return p.rotation ? <g key={key} transform={`rotate(${p.rotation} ${ecx} ${ecy})`}>{el}</g> : <g key={key}>{el}</g>;
      }
    }
  });

  return <g>{nodes}</g>;
}

/** Convenience: bind a validated primitive list into an IconDrawer. */
export function customIconDrawer(primitives: IconPrimitive[]): IconDrawer {
  return (opts) => drawCustomIcon(primitives, opts);
}
