/**
 * T4663–T4665 — the Canvas Help card draws the real cursors.
 *
 * Paul, 22 September 2026, on the first version of the card:
 *
 *   "The icons do not match closely enough to the real cursor shapes.
 *    1. open hand has thumb on the wrong side. The fingers are bigger and
 *       slightly spread.
 *    2. The Grab cursor is shown grabbing with the palm towards the user. On
 *       the canvas it grabs with the back of the hand towards the user.
 *    3. the Pool cursor is the wrong shaped arrow.
 *    4. The pointer looks great!!!
 *    5. the ew-resize and ns-resize need improvement. They should be thicker
 *       and in the same colour as the Hand icons.
 *    6. Corner resize cursors are missing.
 *    7. Scroll when over a panel resizes all panels around the canvas is
 *       missing."
 *
 * Emoji are drawings OF hands and arrows in their own style; the cursors are
 * white shapes with a black outline. So the card now draws them that way, in
 * `CursorIcon` — every cursor except the pointer, which Paul wanted kept.
 *
 * Item 7 is recorded honestly: no Diagramatix code resizes the panels. The
 * canvas keeps scroll for its own zoom; over a panel, Ctrl + scroll or a pinch
 * falls through to the BROWSER, which zooms the whole page. The card says so.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CursorIcon, DRAWN_CURSORS } from "@/app/components/canvas/CursorIcon";
import { POINTER_PROTOCOL, type CursorName } from "@/app/lib/canvas/pointerProtocol";

const render = (name: CursorName) => renderToStaticMarkup(createElement(CursorIcon, { name, size: 18 }));
const hoverRows = () => POINTER_PROTOCOL.flatMap((s) => s.hover ?? []);
const CANVAS = readFileSync(join(process.cwd(), "app", "components", "canvas", "Canvas.tsx"), "utf8");

describe("T4663 — every cursor on the card is drawn, except the pointer", () => {
  it("draws each one as an SVG", () => {
    for (const row of hoverRows()) {
      if (row.cursor === "pointer") continue;
      expect(DRAWN_CURSORS, `${row.cursor} is not drawn`).toContain(row.cursor);
      expect(render(row.cursor), row.cursor).toMatch(/^<svg /);
    }
  });

  it("keeps the pointer as the emoji Paul liked", () => {
    expect(render("pointer")).toContain("👆");
    expect(render("pointer")).not.toMatch(/<svg/);
  });

  it("draws them in the cursors' own colours: white, outlined in black", () => {
    for (const name of ["grab", "grabbing", "default", "ew-resize", "ns-resize", "nw-resize", "ne-resize"] as const) {
      const svg = render(name);
      expect(svg, `${name} fill`).toMatch(/fill="#ffffff"/);
      expect(svg, `${name} outline`).toMatch(/stroke="#111111"/);
    }
  });

  it("the card uses the drawings, not the glyphs", () => {
    expect(CANVAS).toMatch(/<CursorIcon name=\{row\.cursor\} \/>/);
    expect(CANVAS).not.toMatch(/\{CURSOR_GLYPH\[row\.cursor\]\}/);
  });
});

describe("T4664 — the hands are the right hands", () => {
  /** The x of each rect's own origin, in drawing order. */
  const rectXs = (svg: string) => [...svg.matchAll(/<rect x="([\d.]+)"/g)].map((m) => Number(m[1]));

  it("the open hand's thumb is on the LEFT of its fingers", () => {
    const xs = rectXs(render("grab"));
    // Four fingers, then the thumb.
    expect(xs).toHaveLength(5);
    const [index, , , little, thumb] = xs;
    expect(thumb, "thumb must sit left of the index finger").toBeLessThan(index);
    expect(little, "the little finger is the right-most").toBeGreaterThan(index);
  });

  it("its four fingers are spread — tilted apart, not parallel", () => {
    const tilts = [...render("grab").matchAll(/rotate\((-?[\d.]+) /g)].slice(0, 4).map((m) => Number(m[1]));
    expect(tilts[0], "index leans left").toBeLessThan(0);
    expect(tilts[3], "little finger leans right").toBeGreaterThan(0);
  });

  it("the closed hand shows the BACK: knuckles along the top, thumb on the left", () => {
    const svg = render("grabbing");
    const xs = rectXs(svg);
    expect(xs).toHaveLength(5);                                   // four knuckles, one thumb
    expect(xs[4], "thumb left of the first knuckle").toBeLessThan(xs[0]);
    // Knuckles are SHORT — curled fingers, not raised ones.
    const heights = [...svg.matchAll(/<rect [^>]*height="([\d.]+)"/g)].slice(0, 4).map((m) => Number(m[1]));
    for (const h of heights) expect(h).toBeLessThan(7);
  });

  it("the thumb is drawn before the hand, so it reads as attached", () => {
    // Drawn after, it floats on top as a separate blob — the first version.
    const svg = render("grabbing");
    const thumbAt = svg.indexOf('transform="rotate(-24');
    const backAt = svg.indexOf('<path d="M6.6 9.6');
    expect(thumbAt).toBeGreaterThan(-1);
    expect(thumbAt).toBeLessThan(backAt);
  });
});

describe("T4665 — the rows Paul found missing", () => {
  it("has both corner handles", () => {
    const rows = hoverRows();
    expect(rows.find((r) => /top-left or bottom-right corner/.test(r.over))?.cursor).toBe("nw-resize");
    expect(rows.find((r) => /top-right or bottom-left corner/.test(r.over))?.cursor).toBe("ne-resize");
  });

  it("gives the left/right and top/bottom edges their own rows", () => {
    const rows = hoverRows();
    expect(rows.find((r) => /left or right edge/.test(r.over))?.cursor).toBe("ew-resize");
    expect(rows.find((r) => /top or bottom edge/.test(r.over))?.cursor).toBe("ns-resize");
  });

  it("explains the panel-resizing scroll — as the browser's, not ours", () => {
    const zoom = POINTER_PROTOCOL.find((s) => s.heading === "Zooming");
    expect(zoom, "no Zooming section").toBeTruthy();
    const panel = zoom!.gestures!.find((g) => /over a panel/.test(g.does));
    expect(panel?.result).toMatch(/BROWSER/);
    expect(panel?.note).toMatch(/Ctrl \+ 0/);
  });

  it("…which is true: nothing in the canvas resizes panels on scroll", () => {
    // The only wheel handler zooms the diagram. If that ever changes, this
    // card entry is wrong and must change with it.
    const wheel = CANVAS.slice(CANVAS.indexOf("function handleWheel"), CANVAS.indexOf("function handleWheel") + 600);
    expect(wheel).toMatch(/setZoom\(newZoom\)/);
    expect(CANVAS.match(/function handleWheel/g)).toHaveLength(1);
  });
});
