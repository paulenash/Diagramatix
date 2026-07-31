import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  validateIconPrimitives,
  drawCustomIcon,
  polygonPoints,
  parallelogramPoints,
  gearPoints,
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

  // T1109 — regular polygon (Pentagon/Hexagon): validated, rendered, geometry.
  it("T1109: polygon primitive — validated (sides clamped), rendered as <polygon>, N vertices", () => {
    const [pent] = validateIconPrimitives([{ type: "polygon", cx: 50, cy: 50, r: 26, sides: 5, rotation: 0, z: 0, strokeWidth: 6, filled: false }]);
    expect(pent.type).toBe("polygon");
    expect((pent as Extract<IconPrimitive, { type: "polygon" }>).sides).toBe(5);
    // sides clamped into 3..12
    const [clamped] = validateIconPrimitives([{ type: "polygon", cx: 50, cy: 50, r: 10, sides: 99, z: 0, strokeWidth: 6, filled: false }]);
    expect((clamped as Extract<IconPrimitive, { type: "polygon" }>).sides).toBe(12);
    // renders a <polygon> with `sides` vertices (comma-separated x,y pairs)
    const svg = draw([{ type: "polygon", cx: 50, cy: 50, r: 26, sides: 6, rotation: 0, z: 0, strokeWidth: 6, filled: false }]);
    expect(svg).toContain("<polygon");
    expect(polygonPoints(50, 50, 26, 6, 0)).toHaveLength(6);
    // rotation 0 → first vertex points straight up (above centre)
    const [vx, vy] = polygonPoints(50, 50, 26, 5, 0)[0];
    expect(Math.round(vx)).toBe(50);
    expect(vy).toBeLessThan(50);
  });

  // T1110 — parallelogram: validated, rendered as <polygon>, 4 slanted vertices.
  it("T1110: parallelogram primitive — validated + rendered with a leaning bottom edge", () => {
    const [pg] = validateIconPrimitives([{ type: "parallelogram", x: 30, y: 35, w: 40, h: 30, slant: 12, z: 0, strokeWidth: 6, filled: false }]);
    expect(pg.type).toBe("parallelogram");
    expect((pg as Extract<IconPrimitive, { type: "parallelogram" }>).slant).toBe(12);
    const pts = parallelogramPoints({ x: 30, y: 35, w: 40, h: 30, slant: 12 });
    // top edge at y=35, bottom edge at y=65 shifted right by slant
    expect(pts).toEqual([[30, 35], [70, 35], [82, 65], [42, 65]]);
    expect(draw([{ type: "parallelogram", x: 30, y: 35, w: 40, h: 30, slant: 12, z: 0, strokeWidth: 6, filled: false }])).toContain("<polygon");
  });

  // T1111 — geared wheel: validated (teeth clamped), 4 vertices per tooth, tips at r+depth/2.
  it("T1111: gear primitive — validated + rendered with 8 chunky teeth", () => {
    const [g] = validateIconPrimitives([{ type: "gear", cx: 50, cy: 50, r: 24, teeth: 8, toothDepth: 14, rotation: 0, z: 0, strokeWidth: 6, filled: false }]);
    expect(g.type).toBe("gear");
    expect((g as Extract<IconPrimitive, { type: "gear" }>).teeth).toBe(8);
    // teeth clamped into 3..24
    const [c] = validateIconPrimitives([{ type: "gear", cx: 50, cy: 50, r: 10, teeth: 99, toothDepth: 5, z: 0, strokeWidth: 6, filled: false }]);
    expect((c as Extract<IconPrimitive, { type: "gear" }>).teeth).toBe(24);
    const pts = gearPoints(50, 50, 24, 8, 14, 0);
    expect(pts).toHaveLength(8 * 4);            // 4 outline vertices per tooth
    // tips reach r + depth/2 = 31 from centre
    const maxRad = Math.max(...pts.map(([x, y]) => Math.hypot(x - 50, y - 50)));
    expect(Math.round(maxRad)).toBe(31);
    expect(draw([{ type: "gear", cx: 50, cy: 50, r: 24, teeth: 8, toothDepth: 14, rotation: 0, z: 0, strokeWidth: 6, filled: false }])).toContain("<polygon");
  });

  // T1112 — dog-eared page (BPMN Data Object): validated + rendered as a folded path.
  it("T1112: document primitive — validated + rendered as a dog-eared <path>", () => {
    const [d] = validateIconPrimitives([{ type: "document", x: 32, y: 26, w: 36, h: 48, fold: 12, z: 0, strokeWidth: 6, filled: false }]);
    expect(d.type).toBe("document");
    expect((d as Extract<IconPrimitive, { type: "document" }>).fold).toBe(12);
    const svg = draw([{ type: "document", x: 32, y: 26, w: 36, h: 48, fold: 12, z: 0, strokeWidth: 6, filled: false }]);
    expect(svg).toContain("<path");           // body + fold crease as one path (two subpaths)
    expect(svg.match(/M /g)?.length).toBeGreaterThanOrEqual(2);
  });

  // T1005 — each primitive renders the expected SVG node type; z-order ascending.
  it("T1005: drawCustomIcon emits the right node per primitive + sorts by z", () => {
    expect(draw([line()] as IconPrimitive[])).toContain("<line");
    expect(draw([{ type: "rect", x: 10, y: 10, w: 20, h: 20, z: 0, strokeWidth: 6, filled: false }])).toContain("<rect");
    expect(draw([{ type: "triangle", x1: 10, y1: 10, x2: 20, y2: 20, x3: 5, y3: 20, z: 0, strokeWidth: 6, filled: false }])).toContain("<polygon");
    expect(draw([{ type: "circle", cx: 50, cy: 50, r: 10, z: 0, strokeWidth: 6, filled: false }])).toContain("<circle");
    expect(draw([{ type: "ellipse", cx: 50, cy: 50, rx: 20, ry: 10, z: 0, strokeWidth: 6, filled: false }])).toContain("<ellipse");
    expect(draw([{ type: "path", closed: false, segments: [{ t: "M", x: 0, y: 0 }, { t: "L", x: 50, y: 50 }], z: 0, strokeWidth: 6, filled: false }])).toContain("<path");
    expect(draw([{ type: "arc", cx: 50, cy: 50, r: 20, a0: 180, a1: 360, z: 0, strokeWidth: 6, filled: false }])).toContain("<path"); // arc → path with A command
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

  // T1014 — fill modes: none=transparent, ink=theme colour, background=opaque mask (bg).
  it("T1014: fillRole background paints the bg (mask); ink paints the theme colour", () => {
    const rect = (extra: Partial<IconPrimitive>) => ({ type: "rect", x: 10, y: 10, w: 20, h: 20, z: 0, strokeWidth: 0, filled: true, ...extra } as IconPrimitive);
    const opts = { cx: 50, cy: 50, size: 100, colour: "#111111", bg: "#abcdef" };
    expect(renderToStaticMarkup(drawCustomIcon([rect({ fillRole: "background" })], opts) as React.ReactElement)).toContain('fill="#abcdef"');
    expect(renderToStaticMarkup(drawCustomIcon([rect({ fillRole: "ink" })], opts) as React.ReactElement)).toContain('fill="#111111"');
    expect(renderToStaticMarkup(drawCustomIcon([rect({ filled: false })], opts) as React.ReactElement)).toContain('fill="none"');
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
