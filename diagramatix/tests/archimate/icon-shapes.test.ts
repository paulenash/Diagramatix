import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  validateIconPrimitives,
  drawCustomIcon,
  type IconPrimitive,
} from "@/app/lib/archimate/iconShapes";

const line = (o: Partial<IconPrimitive> = {}): unknown => ({ type: "line", x1: 0, y1: 0, x2: 100, y2: 0, z: 0, strokeWidth: 6, filled: false, ...o });
const draw = (prims: IconPrimitive[], opts = { cx: 50, cy: 50, size: 100, colour: "#111" }) =>
  renderToStaticMarkup(drawCustomIcon(prims, opts) as React.ReactElement);

describe("Custom icon shapes (Icon Library)", () => {
  // T1003 — validator drops malformed, keeps the valid remainder.
  it("T1003: validateIconPrimitives drops bad primitives and keeps good ones", () => {
    expect(validateIconPrimitives("nope" as unknown)).toEqual([]);
    expect(validateIconPrimitives([line({ x2: NaN })])).toEqual([]);            // non-finite coord → dropped
    expect(validateIconPrimitives([{ type: "path", segments: [{ t: "M", x: 0, y: 0 }] }])).toEqual([]); // <2 pts → dropped
    const mixed = validateIconPrimitives([line(), line({ y2: Infinity })]);
    expect(mixed).toHaveLength(1);
  });

  // T1004 — validator normalises fields.
  it("T1004: validator coerces filled/z, drops bad colourRole, clamps strokeWidth", () => {
    const [p] = validateIconPrimitives([line({ filled: 1 as unknown as boolean, strokeWidth: 999, colourRole: "foo" as never })]);
    expect(p.filled).toBe(true);
    expect(p.strokeWidth).toBe(40);           // clamped
    expect(p.colourRole).toBeUndefined();       // invalid role dropped
    const [q] = validateIconPrimitives([line({ colourRole: "fixed" })]); // fixed w/o hex
    expect(q.colourRole).toBe("stroke");        // downgraded to theme
  });

  // T1005 — each primitive renders the expected SVG node type; z-order ascending.
  it("T1005: drawCustomIcon emits the right node per primitive + sorts by z", () => {
    expect(draw([line()] as IconPrimitive[])).toContain("<line");
    expect(draw([{ type: "rect", x: 10, y: 10, w: 20, h: 20, z: 0, strokeWidth: 6, filled: false }])).toContain("<rect");
    expect(draw([{ type: "triangle", x1: 10, y1: 10, x2: 20, y2: 20, x3: 5, y3: 20, z: 0, strokeWidth: 6, filled: false }])).toContain("<polygon");
    expect(draw([{ type: "circle", cx: 50, cy: 50, r: 10, z: 0, strokeWidth: 6, filled: false }])).toContain("<circle");
    expect(draw([{ type: "ellipse", cx: 50, cy: 50, rx: 20, ry: 10, z: 0, strokeWidth: 6, filled: false }])).toContain("<ellipse");
    expect(draw([{ type: "path", closed: false, segments: [{ t: "M", x: 0, y: 0 }, { t: "L", x: 50, y: 50 }], z: 0, strokeWidth: 6, filled: false }])).toContain("<path");
    // z-order: rect z0 must render before circle z1
    const m = draw([
      { type: "circle", cx: 50, cy: 50, r: 10, z: 1, strokeWidth: 6, filled: false },
      { type: "rect", x: 10, y: 10, w: 20, h: 20, z: 0, strokeWidth: 6, filled: false },
    ]);
    expect(m.indexOf("<rect")).toBeLessThan(m.indexOf("<circle"));
  });

  // T1006 — arrowheads render + orientable angle changes the marker.
  it("T1006: arrowheads emit a marker; angle override changes it", () => {
    expect(draw([line({ endArrow: { style: "filled", size: 8 } })] as IconPrimitive[])).toContain("<polygon");
    expect(draw([line({ endArrow: { style: "open", size: 8 } })] as IconPrimitive[])).toContain("<polyline");
    const a0 = draw([line({ endArrow: { style: "filled", size: 8, angle: 0 } })] as IconPrimitive[]);
    const a90 = draw([line({ endArrow: { style: "filled", size: 8, angle: 90 } })] as IconPrimitive[]);
    expect(a0).not.toEqual(a90);
  });

  // T1007 — normalised coords map into {cx,cy,size}; strokeWidth scales with a floor.
  it("T1007: coordinate mapping + strokeWidth scaling", () => {
    // circle at normalised centre (50,50) → element centre (cx,cy)
    const c = draw([{ type: "circle", cx: 50, cy: 50, r: 0, z: 0, strokeWidth: 6, filled: false }], { cx: 100, cy: 100, size: 80, colour: "#111" });
    expect(c).toContain('cx="100"');
    expect(c).toContain('cy="100"');
    expect(c).toContain('stroke-width="4.8"'); // 6/100*80
    // point at normalised (100,50) → cx + size/2
    const l = draw([line({ x1: 100, y1: 50, x2: 100, y2: 50 })] as IconPrimitive[], { cx: 100, cy: 100, size: 80, colour: "#111" });
    expect(l).toContain('x1="140"'); // 100 + (100-50)/100*80
    // strokeWidth floor at 0.75
    const f = draw([{ type: "circle", cx: 50, cy: 50, r: 1, z: 0, strokeWidth: 0.1, filled: false }], { cx: 10, cy: 10, size: 10, colour: "#111" });
    expect(f).toContain('stroke-width="0.75"');
  });
});
