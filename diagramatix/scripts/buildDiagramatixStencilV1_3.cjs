/**
 * Build BPMN Diagramatix Shapes v1.3.vssx — rebuilt from scratch (drop BPMN_M).
 *
 * v1.0–v1.2 patched Microsoft's BPMN_M template masters to recolour and resize
 * them. The patching repeatedly failed for Gateway, Events, Data Object, and
 * Data Store: shapes drag-dropped from the stencil paint white, ignoring our
 * baked GUARD(RGB(...)) overrides. Beyond colour, the shapes themselves are
 * Microsoft-styled (multi-state events with right-click action menus, oversized
 * gateway, complex Sheet.5/9 fill chains).
 *
 * v1.3 rebuilds the nine Diagramatix-symbol masters from scratch using the
 * minimal Visio-XML pattern that Task and Sub-Process *already use successfully*:
 * single Group root + body Shape with FillStyle='3', plain RGB(...) on
 * FillForegnd, FillPattern V='1', and one Geometry IX='0' section per body.
 * Event masters carry extra Geometry IX=0/1/2 sections on the Group root for
 * the Error/Cancel/Conditional trigger markers that the runtime export's
 * ROOT_MARKER_IX_MAP toggles via NoShow.
 *
 * Source: public/bpmn-stencil-v3.vssx (BPMN_M base — used for Visio container
 *         plumbing: [Content_Types].xml, document.xml stylesheets, theme,
 *         masters.xml metadata, and the connector / annotation / pool-lane
 *         masters that we don't rewrite).
 * Output: public/BPMN Diagramatix Shapes v1.3.vssx
 *
 *   node scripts/buildDiagramatixStencilV1_3.cjs
 */
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const SRC = path.join(__dirname, "..", "public", "bpmn-stencil-v3.vssx");
const DST = path.join(__dirname, "..", "public", "BPMN Diagramatix Shapes v1.3.vssx");

// Mirrors DEFAULT_SYMBOL_COLORS in app/lib/diagram/colors.ts.
const COLOURS = {
  task:                 "#fef9c3",
  gateway:              "#f3e8ff",
  "start-event":        "#dcfce7",
  "intermediate-event": "#fed7aa",
  "end-event":          "#fca5a5",
  subprocess:           "#fef08a",
  "subprocess-expanded":"#fef4a7",
  "data-object":        "#bfdbfe",
  "data-store":         "#60a5fa",
  pool:                 "#c8956a",
  lane:                 "#e8c4a0",
};

const STROKE_HEX = "#374151"; // Diagramatix line colour (gray-700)

const PX = 96;
const px2in = (px) => px / PX;

// Fixed Visio sizes per element type, converted from Diagramatix px → inches.
const SIZE_PX = {
  task:                 { w: 102, h:  65 },
  gateway:              { w:  40, h:  40 },
  "start-event":        { w:  36, h:  36 },
  "intermediate-event": { w:  36, h:  36 },
  "end-event":          { w:  36, h:  36 },
  subprocess:           { w: 108, h:  72 },
  "subprocess-expanded":{ w: 180, h: 108 },
  "data-object":        { w:  36, h:  46 },
  "data-store":         { w:  50, h:  40 },
};

function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

// Plain `RGB(r,g,b)` — not GUARD-wrapped. Mirrors the v1.0 Task bake which
// is the only known-working Diagramatix-coloured drop pattern.
function rgbF(hex) {
  const { r, g, b } = hexToRgb(hex);
  return `RGB(${r},${g},${b})`;
}

function fillCells(hex) {
  return (
    `<Cell N='FillForegnd' V='${hex}' F='${rgbF(hex)}'/>` +
    `<Cell N='FillPattern' V='1' F='RGB(0,0,0)*0+1'/>`
  );
}

// Cells common to the Group root (Shape 5) — mirrors what Task's master1.xml
// uses, minus Microsoft's Action menus and User properties (we don't need
// the right-click "Loop", "Trigger", etc. menus — Diagramatix is the editor).
function groupRootCells(w, h) {
  const wHalf = (w / 2).toFixed(7);
  const hHalf = (h / 2).toFixed(7);
  const wStr  = w.toFixed(7);
  const hStr  = h.toFixed(7);
  return (
    `<Cell N='PinX' V='${(w * 2).toFixed(7)}'/>` +
    `<Cell N='PinY' V='${(h * 2).toFixed(7)}'/>` +
    `<Cell N='Width' V='${wStr}' U='MM' F='User.DefaultWidth'/>` +
    `<Cell N='Height' V='${hStr}' U='MM' F='User.DefaultHeight'/>` +
    `<Cell N='LocPinX' V='${wHalf}' U='MM' F='Width*0.5'/>` +
    `<Cell N='LocPinY' V='${hHalf}' U='MM' F='Height*0.5'/>` +
    `<Cell N='Angle' V='0'/><Cell N='FlipX' V='0'/><Cell N='FlipY' V='0'/>` +
    `<Cell N='ResizeMode' V='0'/>` +
    `<Cell N='LockGroup' V='1'/>` +
    `<Cell N='LockCalcWH' V='1'/>` +
    `<Cell N='LayerMember' V='0'/>` +
    `<Cell N='SelectMode' V='0'/>` +
    // Text positioning — centred.
    `<Cell N='TxtPinX' V='${wHalf}' U='MM' F='Width*0.5'/>` +
    `<Cell N='TxtPinY' V='${hHalf}' U='MM' F='Height*0.5'/>` +
    `<Cell N='TxtWidth' V='${wStr}' U='MM' F='Width'/>` +
    `<Cell N='TxtHeight' V='${hStr}' U='MM' F='Height'/>` +
    `<Cell N='TxtLocPinX' V='${wHalf}' U='MM' F='TxtWidth*0.5'/>` +
    `<Cell N='TxtLocPinY' V='${hHalf}' U='MM' F='TxtHeight*0.5'/>` +
    `<Cell N='VerticalAlign' V='1'/>` +
    `<Cell N='LineWeight' V='0.003333' U='PT' F='GUARD(0.24PT)'/>` +
    `<Cell N='LinePattern' V='1' F='GUARD(1)'/>` +
    `<Cell N='BeginArrow' V='0' F='GUARD(0)'/>` +
    `<Cell N='EndArrow' V='0' F='GUARD(0)'/>` +
    `<Cell N='ShdwPattern' V='0' F='GUARD(0)'/>`
  );
}

function userSection(w, h) {
  const wStr = w.toFixed(7);
  const hStr = h.toFixed(7);
  return (
    `<Section N='User'>` +
    `<Row N='DefaultWidth'><Cell N='Value' V='${wStr}' U='MM' F='${wStr}*25.4MM*DropOnPageScale'/><Cell N='Prompt' V=''/></Row>` +
    `<Row N='DefaultHeight'><Cell N='Value' V='${hStr}' U='MM' F='${hStr}*25.4MM*DropOnPageScale'/><Cell N='Prompt' V=''/></Row>` +
    `</Section>`
  );
}

// Connection points — top, right, bottom, left at side midpoints.
function connectionSection(w, h) {
  return (
    `<Section N='Connection'>` +
    `<Row IX='1'><Cell N='X' V='${(w/2).toFixed(7)}' F='Width*0.5'/><Cell N='Y' V='${h.toFixed(7)}' F='Height*1'/><Cell N='DirX' V='0'/><Cell N='DirY' V='1'/><Cell N='Type' V='0'/><Cell N='AutoGen' V='0'/></Row>` +
    `<Row IX='2'><Cell N='X' V='${w.toFixed(7)}' F='Width*1'/><Cell N='Y' V='${(h/2).toFixed(7)}' F='Height*0.5'/><Cell N='DirX' V='1'/><Cell N='DirY' V='0'/><Cell N='Type' V='0'/><Cell N='AutoGen' V='0'/></Row>` +
    `<Row IX='3'><Cell N='X' V='${(w/2).toFixed(7)}' F='Width*0.5'/><Cell N='Y' V='0'/><Cell N='DirX' V='0'/><Cell N='DirY' V='-1'/><Cell N='Type' V='0'/><Cell N='AutoGen' V='0'/></Row>` +
    `<Row IX='4'><Cell N='X' V='0'/><Cell N='Y' V='${(h/2).toFixed(7)}' F='Height*0.5'/><Cell N='DirX' V='-1'/><Cell N='DirY' V='0'/><Cell N='Type' V='0'/><Cell N='AutoGen' V='0'/></Row>` +
    `</Section>`
  );
}

// Body sub-shape opening — Shape ID drawn over the Group root.
// `extraCells`: additional Cell elements before the Geometry section
// (e.g. Rounding for rectangles).
function bodyShapeOpen(id, w, h, hex, opts = {}) {
  const {
    lineWeightPt = 1.125,    // pt — Diagramatix default 1.5px ≈ 1.125pt
    roundingPx = 0,
    noFill = false,
    lineDash = false,
    extraCells = "",
  } = opts;
  const wHalf = (w / 2).toFixed(7);
  const hHalf = (h / 2).toFixed(7);
  const fill = noFill
    ? `<Cell N='FillPattern' V='0' F='GUARD(0)'/>`
    : fillCells(hex);
  const lineWeightIn = (lineWeightPt / 72).toFixed(7);
  const linePattern = lineDash ? 2 : 1;
  const rounding = roundingPx > 0
    ? `<Cell N='Rounding' V='${px2in(roundingPx).toFixed(7)}' U='MM' F='GUARD(${px2in(roundingPx).toFixed(7)}*25.4MM)'/>`
    : "";
  return (
    `<Shape ID='${id}' Type='Shape' LineStyle='3' FillStyle='3' TextStyle='3'>` +
    `<Cell N='PinX' V='${wHalf}' U='MM' F='Sheet.5!Width*0.5'/>` +
    `<Cell N='PinY' V='${hHalf}' U='MM' F='Sheet.5!Height*0.5'/>` +
    `<Cell N='Width' V='${w.toFixed(7)}' U='MM' F='Sheet.5!Width*1'/>` +
    `<Cell N='Height' V='${h.toFixed(7)}' U='MM' F='Sheet.5!Height*1'/>` +
    `<Cell N='LocPinX' V='${wHalf}' U='MM' F='Width*0.5'/>` +
    `<Cell N='LocPinY' V='${hHalf}' U='MM' F='Height*0.5'/>` +
    `<Cell N='Angle' V='0'/><Cell N='FlipX' V='0'/><Cell N='FlipY' V='0'/>` +
    `<Cell N='ResizeMode' V='0'/>` +
    `<Cell N='LayerMember' V='0'/>` +
    fill +
    `<Cell N='LineWeight' V='${lineWeightIn}' U='PT' F='GUARD(${lineWeightPt}PT)'/>` +
    `<Cell N='LinePattern' V='${linePattern}' F='GUARD(${linePattern})'/>` +
    `<Cell N='LineColor' V='${STROKE_HEX}' F='GUARD(${rgbF(STROKE_HEX)})'/>` +
    rounding +
    `<Cell N='LockTextEdit' V='1'/>` +
    extraCells
  );
}

// ── Geometry helpers ─────────────────────────────────────────────────

const GEOM_PROPS = `<Cell N='NoFill' V='0'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/><Cell N='NoQuickDrag' V='0' F='No Formula'/>`;
const GEOM_PROPS_NOFILL = `<Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/><Cell N='NoQuickDrag' V='0' F='No Formula'/>`;
const GEOM_PROPS_HIDDEN = `<Cell N='NoFill' V='0'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='1'/><Cell N='NoSnap' V='0'/><Cell N='NoQuickDrag' V='0' F='No Formula'/>`;
const GEOM_PROPS_HIDDEN_NOFILL = `<Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='1'/><Cell N='NoSnap' V='0'/><Cell N='NoQuickDrag' V='0' F='No Formula'/>`;

// Generate one MoveTo/LineTo Row with V in inches (V = frac * dim) and F as
// `Width*frac` / `Height*frac` formulas.  Mirrors the format the BPMN_M
// template uses (Task / Sub-Process Geometry rows are MoveTo/LineTo with
// inch-valued V and Width*frac / Height*frac formulas).
function vertexRow(rowTag, ix, w, h, xFrac, yFrac) {
  const xVal = (xFrac * w).toFixed(7);
  const yVal = (yFrac * h).toFixed(7);
  const xF = xFrac === 0 ? "Width*0" : xFrac === 1 ? "Width*1" : `Width*${xFrac}`;
  const yF = yFrac === 0 ? "Height*0" : yFrac === 1 ? "Height*1" : `Height*${yFrac}`;
  return (
    `<Row T='${rowTag}' IX='${ix}'>` +
    `<Cell N='X' V='${xVal}' U='MM' F='${xF}'/>` +
    `<Cell N='Y' V='${yVal}' U='MM' F='${yF}'/>` +
    `</Row>`
  );
}

// Rectangle Geometry — for Task / Subprocess / Subprocess-Expanded.
// `Rounding` cell on the parent Shape handles the rounded corners.
// Visio Y is bottom-up; we trace clockwise from bottom-left so the closed
// polygon's interior matches the conventional visual.
function rectGeom(w, h, ix = 0, propsCells = GEOM_PROPS) {
  return (
    `<Section N='Geometry' IX='${ix}'>` +
    propsCells +
    vertexRow("MoveTo", 1, w, h, 0, 0) +
    vertexRow("LineTo", 2, w, h, 1, 0) +
    vertexRow("LineTo", 3, w, h, 1, 1) +
    vertexRow("LineTo", 4, w, h, 0, 1) +
    vertexRow("LineTo", 5, w, h, 0, 0) +
    `</Section>`
  );
}

// Diamond Geometry — Gateway. Visio Y is bottom-up so top vertex has Y=h.
function diamondGeom(w, h, ix = 0) {
  return (
    `<Section N='Geometry' IX='${ix}'>` +
    GEOM_PROPS +
    vertexRow("MoveTo", 1, w, h, 0.5, 1) +
    vertexRow("LineTo", 2, w, h, 1,   0.5) +
    vertexRow("LineTo", 3, w, h, 0.5, 0) +
    vertexRow("LineTo", 4, w, h, 0,   0.5) +
    vertexRow("LineTo", 5, w, h, 0.5, 1) +
    `</Section>`
  );
}

// Ellipse Geometry — full circle.  `xFrac/yFrac` are centre fractions of W/H.
// `aFrac/bFrac/cFrac/dFrac` define the two axes (Visio Ellipse row format:
// X,Y = centre; A,B = end of major axis; C,D = end of minor axis).
function ellipseGeom(w, h, ix, xFrac, yFrac, aFrac, bFrac, cFrac, dFrac, propsCells = GEOM_PROPS) {
  const cellX = `<Cell N='X' V='${(xFrac * w).toFixed(7)}' U='MM' F='Width*${xFrac}'/>`;
  const cellY = `<Cell N='Y' V='${(yFrac * h).toFixed(7)}' U='MM' F='Height*${yFrac}'/>`;
  const cellA = `<Cell N='A' V='${(aFrac * w).toFixed(7)}' U='MM' F='Width*${aFrac}'/>`;
  const cellB = `<Cell N='B' V='${(bFrac * h).toFixed(7)}' U='MM' F='Height*${bFrac}'/>`;
  const cellC = `<Cell N='C' V='${(cFrac * w).toFixed(7)}' U='MM' F='Width*${cFrac}'/>`;
  const cellD = `<Cell N='D' V='${(dFrac * h).toFixed(7)}' U='MM' F='Height*${dFrac}'/>`;
  return (
    `<Section N='Geometry' IX='${ix}'>` +
    propsCells +
    `<Row T='Ellipse' IX='1'>${cellX}${cellY}${cellA}${cellB}${cellC}${cellD}</Row>` +
    `</Section>`
  );
}

// Full circle covering the body bounds.
function fullCircleGeom(w, h, ix = 0, propsCells = GEOM_PROPS) {
  return ellipseGeom(w, h, ix, 0.5, 0.5, 1, 0.5, 0.5, 1, propsCells);
}

// Inner concentric circle with a `pad` px inset.  Used for Intermediate Event.
function innerCircleGeom(w, h, padPx, ix = 0, propsCells = GEOM_PROPS_NOFILL) {
  const padFracW = padPx / w;
  const padFracH = padPx / h;
  const xCentre = 0.5;
  const yCentre = 0.5;
  const aXEnd   = 1 - padFracW;
  const cYEnd   = 1 - padFracH;
  return ellipseGeom(w, h, ix, xCentre, yCentre, aXEnd, yCentre, xCentre, cYEnd, propsCells);
}

// Data Object body polygon — top-right fold cut out.  Visio Y is bottom-up
// (so screen-top vertices have Y = 1.0 in fractional coords).
function dataObjectBodyGeom(w, h, foldIn, ix = 0) {
  const foldFracW = foldIn / w;
  const foldFracH = foldIn / h;
  return (
    `<Section N='Geometry' IX='${ix}'>` +
    GEOM_PROPS +
    vertexRow("MoveTo", 1, w, h, 0,                 1) +              // top-left (Visio coords: y=h)
    vertexRow("LineTo", 2, w, h, 1 - foldFracW,     1) +              // top edge, before fold
    vertexRow("LineTo", 3, w, h, 1,                 1 - foldFracH) +  // fold tip
    vertexRow("LineTo", 4, w, h, 1,                 0) +              // bottom-right
    vertexRow("LineTo", 5, w, h, 0,                 0) +              // bottom-left
    vertexRow("LineTo", 6, w, h, 0,                 1) +              // close
    `</Section>`
  );
}

// Data Object fold-corner triangle — slightly darker shade for visual depth.
function dataObjectFoldGeom(w, h, foldIn, ix = 1) {
  const foldFracW = foldIn / w;
  const foldFracH = foldIn / h;
  return (
    `<Section N='Geometry' IX='${ix}'>` +
    GEOM_PROPS +
    vertexRow("MoveTo", 1, w, h, 1 - foldFracW, 1) +
    vertexRow("LineTo", 2, w, h, 1,             1 - foldFracH) +
    vertexRow("LineTo", 3, w, h, 1 - foldFracW, 1 - foldFracH) +
    vertexRow("LineTo", 4, w, h, 1 - foldFracW, 1) +
    `</Section>`
  );
}

// Cylinder body (Data Store): rectangle sides + bottom-half ellipse for the
// curved bottom + top-half ellipse for the cylinder's underside-of-rim.
// The full top ellipse (the cylinder's rim seen from above) is drawn as a
// SEPARATE filled Geometry section on top.
//
// Visio EllipticalArcTo row: X,Y=end of arc; A,B=control point on arc; C=angle
// of axis from X; D=aspect (minor/major).
//
// Path (Visio coords, Y bottom-up):
//   start at (0, h-ry)            [top-left, just under the top rim]
//   line to (0, ry)                [bottom-left, just above the bottom curve]
//   ellipticalArc to (w, ry)       [front of bottom rim — half-ellipse]
//   line to (w, h-ry)              [right side, up to under the top rim]
//   ellipticalArc to (0, h-ry)     [back of top rim — half-ellipse — closes path]
function arcRow(ix, w, h, xFrac, yFrac, aFrac, bFrac, aspectRatio) {
  return (
    `<Row T='EllipticalArcTo' IX='${ix}'>` +
    `<Cell N='X' V='${(xFrac * w).toFixed(7)}' U='MM' F='Width*${xFrac}'/>` +
    `<Cell N='Y' V='${(yFrac * h).toFixed(7)}' U='MM' F='Height*${yFrac}'/>` +
    `<Cell N='A' V='${(aFrac * w).toFixed(7)}' U='MM' F='Width*${aFrac}'/>` +
    `<Cell N='B' V='${(bFrac * h).toFixed(7)}' U='MM' F='Height*${bFrac}'/>` +
    `<Cell N='C' V='0'/>` +
    `<Cell N='D' V='${aspectRatio.toFixed(7)}'/>` +
    `</Row>`
  );
}

function cylinderBodyGeom(w, h, ryIn, ix = 0) {
  const ryFrac = ryIn / h;
  // Aspect = vertical radius / horizontal radius. Vert = ry (in inches),
  // horiz = w/2 (in inches).  Both same units → aspect is dimensionless.
  const aspect = ryIn / (w / 2);
  return (
    `<Section N='Geometry' IX='${ix}'>` + GEOM_PROPS +
    vertexRow("MoveTo", 1, w, h, 0, 1 - ryFrac) +    // top-left under top rim
    vertexRow("LineTo", 2, w, h, 0, ryFrac) +         // bottom-left above bottom curve
    arcRow(3, w, h, 1, ryFrac, 0.5, 0, aspect) +      // bottom-front half via (w/2, 0)
    vertexRow("LineTo", 4, w, h, 1, 1 - ryFrac) +     // right side up
    arcRow(5, w, h, 0, 1 - ryFrac, 0.5, 1, aspect) +  // top-back half via (w/2, h)
    `</Section>`
  );
}

// Top ellipse (the cylinder's rim seen from above) — full ellipse, filled
// with the body colour, drawn ON TOP of the body so the front half of the
// rim (the visible curve) shows.
function cylinderTopGeom(w, h, ryPx, ix = 1) {
  const ryFrac = ryPx / h;
  return ellipseGeom(w, h, ix,
    0.5, 1 - ryFrac,
    1,   1 - ryFrac,
    0.5, 1,
    GEOM_PROPS,
  );
}

// Bottom-half stroke arc (NoFill='1', NoLine='0') at a given Y fraction.
// Used for the additional "disc" lines inside the data-store cylinder.
function cylinderBottomCurveGeom(w, h, ryIn, atYFrac, ix) {
  const ryFrac = ryIn / h;
  const aspect = ryIn / (w / 2);
  return (
    `<Section N='Geometry' IX='${ix}'>` + GEOM_PROPS_NOFILL +
    vertexRow("MoveTo", 1, w, h, 0, atYFrac) +
    arcRow(2, w, h, 1, atYFrac, 0.5, atYFrac - ryFrac, aspect) +
    `</Section>`
  );
}

// ── Trigger-marker geometries on Group root (Shape 5) ─────────────────
// All marker geoms default NoShow='1' — runtime export flips NoShow='0'
// on the instance via ROOT_MARKER_IX_MAP { Error: 0, Cancel: 1, Conditional: 2 }.

// Error: 6-vertex lightning bolt centred at (0.5, 0.5).  Mirrors
// SymbolRenderer.tsx case "error" (line 290–303).
function errorMarkerGeom(w, h, ix = 0) {
  // SymbolRenderer uses s = r * 0.55 where r ≈ width/2 (event circle radius
  // minus event marker margin).  For a 36×36 event the half-extent s ≈ 9.9.
  // In master-fractional coords centred on (0.5, 0.5):
  //   s_frac ≈ 9.9 / 36 ≈ 0.275.
  // The bolt is asymmetric.  Vertices in screen Y top-down (paste from
  // SymbolRenderer):
  //    P0: (-1.00,  0.95)   bottom-left
  //    P1: (-0.25,  0.00)   left kink
  //    P2: ( 0.53,  0.89)   inner bottom-right
  //    P3: ( 1.00, -0.95)   top-right tip
  //    P4: ( 0.40,  0.22)   inner right kink
  //    P5: (-0.33, -0.74)   upper-left inner
  // (each value is a multiple of `s`).
  // Convert to Visio fractional coords (centre 0.5, Y bottom-up):
  //   x_frac = 0.5 + xMul * 0.275
  //   y_frac = 0.5 - yMul * 0.275   (Y inverted)
  const s = 0.275;
  const verts = [
    { xm: -1.00, ym:  0.95 },
    { xm: -0.25, ym:  0.00 },
    { xm:  0.53, ym:  0.89 },
    { xm:  1.00, ym: -0.95 },
    { xm:  0.40, ym:  0.22 },
    { xm: -0.33, ym: -0.74 },
  ];
  const rows = verts.map((p, i) => {
    const xf = 0.5 + p.xm * s;
    const yf = 0.5 - p.ym * s;
    return vertexRow(i === 0 ? "MoveTo" : "LineTo", i + 1, w, h, xf, yf);
  });
  // Close back to vertex 0.
  const xf0 = 0.5 + verts[0].xm * s;
  const yf0 = 0.5 - verts[0].ym * s;
  const close = vertexRow("LineTo", verts.length + 1, w, h, xf0, yf0);
  return (
    `<Section N='Geometry' IX='${ix}'>` + GEOM_PROPS_HIDDEN + rows.join("") + close + `</Section>`
  );
}

// Cancel: symmetric 12-vertex X.  Mirrors SymbolRenderer.tsx case "cancel"
// (line 325–344).  Centre (0.5, 0.5), half-extent cs ≈ 0.275.
function cancelMarkerGeom(w, h, ix = 1) {
  const cs = 0.275;
  const c = 0.5;
  // Vertices clockwise from top inner notch.  Screen Y top-down → Visio
  // Y bottom-up: invert relative to centre.
  const verts = [
    { dx:  0,            dy: -cs * 0.3 },  // top inner notch (screen) → bottom in Visio? wait
    { dx:  cs * 0.7,     dy: -cs },
    { dx:  cs,           dy: -cs * 0.7 },
    { dx:  cs * 0.3,     dy:  0 },
    { dx:  cs,           dy:  cs * 0.7 },
    { dx:  cs * 0.7,     dy:  cs },
    { dx:  0,            dy:  cs * 0.3 },
    { dx: -cs * 0.7,     dy:  cs },
    { dx: -cs,           dy:  cs * 0.7 },
    { dx: -cs * 0.3,     dy:  0 },
    { dx: -cs,           dy: -cs * 0.7 },
    { dx: -cs * 0.7,     dy: -cs },
  ];
  // SymbolRenderer screen Y is top-down; Visio Y is bottom-up.  Invert dy.
  const rows = verts.map((p, i) => {
    const xf = c + p.dx;
    const yf = c - p.dy;
    return vertexRow(i === 0 ? "MoveTo" : "LineTo", i + 1, w, h, xf, yf);
  });
  // Close path back to vertex 0.
  const xf0 = c + verts[0].dx;
  const yf0 = c - verts[0].dy;
  const close = vertexRow("LineTo", verts.length + 1, w, h, xf0, yf0);
  return (
    `<Section N='Geometry' IX='${ix}'>` + GEOM_PROPS_HIDDEN + rows.join("") + close + `</Section>`
  );
}

// Conditional: 3 horizontal lines inside a small rectangle.  Mirrors
// SymbolRenderer.tsx case "conditional" (line 360–369).  We render this
// as a combined polyline (rect outline + 3 internal lines) using multiple
// MoveTo / LineTo segments.  NoFill='1' so it's stroke-only.
function conditionalMarkerGeom(w, h, ix = 2) {
  // Bounding rect in fractional master coords, centred on 0.5.
  // SymbolRenderer: x = cx - s*0.65, y = cy - s*0.75, w = s*1.3, h = s*1.5
  // where s ≈ r * 0.55 ≈ 0.275 of master width.
  // → bounding rect: width = 0.275*1.3 = 0.358, height = 0.275*1.5 = 0.413
  const s = 0.275;
  const halfW = s * 0.65;
  const halfH = s * 0.75;
  // Visio bottom-up: invert vertical relative to 0.5.
  const xL = 0.5 - halfW;
  const xR = 0.5 + halfW;
  const yT = 0.5 + halfH; // screen top → Visio top
  const yB = 0.5 - halfH;
  // 3 horizontal lines at screen y - 0.35, 0, +0.35 of s → Visio y +0.35*s, 0, -0.35*s offset from centre
  const lineYs = [0.5 + s * 0.35, 0.5, 0.5 - s * 0.35];
  // Inner line endpoints — SymbolRenderer uses x = cx ± s * 0.4
  const innerL = 0.5 - s * 0.4;
  const innerR = 0.5 + s * 0.4;
  let rows = "";
  let ix2 = 1;
  // Outer rect
  rows += vertexRow("MoveTo", ix2++, w, h, xL, yB);
  rows += vertexRow("LineTo", ix2++, w, h, xR, yB);
  rows += vertexRow("LineTo", ix2++, w, h, xR, yT);
  rows += vertexRow("LineTo", ix2++, w, h, xL, yT);
  rows += vertexRow("LineTo", ix2++, w, h, xL, yB);
  // 3 internal horizontal lines
  for (const ly of lineYs) {
    rows += vertexRow("MoveTo", ix2++, w, h, innerL, ly);
    rows += vertexRow("LineTo", ix2++, w, h, innerR, ly);
  }
  return (
    `<Section N='Geometry' IX='${ix}'>` + GEOM_PROPS_HIDDEN_NOFILL + rows + `</Section>`
  );
}

// ── Per-master XML builders ──────────────────────────────────────────

const XML_HEADER = `<?xml version='1.0' encoding='utf-8' ?>\n` +
  `<MasterContents xmlns='http://schemas.microsoft.com/office/visio/2012/main' xmlns:r='http://schemas.openxmlformats.org/officeDocument/2006/relationships' xml:space='preserve'>`;
const XML_FOOTER = `</MasterContents>`;

// Wraps Group root + body in a Shapes container.
function masterXml(rootInnerCells, rootGeometriesXml, bodyShapesXml) {
  return (
    XML_HEADER +
    `<Shapes>` +
      `<Shape ID='5' Type='Group' LineStyle='3' FillStyle='3' TextStyle='3'>` +
        rootInnerCells +
        rootGeometriesXml +
        `<Shapes>` +
          bodyShapesXml +
        `</Shapes>` +
      `</Shape>` +
    `</Shapes>` +
    XML_FOOTER
  );
}

function buildTask() {
  const { w: wPx, h: hPx } = SIZE_PX.task;
  const w = px2in(wPx), h = px2in(hPx);
  const root = groupRootCells(w, h) + userSection(w, h) + connectionSection(w, h);
  const body = bodyShapeOpen(6, w, h, COLOURS.task, { lineWeightPt: 1.125, roundingPx: 4 }) +
    rectGeom(w, h) + `</Shape>`;
  return masterXml(root, "", body);
}

function buildGateway() {
  const { w: wPx, h: hPx } = SIZE_PX.gateway;
  const w = px2in(wPx), h = px2in(hPx);
  const root = groupRootCells(w, h) + userSection(w, h) + connectionSection(w, h);
  const body = bodyShapeOpen(6, w, h, COLOURS.gateway, { lineWeightPt: 1.125 }) +
    diamondGeom(w, h) + `</Shape>`;
  return masterXml(root, "", body);
}

function buildEvent(typeKey, lineWeightPt) {
  const { w: wPx, h: hPx } = SIZE_PX[typeKey];
  const w = px2in(wPx), h = px2in(hPx);
  const root = groupRootCells(w, h) + userSection(w, h) + connectionSection(w, h);
  // Marker geometries on the Group root, NoShow='1'.  Order matches
  // ROOT_MARKER_IX_MAP in exportVisioV3.ts: Error=0, Cancel=1, Conditional=2.
  const markers =
    errorMarkerGeom(w, h, 0) +
    cancelMarkerGeom(w, h, 1) +
    conditionalMarkerGeom(w, h, 2);
  const body = bodyShapeOpen(6, w, h, COLOURS[typeKey], { lineWeightPt }) +
    fullCircleGeom(w, h, 0) + `</Shape>`;
  return masterXml(root, markers, body);
}

function buildIntermediateEvent() {
  const { w: wPx, h: hPx } = SIZE_PX["intermediate-event"];
  const w = px2in(wPx), h = px2in(hPx);
  const root = groupRootCells(w, h) + userSection(w, h) + connectionSection(w, h);
  const markers =
    errorMarkerGeom(w, h, 0) +
    cancelMarkerGeom(w, h, 1) +
    conditionalMarkerGeom(w, h, 2);
  // Outer ring on Shape 6 (filled, stroke 1.5pt).  Inner ring on Shape 7
  // (NoFill, stroke 1.125pt) at 3 px inset from the outer.
  const outer = bodyShapeOpen(6, w, h, COLOURS["intermediate-event"], { lineWeightPt: 1.5 }) +
    fullCircleGeom(w, h, 0) + `</Shape>`;
  const inner = bodyShapeOpen(7, w, h, COLOURS["intermediate-event"], {
    lineWeightPt: 1.125,
    noFill: true,
  }) + innerCircleGeom(w, h, 3, 0, GEOM_PROPS_NOFILL) + `</Shape>`;
  return masterXml(root, markers, outer + inner);
}

function buildEndEvent() {
  const { w: wPx, h: hPx } = SIZE_PX["end-event"];
  const w = px2in(wPx), h = px2in(hPx);
  const root = groupRootCells(w, h) + userSection(w, h) + connectionSection(w, h);
  const markers =
    errorMarkerGeom(w, h, 0) +
    cancelMarkerGeom(w, h, 1) +
    conditionalMarkerGeom(w, h, 2);
  // Single thick-stroke circle (3.5px ≈ 2.625pt).
  const body = bodyShapeOpen(6, w, h, COLOURS["end-event"], { lineWeightPt: 2.625 }) +
    fullCircleGeom(w, h, 0) + `</Shape>`;
  return masterXml(root, markers, body);
}

function buildStartEvent() {
  const { w: wPx, h: hPx } = SIZE_PX["start-event"];
  const w = px2in(wPx), h = px2in(hPx);
  const root = groupRootCells(w, h) + userSection(w, h) + connectionSection(w, h);
  const markers =
    errorMarkerGeom(w, h, 0) +
    cancelMarkerGeom(w, h, 1) +
    conditionalMarkerGeom(w, h, 2);
  const body = bodyShapeOpen(6, w, h, COLOURS["start-event"], { lineWeightPt: 0.9 }) +
    fullCircleGeom(w, h, 0) + `</Shape>`;
  return masterXml(root, markers, body);
}

// "+" marker rect drawn on top of a Subprocess collapsed body.
// Mirrors SymbolRenderer.tsx subprocess (line 844–886): 14×14 white square
// with a centred "+" stroke, parked at bottom-centre 3 px above the bottom.
function plusMarkerSubShape(id, parentW, parentH) {
  const mw = 14, mh = 14;
  const margin = 3;
  // Centre of the 14×14 rect, in master coords (Visio Y bottom-up).
  // Screen y = parentH - mh - margin, mh height = 14, so centre y =
  // parentH - margin - mh/2.  Visio y = mh/2 + margin (from bottom).
  const cxFrac = 0.5;
  const cyFrac = (margin + mh / 2) / (parentH * PX); // px → fraction of parent height in inches
  // PinX/Y in inches.
  const pinX = parentW * cxFrac;
  const pinY = parentH * cyFrac;
  const wIn = px2in(mw);
  const hIn = px2in(mh);
  // Marker rect: white fill, gray stroke, plus the two inner crossbars.
  return (
    `<Shape ID='${id}' Type='Shape' LineStyle='3' FillStyle='3' TextStyle='3'>` +
    `<Cell N='PinX' V='${pinX.toFixed(7)}' U='MM' F='Sheet.5!Width*${cxFrac.toFixed(7)}'/>` +
    `<Cell N='PinY' V='${pinY.toFixed(7)}' U='MM' F='Sheet.5!Height*${cyFrac.toFixed(7)}'/>` +
    `<Cell N='Width' V='${wIn.toFixed(7)}' U='MM' F='${wIn.toFixed(7)}*25.4MM'/>` +
    `<Cell N='Height' V='${hIn.toFixed(7)}' U='MM' F='${hIn.toFixed(7)}*25.4MM'/>` +
    `<Cell N='LocPinX' V='${(wIn/2).toFixed(7)}' U='MM' F='Width*0.5'/>` +
    `<Cell N='LocPinY' V='${(hIn/2).toFixed(7)}' U='MM' F='Height*0.5'/>` +
    `<Cell N='Angle' V='0'/><Cell N='FlipX' V='0'/><Cell N='FlipY' V='0'/>` +
    `<Cell N='ResizeMode' V='0'/>` +
    `<Cell N='LayerMember' V='0'/>` +
    fillCells("#ffffff") +
    `<Cell N='LineWeight' V='${(1/72).toFixed(7)}' U='PT' F='GUARD(0.75PT)'/>` +
    `<Cell N='LinePattern' V='1' F='GUARD(1)'/>` +
    `<Cell N='LineColor' V='#c0c0c0' F='GUARD(RGB(192,192,192))'/>` +
    `<Cell N='Rounding' V='${px2in(2).toFixed(7)}' U='MM' F='GUARD(${px2in(2).toFixed(7)}*25.4MM)'/>` +
    `<Cell N='LockTextEdit' V='1'/>` +
    // Geometry IX=0: the white rect.
    rectGeom(wIn, hIn, 0) +
    // Geometry IX=1: vertical crossbar (NoFill).
    `<Section N='Geometry' IX='1'>` + GEOM_PROPS_NOFILL +
      vertexRow("MoveTo", 1, wIn, hIn, 0.5, 3 / mh) +
      vertexRow("LineTo", 2, wIn, hIn, 0.5, 1 - 3 / mh) +
    `</Section>` +
    // Geometry IX=2: horizontal crossbar (NoFill).
    `<Section N='Geometry' IX='2'>` + GEOM_PROPS_NOFILL +
      vertexRow("MoveTo", 1, wIn, hIn, 3 / mw, 0.5) +
      vertexRow("LineTo", 2, wIn, hIn, 1 - 3 / mw, 0.5) +
    `</Section>` +
    `</Shape>`
  );
}

function buildSubprocessCollapsed() {
  const { w: wPx, h: hPx } = SIZE_PX.subprocess;
  const w = px2in(wPx), h = px2in(hPx);
  const root = groupRootCells(w, h) + userSection(w, h) + connectionSection(w, h);
  const body = bodyShapeOpen(6, w, h, COLOURS.subprocess, { lineWeightPt: 1.125, roundingPx: 4 }) +
    rectGeom(w, h) + `</Shape>`;
  const plus = plusMarkerSubShape(7, w, h);
  return masterXml(root, "", body + plus);
}

function buildSubprocessExpanded() {
  const { w: wPx, h: hPx } = SIZE_PX["subprocess-expanded"];
  const w = px2in(wPx), h = px2in(hPx);
  const root = groupRootCells(w, h) + userSection(w, h) + connectionSection(w, h);
  const body = bodyShapeOpen(6, w, h, COLOURS["subprocess-expanded"], { lineWeightPt: 1.125, roundingPx: 4 }) +
    rectGeom(w, h) + `</Shape>`;
  return masterXml(root, "", body);
}

function buildDataObject() {
  const { w: wPx, h: hPx } = SIZE_PX["data-object"];
  const w = px2in(wPx), h = px2in(hPx);
  const foldPx = Math.round(wPx * 0.28);
  const foldIn = px2in(foldPx);
  const root = groupRootCells(w, h) + userSection(w, h) + connectionSection(w, h);
  // Body polygon (Geometry IX=0) + fold triangle on a separate sub-shape
  // so it can have its own slightly-darker fill.
  const body = bodyShapeOpen(6, w, h, COLOURS["data-object"], { lineWeightPt: 1.125 }) +
    dataObjectBodyGeom(w, h, foldIn, 0) + `</Shape>`;
  // Fold colour: derive a darker tint of the body colour (mirrors the
  // SymbolRenderer fallback `#bfdbfe → #93c5fd`).
  const foldColour = "#93c5fd";
  const fold = bodyShapeOpen(7, w, h, foldColour, { lineWeightPt: 1.125 }) +
    dataObjectFoldGeom(w, h, foldIn, 0) + `</Shape>`;
  return masterXml(root, "", body + fold);
}

function buildDataStore() {
  const { w: wPx, h: hPx } = SIZE_PX["data-store"];
  const w = px2in(wPx), h = px2in(hPx);
  const ryPx = Math.max(4, Math.round(hPx * 0.15));
  const ryIn = px2in(ryPx);
  const root = groupRootCells(w, h) + userSection(w, h) + connectionSection(w, h);
  // Body Shape carries: Geom IX=0 cylinder body (filled), IX=1 top ellipse
  // (filled), IX=2/3 stroke arcs for the disc lines.
  const body = bodyShapeOpen(6, w, h, COLOURS["data-store"], { lineWeightPt: 1.125 }) +
    cylinderBodyGeom(w, h, ryIn, 0) +
    cylinderTopGeom(w, h, ryIn, 1) +
    cylinderBottomCurveGeom(w, h, ryIn, 1 - (ryPx + 5) / hPx, 2) +
    cylinderBottomCurveGeom(w, h, ryIn, 1 - (ryPx + 10) / hPx, 3) +
    `</Shape>`;
  return masterXml(root, "", body);
}

// ── Pool/Lane bake (Master 18 → master16.xml) ────────────────────────
// BPMN_M's Pool/Lane master has THREE FillForegnd THEMEVAL("FillColor",1)
// cells in file order:
//   1. Shape 5 (Group root)     — invisible (Shape 6 covers it)
//   2. Shape 6 (lane body)      — paints the lane interior
//   3. Shape 8 (heading sidebar)— paints the rotated pool/lane name column
// Bake the heading (last) with the Diagramatix pool tan and the lane body
// (middle) with the lane tan, leaving the root untouched (it's hidden).
// Mirrors exportVisioV3.ts:1859-1866 (which targets only Shape 8 at runtime).
function bakePoolLane(xml) {
  const poolColour = COLOURS.pool;
  const { r: pr, g: pg, b: pb } = hexToRgb(poolColour);
  const laneColour = COLOURS.lane;
  const { r: lr, g: lg, b: lb } = hexToRgb(laneColour);

  const needle = `N='FillForegnd' V='1' F='THEMEVAL("FillColor",1)'`;
  const poolReplace = `N='FillForegnd' V='${poolColour}' F='RGB(${pr},${pg},${pb})'`;
  const laneReplace = `N='FillForegnd' V='${laneColour}' F='RGB(${lr},${lg},${lb})'`;

  // 1. Shape 8 (heading sidebar) — LAST occurrence → pool tan.
  const lastIdx = xml.lastIndexOf(needle);
  if (lastIdx !== -1) {
    xml = xml.slice(0, lastIdx) + poolReplace + xml.slice(lastIdx + needle.length);
  }
  // 2. Shape 6 (lane body) — second occurrence (the one between Shape 5 and
  //    the now-replaced Shape 8) → lane tan.
  const firstIdx = xml.indexOf(needle);
  const secondIdx = firstIdx === -1 ? -1 : xml.indexOf(needle, firstIdx + needle.length);
  if (secondIdx !== -1) {
    xml = xml.slice(0, secondIdx) + laneReplace + xml.slice(secondIdx + needle.length);
  }
  return xml;
}

// ── Main ──────────────────────────────────────────────────────────────

(async () => {
  if (!fs.existsSync(SRC)) {
    console.error(`Source stencil not found: ${SRC}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(SRC);
  const zip = await JSZip.loadAsync(buf);

  // ── docProps: relabel ────────────────────────────────────────────
  let core = await zip.file("docProps/core.xml").async("string");
  core = core
    .replace(/<dc:title>[^<]*<\/dc:title>/, "<dc:title>BPMN Diagramatix Shapes v1.3</dc:title>")
    .replace(
      /<dc:description>[^<]*<\/dc:description>/,
      "<dc:description>BPMN shapes for Diagramatix v1.3 — author or edit BPMN diagrams in Visio that import cleanly back into Diagramatix. Diagramatix-native geometry, sizes, and colours.</dc:description>",
    );
  zip.file("docProps/core.xml", core);

  let app = await zip.file("docProps/app.xml").async("string");
  app = app.replace(
    /<Template>[^<]*<\/Template>/,
    "<Template>BPMN Diagramatix Shapes v1.3.vssx</Template>",
  );
  zip.file("docProps/app.xml", app);

  // ── Replace each Diagramatix-symbol master ────────────────────────
  const REPLACEMENTS = [
    { masterFile: "master1.xml",  type: "task",                builder: buildTask },
    { masterFile: "master2.xml",  type: "gateway",             builder: buildGateway },
    { masterFile: "master3.xml",  type: "intermediate-event",  builder: buildIntermediateEvent },
    { masterFile: "master4.xml",  type: "end-event",           builder: buildEndEvent },
    { masterFile: "master5.xml",  type: "start-event",         builder: buildStartEvent },
    { masterFile: "master6.xml",  type: "subprocess",          builder: buildSubprocessCollapsed },
    { masterFile: "master7.xml",  type: "subprocess-expanded", builder: buildSubprocessExpanded },
    { masterFile: "master13.xml", type: "data-object",         builder: buildDataObject },
    { masterFile: "master14.xml", type: "data-store",          builder: buildDataStore },
  ];
  for (const { masterFile, type, builder } of REPLACEMENTS) {
    const xml = builder();
    zip.file(`visio/masters/${masterFile}`, xml);
  }

  // ── Pool/Lane colour bake (Master 18 → master16.xml) ──────────────
  const poolPath = "visio/masters/master16.xml";
  const poolXml = await zip.file(poolPath).async("string");
  zip.file(poolPath, bakePoolLane(poolXml));

  // ── Force IconUpdate='1' on every replaced master so Visio refreshes
  //    the stencil-pane thumbnail from the new geometry on first open.
  let mastersXml = await zip.file("visio/masters/masters.xml").async("string");
  for (const id of [2, 4, 5, 6, 7, 8, 9, 15, 16, 18]) {
    const re = new RegExp(`(<Master\\s+ID='${id}'[^>]*?)IconUpdate='\\d+'`);
    mastersXml = mastersXml.replace(re, "$1IconUpdate='1'");
  }
  zip.file("visio/masters/masters.xml", mastersXml);

  // ── Write output ──────────────────────────────────────────────────
  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  fs.writeFileSync(DST, out);

  console.log(`Wrote ${DST} (${(out.length / 1024).toFixed(1)} KiB)`);
  console.log(`Replaced ${REPLACEMENTS.length} masters from scratch:`);
  for (const r of REPLACEMENTS) console.log(`  · ${r.type} (${COLOURS[r.type]}) → ${r.masterFile}`);
  console.log(`Pool/Lane (master16.xml): pool ${COLOURS.pool}, lane ${COLOURS.lane} baked.`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
